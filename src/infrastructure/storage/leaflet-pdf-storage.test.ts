import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DownloadedLeafletPdf, LeafletPdfHttpClient } from './leaflet-pdf-storage';
import { LeafletPdfStorageError, LocalSharedPdfLeafletStorage } from './leaflet-pdf-storage';

describe('LocalSharedPdfLeafletStorage', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'shared-pdf-leaflet-storage-'));
  });

  afterEach(async () => {
    await rm(rootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('stores shared PDF leaflets and reuses PDFs across runs', async () => {
    const httpClient = new FakePdfHttpClient();
    const storage = new LocalSharedPdfLeafletStorage(httpClient);

    const firstRun = await storage.store(createInput(rootDirectory));
    const secondRun = await storage.store(
      createInput(rootDirectory, {
        extractedAtIso: '2026-07-23T11:00:00.000Z',
      }),
    );

    expect(firstRun.directoryPath).toBe(join(rootDirectory, 'mixmateus/2026-07-23/10-00'));
    expect(firstRun.sharedPdfsDirectoryPath).toBe(join(rootDirectory, 'mixmateus/shared-pdfs'));
    expect(firstRun.sharedLeafletsCreated).toBe(1);
    expect(firstRun.sharedLeafletsReused).toBe(1);
    expect(firstRun.sharedPdfsDownloaded).toBe(1);
    expect(firstRun.sharedPdfsReused).toBe(1);
    expect(secondRun.sharedLeafletsCreated).toBe(0);
    expect(secondRun.sharedLeafletsReused).toBe(2);
    expect(secondRun.sharedPdfsDownloaded).toBe(0);
    expect(secondRun.sharedPdfsReused).toBe(2);
    expect(httpClient.downloadedUrls).toEqual(['https://cdn.example.com/leaflet.pdf?cache=abc']);
    expect(
      await readFile(join(rootDirectory, 'mixmateus/shared-pdfs/index.json'), 'utf8'),
    ).toContain('"canonicalUrl": "https://cdn.example.com/leaflet.pdf"');
    expect(firstRun.units[0]?.leaflets[0]?.contentSignature).toBe(
      firstRun.sharedLeaflets[0]?.contentSignature,
    );
  });

  it('stores extraction metadata when no PDF units were extracted', async () => {
    const storage = new LocalSharedPdfLeafletStorage(new FakePdfHttpClient());

    const stored = await storage.store({
      ...createInput(rootDirectory),
      units: [],
    });

    expect(stored.units).toEqual([]);
    expect(stored.sharedLeaflets).toEqual([]);
    expect(stored.sharedPdfsDownloaded).toBe(0);
    expect(await readFile(stored.metadataPath, 'utf8')).toContain('"units": []');
  });

  it('rejects invalid input', async () => {
    const storage = new LocalSharedPdfLeafletStorage(new FakePdfHttpClient());

    await expect(
      storage.store({
        ...createInput(rootDirectory),
        rootDirectory: ' ',
      }),
    ).rejects.toThrow(LeafletPdfStorageError);
    await expect(
      storage.store({
        ...createInput(rootDirectory),
        extractedAtIso: 'invalid-date',
      }),
    ).rejects.toThrow(LeafletPdfStorageError);
  });

  it('ignores invalid persistent PDF indexes', async () => {
    await seedPdfIndex(rootDirectory, {
      version: 1,
      pdfs: [
        {
          canonicalUrl: 'https://cdn.example.com/leaflet.pdf',
          filePath: '/tmp/leaflet.pdf',
          contentType: 'application/json',
          byteLength: 3,
          contentHash: createContentHash(Uint8Array.of(1, 2, 3)),
        },
      ],
    });
    const httpClient = new FakePdfHttpClient();
    const storage = new LocalSharedPdfLeafletStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedPdfsDownloaded).toBe(1);
    expect(httpClient.downloadedUrls).toEqual(['https://cdn.example.com/leaflet.pdf?cache=abc']);
  });

  it('ignores persistent PDF indexes with unsupported versions', async () => {
    await seedPdfIndex(rootDirectory, {
      version: 2,
      pdfs: [],
    });
    const httpClient = new FakePdfHttpClient();
    const storage = new LocalSharedPdfLeafletStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedPdfsDownloaded).toBe(1);
    expect(httpClient.downloadedUrls).toEqual(['https://cdn.example.com/leaflet.pdf?cache=abc']);
  });

  it('ignores persistent PDF indexes without a PDF list', async () => {
    await seedPdfIndex(rootDirectory, {
      version: 1,
      pdfs: {},
    });
    const httpClient = new FakePdfHttpClient();
    const storage = new LocalSharedPdfLeafletStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedPdfsDownloaded).toBe(1);
    expect(httpClient.downloadedUrls).toEqual(['https://cdn.example.com/leaflet.pdf?cache=abc']);
  });

  it('ignores persistent PDF indexes with non-object PDF entries', async () => {
    await seedPdfIndex(rootDirectory, {
      version: 1,
      pdfs: [null],
    });
    const httpClient = new FakePdfHttpClient();
    const storage = new LocalSharedPdfLeafletStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedPdfsDownloaded).toBe(1);
    expect(httpClient.downloadedUrls).toEqual(['https://cdn.example.com/leaflet.pdf?cache=abc']);
  });

  it('loads valid persistent PDF indexes before downloading', async () => {
    await mkdir(join(rootDirectory, 'mixmateus/shared-pdfs'), { recursive: true });
    await writeFile(
      join(rootDirectory, 'mixmateus/shared-pdfs/cached.pdf'),
      Uint8Array.of(1, 2, 3),
    );
    await seedPdfIndex(rootDirectory, {
      version: 1,
      pdfs: [
        {
          canonicalUrl: 'https://cdn.example.com/leaflet.pdf',
          filePath: join(rootDirectory, 'mixmateus/shared-pdfs/cached.pdf'),
          contentType: 'application/pdf',
          byteLength: 3,
          contentHash: createContentHash(Uint8Array.of(1, 2, 3)),
        },
      ],
    });
    const httpClient = new FakePdfHttpClient();
    const storage = new LocalSharedPdfLeafletStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedPdfsDownloaded).toBe(0);
    expect(stored.sharedPdfsReused).toBe(2);
    expect(httpClient.downloadedUrls).toEqual([]);
  });

  it('redownloads when the persistent PDF index points to a missing file', async () => {
    await seedPdfIndex(rootDirectory, {
      version: 1,
      pdfs: [
        {
          canonicalUrl: 'https://cdn.example.com/leaflet.pdf',
          filePath: join(rootDirectory, 'mixmateus/shared-pdfs/missing.pdf'),
          contentType: 'application/pdf',
          byteLength: 3,
          contentHash: createContentHash(Uint8Array.of(1, 2, 3)),
        },
      ],
    });
    const httpClient = new FakePdfHttpClient();
    const storage = new LocalSharedPdfLeafletStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedPdfsDownloaded).toBe(1);
    expect(stored.sharedPdfsReused).toBe(1);
    expect(httpClient.downloadedUrls).toEqual(['https://cdn.example.com/leaflet.pdf?cache=abc']);
  });

  it('redownloads when the persistent PDF index file size is stale', async () => {
    await mkdir(join(rootDirectory, 'mixmateus/shared-pdfs'), { recursive: true });
    await writeFile(join(rootDirectory, 'mixmateus/shared-pdfs/stale.pdf'), Uint8Array.of(1, 2));
    await seedPdfIndex(rootDirectory, {
      version: 1,
      pdfs: [
        {
          canonicalUrl: 'https://cdn.example.com/leaflet.pdf',
          filePath: join(rootDirectory, 'mixmateus/shared-pdfs/stale.pdf'),
          contentType: 'application/pdf',
          byteLength: 3,
          contentHash: createContentHash(Uint8Array.of(1, 2, 3)),
        },
      ],
    });
    const httpClient = new FakePdfHttpClient();
    const storage = new LocalSharedPdfLeafletStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedPdfsDownloaded).toBe(1);
    expect(stored.sharedPdfsReused).toBe(1);
    expect(httpClient.downloadedUrls).toEqual(['https://cdn.example.com/leaflet.pdf?cache=abc']);
  });

  it('redownloads when the persistent PDF index file hash is stale', async () => {
    await mkdir(join(rootDirectory, 'mixmateus/shared-pdfs'), { recursive: true });
    await writeFile(join(rootDirectory, 'mixmateus/shared-pdfs/stale.pdf'), Uint8Array.of(1, 2, 4));
    await seedPdfIndex(rootDirectory, {
      version: 1,
      pdfs: [
        {
          canonicalUrl: 'https://cdn.example.com/leaflet.pdf',
          filePath: join(rootDirectory, 'mixmateus/shared-pdfs/stale.pdf'),
          contentType: 'application/pdf',
          byteLength: 3,
          contentHash: createContentHash(Uint8Array.of(1, 2, 3)),
        },
      ],
    });
    const httpClient = new FakePdfHttpClient();
    const storage = new LocalSharedPdfLeafletStorage(httpClient);

    const stored = await storage.store(createInput(rootDirectory));

    expect(stored.sharedPdfsDownloaded).toBe(1);
    expect(stored.sharedPdfsReused).toBe(1);
    expect(httpClient.downloadedUrls).toEqual(['https://cdn.example.com/leaflet.pdf?cache=abc']);
  });

  it('uses a fallback directory slug when the unit name has no slug content', async () => {
    const storage = new LocalSharedPdfLeafletStorage(new FakePdfHttpClient());

    const stored = await storage.store({
      ...createInput(rootDirectory),
      units: [
        {
          unitId: 'store-1',
          unitName: '---',
          sourceUrl: 'https://ofertasmateus.com/',
          leaflets: [
            {
              leafletId: 'leaflet-1',
              title: 'Leaflet 1',
              pdfUrl: 'https://cdn.example.com/leaflet.pdf?cache=abc',
            },
          ],
        },
      ],
    });

    expect(stored.units[0]?.directoryPath).toBe(
      join(rootDirectory, 'mixmateus/2026-07-23/10-00/units/store-1-unit'),
    );
  });
});

