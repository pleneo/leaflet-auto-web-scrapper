import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DownloadedLeafletImage, LeafletImageHttpClient } from './leaflet-image-storage';
import {
  LocalSharedImageGalleryStorage,
  SharedImageGalleryStorageError,
} from './shared-image-gallery-storage';

describe('LocalSharedImageGalleryStorage', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'shared-image-gallery-storage-'));
  });

  afterEach(async () => {
    await rm(rootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('stores shared image galleries and reuses images across runs', async () => {
    const httpClient = new FakeImageHttpClient();
    const storage = new LocalSharedImageGalleryStorage(httpClient);

    const firstRun = await storage.store(createInput(rootDirectory));
    const secondRun = await storage.store(
      createInput(rootDirectory, {
        extractedAtIso: '2026-07-23T11:00:00.000Z',
      }),
    );

    expect(firstRun.directoryPath).toBe(join(rootDirectory, 'superdopovo/2026-07-23/10-00'));
    expect(firstRun.sharedImagesDirectoryPath).toBe(
      join(rootDirectory, 'superdopovo/shared-images'),
    );
    expect(firstRun.sharedLeafletsDirectoryPath).toBe(
      join(rootDirectory, 'superdopovo/shared-leaflets'),
    );
    expect(firstRun.sharedLeafletsCreated).toBe(1);
    expect(firstRun.sharedLeafletsReused).toBe(1);
    expect(firstRun.sharedImagesDownloaded).toBe(2);
    expect(firstRun.sharedImagesReused).toBe(2);
    expect(secondRun.sharedLeafletsCreated).toBe(0);
    expect(secondRun.sharedLeafletsReused).toBe(2);
    expect(secondRun.sharedImagesDownloaded).toBe(0);
    expect(secondRun.sharedImagesReused).toBe(4);
    expect(httpClient.downloadedUrls).toEqual([
      'https://cdn.example.com/1.jpeg?generation=111',
      'https://cdn.example.com/2.jpeg?cache=abc',
    ]);
    expect(
      await readFile(join(rootDirectory, 'superdopovo/shared-images/index.json'), 'utf8'),
    ).toContain('"canonicalUrl": "https://cdn.example.com/1.jpeg?generation=111"');
    expect(firstRun.units[0]?.leaflets[0]?.contentSignature).toBe(
      firstRun.sharedLeaflets[0]?.contentSignature,
    );
  });

  it('rejects invalid input', async () => {
    const storage = new LocalSharedImageGalleryStorage(new FakeImageHttpClient());

    await expect(
      storage.store({
        ...createInput(rootDirectory),
        rootDirectory: ' ',
      }),
    ).rejects.toThrow(SharedImageGalleryStorageError);
    await expect(
      storage.store({
        ...createInput(rootDirectory),
        extractedAtIso: 'invalid-date',
      }),
    ).rejects.toThrow(SharedImageGalleryStorageError);
  });
});

function createInput(
  rootDirectory: string,
  overrides: {
    readonly extractedAtIso?: string;
  } = {},
): Parameters<LocalSharedImageGalleryStorage['store']>[0] {
  return {
    rootDirectory,
    supermarketId: 'superdopovo',
    extractedAtIso: overrides.extractedAtIso ?? '2026-07-23T10:00:00.000Z',
    units: [
      {
        unitId: '24',
        unitName: 'Serrinha',
        sourceUrl: 'https://loja.superdopovo.com.br/booklets',
        leaflets: [
          {
            leafletId: '1596',
            title: 'Leaflet 1596',
            coverImageUrl: 'https://cdn.example.com/1.jpeg?generation=111',
            imageUrls: [
              'https://cdn.example.com/1.jpeg?generation=111',
              'https://cdn.example.com/2.jpeg?cache=abc',
            ],
          },
          {
            leafletId: '1596-copy',
            title: 'Leaflet 1596 copy',
            coverImageUrl: 'https://cdn.example.com/1.jpeg?generation=222',
            imageUrls: [
              'https://cdn.example.com/1.jpeg?generation=111',
              'https://cdn.example.com/2.jpeg?cache=def',
            ],
          },
        ],
      },
    ],
  };
}

class FakeImageHttpClient implements LeafletImageHttpClient {
  readonly downloadedUrls: string[] = [];

  downloadImage(url: string): Promise<DownloadedLeafletImage> {
    this.downloadedUrls.push(url);

    switch (url) {
      case 'https://cdn.example.com/1.jpeg?generation=111':
        return Promise.resolve({
          body: Uint8Array.of(1, 2, 3),
          contentType: 'image/jpeg',
        });
      case 'https://cdn.example.com/2.jpeg?cache=abc':
        return Promise.resolve({
          body: Uint8Array.of(4, 5, 6),
          contentType: 'image/jpeg',
        });
      default:
        return Promise.reject(new Error(`Unexpected download URL: ${url}`));
    }
  }
}
