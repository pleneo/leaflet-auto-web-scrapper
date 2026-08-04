import { request as requestHttp, type Agent as HttpAgent, Agent } from 'node:http';
import {
  request as requestHttps,
  type Agent as HttpsAgent,
  Agent as SecureAgent,
} from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { DownloadedLeafletPdf, LeafletPdfHttpClient } from './leaflet-pdf-storage';

const MAX_REDIRECTS = 5;

export class FetchLeafletPdfHttpClient implements LeafletPdfHttpClient {
  private readonly httpAgent: HttpAgent;

  private readonly httpsAgent: HttpsAgent;

  constructor() {
    this.httpAgent = new Agent({
      keepAlive: true,
    });
    this.httpsAgent = new SecureAgent({
      keepAlive: true,
    });
  }

  async downloadPdf(url: string): Promise<DownloadedLeafletPdf> {
    return this.downloadPdfWithRedirects(new URL(url), 0);
  }

  private async downloadPdfWithRedirects(
    url: URL,
    redirectCount: number,
  ): Promise<DownloadedLeafletPdf> {
    const response = await this.request(url);

    if (isRedirectStatus(response.statusCode) && response.location !== null) {
      if (redirectCount >= MAX_REDIRECTS) {
        throw new Error('Failed to download leaflet PDF: too many redirects.');
      }

      return this.downloadPdfWithRedirects(new URL(response.location, url), redirectCount + 1);
    }

    if (response.statusCode < 200 || response.statusCode > 299) {
      throw new Error(
        `Failed to download leaflet PDF: ${String(response.statusCode)} ${response.statusMessage}`,
      );
    }

    const contentType = parsePdfContentType(response.contentType, url);

    if (response.body.byteLength === 0) {
      throw new Error('Downloaded leaflet PDF cannot be empty.');
    }

    return {
      body: response.body,
      contentType,
    };
  }

  private request(url: URL): Promise<LeafletPdfHttpResponse> {
    return new Promise((resolve, reject) => {
      const transport = url.protocol === 'http:' ? requestHttp : requestHttps;
      const agent = url.protocol === 'http:' ? this.httpAgent : this.httpsAgent;
      const request = transport(
        url,
        {
          agent,
          method: 'GET',
        },
        (response) => {
          readResponse(response).then(resolve).catch(reject);
        },
      );

      request.on('error', reject);
      request.end();
    });
  }
}

interface LeafletPdfHttpResponse {
  readonly statusCode: number;
  readonly statusMessage: string;
  readonly location: string | null;
  readonly contentType: string | null;
  readonly body: Uint8Array;
}

function readResponse(response: IncomingMessage): Promise<LeafletPdfHttpResponse> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    response.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    response.on('end', () => {
      resolve({
        statusCode: response.statusCode ?? 0,
        statusMessage: response.statusMessage ?? '',
        location: parseSingleHeader(response.headers.location),
        contentType: parseSingleHeader(response.headers['content-type']),
        body: new Uint8Array(Buffer.concat(chunks)),
      });
    });
    response.on('error', reject);
  });
}

function parseSingleHeader(value: string | readonly string[] | undefined): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (isStringArray(value)) {
    return value[0] ?? null;
  }

  return null;
}

function isStringArray(value: string | readonly string[] | undefined): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isRedirectStatus(statusCode: number): boolean {
  return (
    statusCode === 301 ||
    statusCode === 302 ||
    statusCode === 303 ||
    statusCode === 307 ||
    statusCode === 308
  );
}

function parsePdfContentType(value: string | null, url: URL): 'application/pdf' {
  const contentType = value?.split(';')[0]?.trim().toLowerCase();

  if (contentType === 'application/pdf') {
    return 'application/pdf';
  }

  if (url.pathname.toLowerCase().endsWith('.pdf')) {
    return 'application/pdf';
  }

  throw new Error(`Unsupported leaflet PDF content type: ${value ?? 'missing'}.`);
}
