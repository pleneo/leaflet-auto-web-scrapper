import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LeafletExtractionResult } from '../../domain/leaflet/extracted-leaflet';
import {
  LeafletImageStorageError,
  LocalLeafletImageStorage,
  type DownloadedLeafletImage,
  type LeafletImageHttpClient,
} from './leaflet-image-storage';

describe('LocalLeafletImageStorage', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'leaflet-images-'));
  });

  afterEach(async () => {
    await rm(rootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('downloads and stores every extracted leaflet image', async () => {
    const httpClient = new FakeLeafletImageHttpClient();
    const storage = new LocalLeafletImageStorage(httpClient);

    const stored = await storage.store({
      rootDirectory,
      result: createExtractionResult(),
    });

    expect(httpClient.downloadedUrls).toEqual([
      'https://cdn.example.com/page-1.png',
      'https://cdn.example.com/page-2.jpeg',
      'https://cdn.example.com/page-3.webp',
    ]);
    expect(stored.metadataPath).toBe(join(rootDirectory, 'carnauba/2026-07-17/metadata.json'));
    expect(stored.leaflets).toHaveLength(2);
    expect(await readFile(stored.leaflets[0]?.images[0]?.filePath ?? '')).toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(await readFile(stored.leaflets[0]?.images[1]?.filePath ?? '')).toEqual(
      Buffer.from([4, 5]),
    );
    expect(await readFile(stored.leaflets[1]?.images[0]?.filePath ?? '')).toEqual(Buffer.from([6]));
    expect(await readFile(stored.metadataPath, 'utf8')).toContain('"supermarketId": "carnauba"');
  });

  it('rejects invalid storage input', async () => {
    const storage = new LocalLeafletImageStorage(new FakeLeafletImageHttpClient());

    await expect(
      storage.store({
        rootDirectory: ' ',
        result: createExtractionResult(),
      }),
    ).rejects.toThrow(LeafletImageStorageError);

    await expect(
      storage.store({
        rootDirectory,
        result: {
          ...createExtractionResult(),
          extractedAtIso: 'invalid-date',
        },
      }),
    ).rejects.toThrow(LeafletImageStorageError);

    await expect(
      storage.store({
        rootDirectory,
        result: {
          ...createExtractionResult(),
          extractedAtIso: '2026-99-99T10:00:00.000Z',
        },
      }),
    ).rejects.toThrow(LeafletImageStorageError);
  });
});

function createExtractionResult(): LeafletExtractionResult {
  return {
    supermarketId: 'carnauba',
    sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
    extractedAtIso: '2026-07-17T10:00:00.000Z',
    leaflets: [
      {
        leafletId: '1-sao-joao',
        title: 'São João',
        cardIndex: 0,
        coverImageUrl: 'https://cdn.example.com/cover-1.png',
        images: [
          {
            order: 1,
            imageUrl: 'https://cdn.example.com/page-1.png',
          },
          {
            order: 2,
            imageUrl: 'https://cdn.example.com/page-2.jpeg',
          },
        ],
      },
      {
        leafletId: '2-carnaubar',
        title: 'Carnaubar',
        cardIndex: 1,
        coverImageUrl: 'https://cdn.example.com/cover-2.jpeg',
        images: [
          {
            order: 1,
            imageUrl: 'https://cdn.example.com/page-3.webp',
          },
        ],
      },
    ],
  };
}

class FakeLeafletImageHttpClient implements LeafletImageHttpClient {
  readonly downloadedUrls: string[] = [];

  downloadImage(url: string): Promise<DownloadedLeafletImage> {
    this.downloadedUrls.push(url);

    switch (url) {
      case 'https://cdn.example.com/page-1.png':
        return Promise.resolve({
          body: Uint8Array.of(1, 2, 3),
          contentType: 'image/png',
        });
      case 'https://cdn.example.com/page-2.jpeg':
        return Promise.resolve({
          body: Uint8Array.of(4, 5),
          contentType: 'image/jpeg',
        });
      case 'https://cdn.example.com/page-3.webp':
        return Promise.resolve({
          body: Uint8Array.of(6),
          contentType: 'image/webp',
        });
      default:
        return Promise.reject(new Error('Unexpected fake image URL.'));
    }
  }
}