function createInput(
  rootDirectory: string,
  overrides: {
    readonly extractedAtIso?: string;
  } = {},
): Parameters<LocalSharedPdfLeafletStorage['store']>[0] {
  return {
    rootDirectory,
    supermarketId: 'mixmateus',
    extractedAtIso: overrides.extractedAtIso ?? '2026-07-23T10:00:00.000Z',
    units: [
      {
        unitId: 'mix-aracati',
        unitName: 'Mix Mateus Aracati',
        sourceUrl: 'https://ofertasmateus.com/ce/aracati/mix-aracati',
        leaflets: [
          {
            leafletId: 'leaflet-1',
            title: 'Leaflet 1',
            pdfUrl: 'https://cdn.example.com/leaflet.pdf?cache=abc',
          },
          {
            leafletId: 'leaflet-1-copy',
            title: 'Leaflet 1 copy',
            pdfUrl: 'https://cdn.example.com/leaflet.pdf?cache=def',
          },
        ],
      },
    ],
  };
}

async function seedPdfIndex(rootDirectory: string, index: object): Promise<void> {
  await mkdir(join(rootDirectory, 'mixmateus/shared-pdfs'), { recursive: true });
  await writeFile(
    join(rootDirectory, 'mixmateus/shared-pdfs/index.json'),
    `${JSON.stringify(index)}\n`,
  );
}

class FakePdfHttpClient implements LeafletPdfHttpClient {
  readonly downloadedUrls: string[] = [];

  downloadPdf(url: string): Promise<DownloadedLeafletPdf> {
    this.downloadedUrls.push(url);

    if (url !== 'https://cdn.example.com/leaflet.pdf?cache=abc') {
      return Promise.reject(new Error(`Unexpected download URL: ${url}`));
    }

    return Promise.resolve({
      body: Uint8Array.of(1, 2, 3),
      contentType: 'application/pdf',
    });
  }
}

function createContentHash(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}
