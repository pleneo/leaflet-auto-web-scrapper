import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

  it('stores metadata for an extraction with no successful units', async () => {
    const storage = new LocalSharedImageGalleryStorage(new FakeImageHttpClient());

    const stored = await storage.store({
      rootDirectory,
      supermarketId: 'assai',
      extractedAtIso: '2026-08-05T10:00:00.000Z',
      units: [],
    });

    expect(stored.directoryPath).toBe(join(rootDirectory, 'assai/2026-08-05/10-00'));
    expect(await readFile(stored.metadataPath, 'utf8')).toContain('"units": []');
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

  it('ignores an invalid persistent image index', async () => {
    await mkdir(join(rootDirectory, 'superdopovo/shared-images'), { recursive: true });
    await writeFile(
      join(rootDirectory, 'superdopovo/shared-images/index.json'),
      `${JSON.stringify({
        version: 1,
        images: [
          {
            canonicalUrl: 'https://cdn.example.com/1.jpeg?generation=111',
            filePath: '/tmp/image.jpg',
            contentType: 'application/json',
            byteLength: 3,
            contentHash: createContentHash(Uint8Array.of(1, 2, 3)),
          },
        ],
      })}\n`,
    );
    const httpClient = new FakeImageHttpClient();
    const storage = new LocalSharedImageGalleryStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedImagesDownloaded).toBe(2);
    expect(stored.sharedImagesReused).toBe(2);
    expect(httpClient.downloadedUrls).toEqual([
      'https://cdn.example.com/1.jpeg?generation=111',
      'https://cdn.example.com/2.jpeg?cache=abc',
    ]);
  });

  it('ignores persistent image index entries that are not objects', async () => {
    await mkdir(join(rootDirectory, 'superdopovo/shared-images'), { recursive: true });
    await writeFile(
      join(rootDirectory, 'superdopovo/shared-images/index.json'),
      `${JSON.stringify({
        version: 1,
        images: [null],
      })}\n`,
    );
    const httpClient = new FakeImageHttpClient();
    const storage = new LocalSharedImageGalleryStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedImagesDownloaded).toBe(2);
    expect(httpClient.downloadedUrls).toEqual([
      'https://cdn.example.com/1.jpeg?generation=111',
      'https://cdn.example.com/2.jpeg?cache=abc',
    ]);
  });

  it('ignores a persistent image index with unsupported version', async () => {
    await mkdir(join(rootDirectory, 'superdopovo/shared-images'), { recursive: true });
    await writeFile(
      join(rootDirectory, 'superdopovo/shared-images/index.json'),
      `${JSON.stringify({
        version: 2,
        images: [],
      })}\n`,
    );
    const httpClient = new FakeImageHttpClient();
    const storage = new LocalSharedImageGalleryStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedImagesDownloaded).toBe(2);
  });

  it('ignores a persistent image index without an image list', async () => {
    await mkdir(join(rootDirectory, 'superdopovo/shared-images'), { recursive: true });
    await writeFile(
      join(rootDirectory, 'superdopovo/shared-images/index.json'),
      `${JSON.stringify({
        version: 1,
        images: {},
      })}\n`,
    );
    const httpClient = new FakeImageHttpClient();
    const storage = new LocalSharedImageGalleryStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedImagesDownloaded).toBe(2);
  });

  it('loads a valid persistent image index before downloading new images', async () => {
    await mkdir(join(rootDirectory, 'superdopovo/shared-images'), { recursive: true });
    await writeFile(
      join(rootDirectory, 'superdopovo/shared-images/index.json'),
      `${JSON.stringify({
        version: 1,
        images: [
          {
            canonicalUrl: 'https://cdn.example.com/1.jpeg?generation=111',
            filePath: join(rootDirectory, 'superdopovo/shared-images/cached.jpg'),
            contentType: 'image/jpeg',
            byteLength: 3,
            contentHash: createContentHash(Uint8Array.of(1, 2, 3)),
          },
        ],
      })}\n`,
    );
    const httpClient = new FakeImageHttpClient();
    const storage = new LocalSharedImageGalleryStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedImagesDownloaded).toBe(1);
    expect(stored.sharedImagesReused).toBe(3);
    expect(httpClient.downloadedUrls).toEqual(['https://cdn.example.com/2.jpeg?cache=abc']);
  });

  it('stores downloaded png and webp images with matching file extensions', async () => {
    const storage = new LocalSharedImageGalleryStorage(new FakeImageHttpClient());

    const stored = await storage.store({
      rootDirectory,
      supermarketId: 'superdopovo',
      extractedAtIso: '2026-07-23T10:00:00.000Z',
      units: [
        {
          unitId: '57',
          unitName: 'Cambeba',
          sourceUrl: 'https://loja.superdopovo.com.br/booklets',
          leaflets: [
            {
              leafletId: 'png-webp',
              title: 'PNG and WebP leaflet',
              coverImageUrl: 'https://cdn.example.com/3.png',
              imageUrls: ['https://cdn.example.com/3.png', 'https://cdn.example.com/4.webp'],
            },
          ],
        },
      ],
    });

    expect(stored.sharedLeaflets[0]?.images.map((image) => image.filePath)).toEqual([
      join(
        rootDirectory,
        `superdopovo/shared-images/${createContentHash(Uint8Array.of(7, 8, 9))}.png`,
      ),
      join(
        rootDirectory,
        `superdopovo/shared-images/${createContentHash(Uint8Array.of(10, 11, 12))}.webp`,
      ),
    ]);
  });

  it('uses a fallback directory slug when the unit name has no slug content', async () => {
    const storage = new LocalSharedImageGalleryStorage(new FakeImageHttpClient());

    const stored = await storage.store({
      ...createInput(rootDirectory),
      units: [
        {
          unitId: '24',
          unitName: '---',
          sourceUrl: 'https://loja.superdopovo.com.br/booklets',
          leaflets: [
            {
              leafletId: '1596',
              title: 'Leaflet 1596',
              coverImageUrl: 'https://cdn.example.com/1.jpeg?generation=111',
              imageUrls: ['https://cdn.example.com/1.jpeg?generation=111'],
            },
          ],
        },
      ],
    });

    expect(stored.units[0]?.directoryPath).toBe(
      join(rootDirectory, 'superdopovo/2026-07-23/10-00/units/24-unit'),
    );
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
      case 'https://cdn.example.com/3.png':
        return Promise.resolve({
          body: Uint8Array.of(7, 8, 9),
          contentType: 'image/png',
        });
      case 'https://cdn.example.com/4.webp':
        return Promise.resolve({
          body: Uint8Array.of(10, 11, 12),
          contentType: 'image/webp',
        });
      default:
        return Promise.reject(new Error(`Unexpected download URL: ${url}`));
    }
  }
}

function createContentHash(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}
