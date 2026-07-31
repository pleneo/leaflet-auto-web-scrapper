import type { DownloadedLeafletPdf, LeafletPdfHttpClient } from './leaflet-pdf-storage';

export class FetchLeafletPdfHttpClient implements LeafletPdfHttpClient {
  async downloadPdf(url: string): Promise<DownloadedLeafletPdf> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to download leaflet PDF: ${String(response.status)} ${response.statusText}`,
      );
    }

    const contentType = parsePdfContentType(response.headers.get('content-type'), url);
    const body = new Uint8Array(await response.arrayBuffer());

    if (body.byteLength === 0) {
      throw new Error('Downloaded leaflet PDF cannot be empty.');
    }

    return {
      body,
      contentType,
    };
  }
}

function parsePdfContentType(value: string | null, url: string): 'application/pdf' {
  const contentType = value?.split(';')[0]?.trim().toLowerCase();

  if (contentType === 'application/pdf') {
    return 'application/pdf';
  }

  if (new URL(url).pathname.toLowerCase().endsWith('.pdf')) {
    return 'application/pdf';
  }

  throw new Error(`Unsupported leaflet PDF content type: ${value ?? 'missing'}.`);
}
