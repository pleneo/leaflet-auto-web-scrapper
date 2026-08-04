import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FetchLeafletPdfHttpClient } from './fetch-leaflet-pdf-http-client';

describe('FetchLeafletPdfHttpClient', () => {
  let server: TestHttpServer;

  beforeEach(async () => {
    server = await startTestHttpServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('reuses the same HTTP connection for sequential PDF downloads', async () => {
    const client = new FetchLeafletPdfHttpClient();

    const firstPdf = await client.downloadPdf(`${server.baseUrl}/leaflet-a.pdf`);
    const secondPdf = await client.downloadPdf(`${server.baseUrl}/leaflet-b.pdf`);

    expect(firstPdf).toEqual({
      body: Uint8Array.of(1, 2, 3),
      contentType: 'application/pdf',
    });
    expect(secondPdf).toEqual({
      body: Uint8Array.of(4, 5, 6),
      contentType: 'application/pdf',
    });
    expect(server.uniqueRemotePorts()).toHaveLength(1);
  });

  it('follows redirects before validating the final PDF response', async () => {
    const client = new FetchLeafletPdfHttpClient();

    const pdf = await client.downloadPdf(`${server.baseUrl}/redirect`);

    expect(pdf).toEqual({
      body: Uint8Array.of(7, 8, 9),
      contentType: 'application/pdf',
    });
  });

  it('rejects non-PDF responses', async () => {
    const client = new FetchLeafletPdfHttpClient();

    await expect(client.downloadPdf(`${server.baseUrl}/json`)).rejects.toThrow(
      'Unsupported leaflet PDF content type: application/json.',
    );
  });
});

interface TestHttpServer {
  readonly baseUrl: string;
  uniqueRemotePorts(): readonly number[];
  close(): Promise<void>;
}

function startTestHttpServer(): Promise<TestHttpServer> {
  return new Promise((resolve) => {
    const remotePorts: number[] = [];
    const server = createServer((request, response) => {
      const remotePort = request.socket.remotePort;

      if (remotePort !== undefined) {
        remotePorts.push(remotePort);
      }

      handleRequest(request, response);
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (address === null || typeof address === 'string') {
        throw new Error('Expected HTTP test server to expose a TCP address.');
      }

      resolve({
        baseUrl: `http://127.0.0.1:${String(address.port)}`,
        uniqueRemotePorts: () => [...new Set(remotePorts)],
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error !== undefined) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          }),
      });
    });
  });
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  if (request.url === '/leaflet-a.pdf') {
    writePdf(response, Uint8Array.of(1, 2, 3));
    return;
  }

  if (request.url === '/leaflet-b.pdf') {
    writePdf(response, Uint8Array.of(4, 5, 6));
    return;
  }

  if (request.url === '/redirect') {
    response.writeHead(302, {
      Location: '/redirected.pdf',
    });
    response.end();
    return;
  }

  if (request.url === '/redirected.pdf') {
    writePdf(response, Uint8Array.of(7, 8, 9));
    return;
  }

  if (request.url === '/json') {
    response.writeHead(200, {
      'Content-Type': 'application/json',
    });
    response.end('{}');
    return;
  }

  response.writeHead(404);
  response.end();
}

function writePdf(response: ServerResponse, body: Uint8Array): void {
  response.writeHead(200, {
    'Content-Type': 'application/pdf',
  });
  response.end(body);
}
