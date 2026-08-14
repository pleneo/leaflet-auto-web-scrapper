import { describe, expect, it, vi } from 'vitest';
import { FetchLeafletImageHttpClient } from './fetch-leaflet-image-http-client';

describe('FetchLeafletImageHttpClient', () => {
  it('downloads image/jpg responses as jpeg leaflet images', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Uint8Array.of(1, 2, 3), {
        status: 200,
        headers: {
          'Content-Type': 'image/jpg',
        },
      }),
    );
    const client = new FetchLeafletImageHttpClient();

    await expect(client.downloadImage('https://cdn.example.com/page/original')).resolves.toEqual({
      body: Uint8Array.of(1, 2, 3),
      contentType: 'image/jpeg',
    });

    fetcher.mockRestore();
  });

  it('reports failed URLs and rejects empty image bodies', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('', {
        status: 403,
        statusText: 'Forbidden',
      }),
    );
    const client = new FetchLeafletImageHttpClient();

    await expect(client.downloadImage('https://cdn.example.com/forbidden')).rejects.toThrow(
      'Failed to download leaflet image from https://cdn.example.com/forbidden: 403 Forbidden',
    );

    fetcher.mockResolvedValueOnce(
      new Response(new Uint8Array(), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
        },
      }),
    );

    await expect(client.downloadImage('https://cdn.example.com/empty.png')).rejects.toThrow(
      'Downloaded leaflet image cannot be empty.',
    );

    fetcher.mockRestore();
  });
});
