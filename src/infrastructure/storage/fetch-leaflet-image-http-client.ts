import type {
  DownloadedLeafletImage,
  LeafletImageContentType,
  LeafletImageHttpClient,
} from './leaflet-image-storage';

export class FetchLeafletImageHttpClient implements LeafletImageHttpClient {
  async downloadImage(url: string): Promise<DownloadedLeafletImage> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to download leaflet image: ${String(response.status)} ${response.statusText}`,
      );
    }

    const contentType = parseImageContentType(response.headers.get('content-type'), url);
    const body = new Uint8Array(await response.arrayBuffer());

    if (body.byteLength === 0) {
      throw new Error('Downloaded leaflet image cannot be empty.');
    }

    return {
      body,
      contentType,
    };
  }
}

function parseImageContentType(value: string | null, url: string): LeafletImageContentType {
  const contentType = value?.split(';')[0]?.trim().toLowerCase();

  switch (contentType) {
    case 'image/jpeg':
    case 'image/png':
    case 'image/webp':
      return contentType;
    default:
      return parseImageContentTypeFromUrl(url, value);
  }
}

function parseImageContentTypeFromUrl(
  url: string,
  originalContentType: string | null,
): LeafletImageContentType {
  const pathName = new URL(url).pathname.toLowerCase();

  if (pathName.endsWith('.jpg') || pathName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (pathName.endsWith('.png')) {
    return 'image/png';
  }

  if (pathName.endsWith('.webp')) {
    return 'image/webp';
  }

  throw new Error(`Unsupported leaflet image content type: ${originalContentType ?? 'missing'}.`);
}
