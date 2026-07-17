import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CarnaubaApiExtractionResult } from '../scrapers/carnauba/carnauba-api-extraction';
import {
  CarnaubaApiLeafletStorageError,
  LocalCarnaubaApiLeafletStorage,
} from './carnauba-api-leaflet-storage';
import type { DownloadedLeafletImage, LeafletImageHttpClient } from './leaflet-image-storage';

describe('LocalCarnaubaApiLeafletStorage', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'carnauba-api-storage-'));
  });

  afterEach(async () => {
    await rm(rootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('stores multi-store leaflet images and metadata', async () => {
    const storage = new LocalCarnaubaApiLeafletStorage(new FakeImageHttpClient());

    const stored = await storage.store({
      rootDirectory,
      result: createResult(),
    });

    expect(stored.directoryPath).toBe(join(rootDirectory, 'carnauba/2026-07-17'));
    expect(stored.stores).toHaveLength(2);
    expect(stored.stores[0]?.leaflets[0]?.images[0]?.filePath).toBe(
      join(
        rootDirectory,
        'carnauba/2026-07-17/stores/79-carnauba-maestro/leaflets/69362-1-sao-joao/001.png',
      ),
    );
    expect(await readFile(stored.stores[0]?.leaflets[0]?.images[0]?.filePath ?? '')).toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(stored.stores[0]?.leaflets[0]?.images[1]?.filePath.endsWith('002.jpg')).toBe(true);
    expect(stored.stores[0]?.leaflets[0]?.images[2]?.filePath.endsWith('003.webp')).toBe(true);
    expect(stored.stores[1]?.directoryPath.endsWith('/80-store')).toBe(true);
    expect(await readFile(stored.metadataPath, 'utf8')).toContain('"source": "mercadapp-api"');
    expect(await readFile(stored.stores[0]?.metadataPath ?? '', 'utf8')).toContain('"storeId": 79');
  });

  it('rejects invalid storage input', async () => {
    const storage = new LocalCarnaubaApiLeafletStorage(new FakeImageHttpClient());

    await expect(
      storage.store({
        rootDirectory: ' ',
        result: createResult(),
      }),
    ).rejects.toThrow(CarnaubaApiLeafletStorageError);

    await expect(
      storage.store({
        rootDirectory,
        result: {
          ...createResult(),
          extractedAtIso: 'invalid-date',
        },
      }),
    ).rejects.toThrow(CarnaubaApiLeafletStorageError);

    await expect(
      storage.store({
        rootDirectory,
        result: {
          ...createResult(),
          extractedAtIso: '2026-99-99T10:00:00.000Z',
        },
      }),
    ).rejects.toThrow(CarnaubaApiLeafletStorageError);
  });
});

function createResult(): CarnaubaApiExtractionResult {
  return {
    brandId: 27,
    source: 'mercadapp-api',
    extractedAtIso: '2026-07-17T10:00:00.000Z',
    stores: [
      {
        store: {
          storeId: 79,
          name: 'Carnauba Maestro',
          cnpj: '',
          corporateName: '',
        },
        leaflets: [
          {
            leafletId: '69362-1-sao-joao',
            flipbookId: 69362,
            title: 'São joão',
            images: [
              {
                order: 1,
                imageUrl: 'https://cdn.example.com/1.png',
              },
              {
                order: 2,
                imageUrl: 'https://cdn.example.com/2.jpg',
              },
              {
                order: 3,
                imageUrl: 'https://cdn.example.com/3.webp',
              },
            ],
          },
        ],
      },
      {
        store: {
          storeId: 80,
          name: '🔥🛒',
          cnpj: '',
          corporateName: '',
        },
        leaflets: [],
      },
    ],
  };
}

class FakeImageHttpClient implements LeafletImageHttpClient {
  downloadImage(url: string): Promise<DownloadedLeafletImage> {
    switch (url) {
      case 'https://cdn.example.com/1.png':
        return Promise.resolve({
          body: Uint8Array.of(1, 2, 3),
          contentType: 'image/png',
        });
      case 'https://cdn.example.com/2.jpg':
        return Promise.resolve({
          body: Uint8Array.of(4, 5),
          contentType: 'image/jpeg',
        });
      case 'https://cdn.example.com/3.webp':
        return Promise.resolve({
          body: Uint8Array.of(6),
          contentType: 'image/webp',
        });
      default:
        return Promise.reject(new Error('Unexpected URL.'));
    }
  }
}
