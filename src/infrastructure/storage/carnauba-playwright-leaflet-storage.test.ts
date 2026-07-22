import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CarnaubaPlaywrightExtractionResult } from '../scrapers/carnauba/carnauba-playwright-extraction';
import {
  CarnaubaPlaywrightLeafletStorageError,
  LocalCarnaubaPlaywrightLeafletStorage,
} from './carnauba-playwright-leaflet-storage';
import type { DownloadedLeafletImage, LeafletImageHttpClient } from './leaflet-image-storage';

describe('LocalCarnaubaPlaywrightLeafletStorage', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'carnauba-playwright-storage-'));
  });

  afterEach(async () => {
    await rm(rootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('stores shared Playwright leaflets once and references them by store', async () => {
    const httpClient = new FakeImageHttpClient();
    const storage = new LocalCarnaubaPlaywrightLeafletStorage(httpClient);

    const stored = await storage.store({
      rootDirectory,
      result: createResult(),
    });

    expect(stored.directoryPath).toBe(join(rootDirectory, 'carnauba/2026-07-20/15-59'));
    expect(stored.sharedLeafletsDirectoryPath).toBe(
      join(rootDirectory, 'carnauba/shared-leaflets'),
    );
    expect(stored.sharedLeaflets).toHaveLength(1);
    expect(stored.sharedLeafletsCreated).toBe(1);
    expect(stored.sharedLeafletsReused).toBe(1);
    expect(stored.sharedImagesDownloaded).toBe(3);
    expect(stored.sharedImagesReused).toBe(3);
    expect(stored.stores).toHaveLength(2);
    expect(httpClient.downloadedUrls).toEqual([
      'https://cdn.example.com/1.png?t=111',
      'https://cdn.example.com/2.jpg?cache=abc',
      'https://cdn.example.com/3.webp',
    ]);

    const sharedLeaflet = stored.sharedLeaflets[0];
    const firstStoreLeaflet = stored.stores[0]?.leaflets[0];
    const secondStoreLeaflet = stored.stores[1]?.leaflets[0];

    if (sharedLeaflet === undefined) {
      throw new Error('Expected one shared leaflet.');
    }

    const firstSharedLeafletImage = sharedLeaflet.images[0];

    if (firstSharedLeafletImage === undefined) {
      throw new Error('Expected one shared leaflet image.');
    }

    expect(firstStoreLeaflet?.contentSignature).toBe(sharedLeaflet.contentSignature);
    expect(secondStoreLeaflet?.contentSignature).toBe(sharedLeaflet.contentSignature);
    expect(firstStoreLeaflet?.referencePath.endsWith('/leaflets/1-sao-joao.json')).toBe(true);
    expect(secondStoreLeaflet?.referencePath.endsWith('/leaflets/1-sao-joao-copy.json')).toBe(true);
    expect(firstSharedLeafletImage.filePath).toBe(
      join(rootDirectory, `carnauba/shared-images/${firstSharedLeafletImage.contentHash}.png`),
    );
    expect(firstSharedLeafletImage.canonicalUrl).toBe('https://cdn.example.com/1.png');
    expect(firstSharedLeafletImage.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(firstSharedLeafletImage.filePath)).toEqual(Buffer.from([1, 2, 3]));
    expect(await readFile(stored.metadataPath, 'utf8')).toContain(
      '"source": "carnauba-playwright"',
    );
    expect(await readFile(stored.stores[0]?.metadataPath ?? '', 'utf8')).toContain('"storeId": 79');
    expect(await readFile(firstStoreLeaflet?.referencePath ?? '', 'utf8')).toContain(
      '"contentSignature"',
    );
    expect(
      await readFile(join(rootDirectory, 'carnauba/shared-images/index.json'), 'utf8'),
    ).toContain('"canonicalUrl": "https://cdn.example.com/1.png"');
  });

  it('reuses already downloaded images across extraction runs', async () => {
    const httpClient = new FakeImageHttpClient();
    const storage = new LocalCarnaubaPlaywrightLeafletStorage(httpClient);

    const firstRun = await storage.store({
      rootDirectory,
      result: createResult(),
    });
    const secondRun = await storage.store({
      rootDirectory,
      result: createResult('2026-07-20T16:01:00.000Z'),
    });

    expect(httpClient.downloadedUrls).toEqual([
      'https://cdn.example.com/1.png?t=111',
      'https://cdn.example.com/2.jpg?cache=abc',
      'https://cdn.example.com/3.webp',
    ]);
    expect(firstRun.directoryPath).toBe(join(rootDirectory, 'carnauba/2026-07-20/15-59'));
    expect(secondRun.directoryPath).toBe(join(rootDirectory, 'carnauba/2026-07-20/16-01'));
    expect(secondRun.sharedLeafletsCreated).toBe(0);
    expect(secondRun.sharedLeafletsReused).toBe(2);
    expect(secondRun.sharedImagesDownloaded).toBe(0);
    expect(secondRun.sharedImagesReused).toBe(6);
    expect(secondRun.sharedLeaflets[0]?.directoryPath).toBe(
      firstRun.sharedLeaflets[0]?.directoryPath,
    );
  });

  it('rejects invalid storage input', async () => {
    const storage = new LocalCarnaubaPlaywrightLeafletStorage(new FakeImageHttpClient());

    await expect(
      storage.store({
        rootDirectory: ' ',
        result: createResult(),
      }),
    ).rejects.toThrow(CarnaubaPlaywrightLeafletStorageError);

    await expect(
      storage.store({
        rootDirectory,
        result: {
          ...createResult(),
          extractedAtIso: 'invalid-date',
        },
      }),
    ).rejects.toThrow(CarnaubaPlaywrightLeafletStorageError);
  });
});

function createResult(
  extractedAtIso = '2026-07-20T15:59:00.000Z',
): CarnaubaPlaywrightExtractionResult {
  return {
    brandId: 27,
    source: 'carnauba-playwright',
    extractedAtIso,
    stores: [
      {
        store: {
          storeId: 79,
          name: 'Maestro',
          cnpj: '',
          corporateName: '',
        },
        sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
        attempts: 1,
        leaflets: [
          {
            leafletId: '1-sao-joao',
            title: 'São João',
            cardIndex: 0,
            coverImageUrl: 'https://cdn.example.com/cover.png',
            images: [
              {
                order: 1,
                imageUrl: 'https://cdn.example.com/1.png?t=111',
              },
              {
                order: 2,
                imageUrl: 'https://cdn.example.com/2.jpg?cache=abc',
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
        sourceUrl: 'https://carnaubasupermercados.com.br/loja/80/encartes',
        attempts: 1,
        leaflets: [
          {
            leafletId: '1-sao-joao-copy',
            title: 'São João - Copy',
            cardIndex: 0,
            coverImageUrl: 'https://cdn.example.com/cover-copy.png',
            images: [
              {
                order: 1,
                imageUrl: 'https://cdn.example.com/1.png?t=222',
              },
              {
                order: 2,
                imageUrl: 'https://cdn.example.com/2.jpg?cache=def',
              },
              {
                order: 3,
                imageUrl: 'https://cdn.example.com/3.webp',
              },
            ],
          },
        ],
      },
    ],
    failedStores: [],
  };
}

class FakeImageHttpClient implements LeafletImageHttpClient {
  readonly downloadedUrls: string[] = [];

  downloadImage(url: string): Promise<DownloadedLeafletImage> {
    this.downloadedUrls.push(url);

    switch (url) {
      case 'https://cdn.example.com/1.png?t=111':
        return Promise.resolve({
          body: Uint8Array.of(1, 2, 3),
          contentType: 'image/png',
        });
      case 'https://cdn.example.com/2.jpg?cache=abc':
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
