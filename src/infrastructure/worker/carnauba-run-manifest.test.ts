import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CarnaubaPlaywrightExtractionResult } from '../scrapers/carnauba/carnauba-playwright-extraction';
import type { StoredCarnaubaPlaywrightExtraction } from '../storage/carnauba-playwright-leaflet-storage';
import {
  CarnaubaRunManifestError,
  createCarnaubaRunManifest,
  writeCarnaubaRunManifest,
} from './carnauba-run-manifest';

describe('createCarnaubaRunManifest', () => {
  it('summarizes a successful Carnauba Playwright run', () => {
    const manifest = createCarnaubaRunManifest({
      runId: 'run-1',
      startedAtIso: '2026-07-21T10:00:00.000Z',
      completedAtIso: '2026-07-21T10:00:03.250Z',
      outputDirectoryPath: '/tmp/output',
      metadataPath: '/tmp/output/metadata.json',
      result: createResult(),
      stored: createStoredExtraction(),
      visualDataset: {
        enabled: true,
        rootDirectory: '/tmp/visual-dataset',
        samplesCreated: 7,
      },
    });

    expect(manifest).toMatchObject({
      runId: 'run-1',
      supermarketId: 'carnauba',
      mode: 'playwright',
      status: 'succeeded',
      durationMs: 3_250,
      storesProcessed: 2,
      storesSucceeded: 2,
      storesFailed: 0,
      leafletsFound: 3,
      imagesFound: 6,
      sharedLeafletsStored: 2,
      sharedImagesStored: 4,
      sharedImagesReused: 2,
      visualDataset: {
        enabled: true,
        rootDirectory: '/tmp/visual-dataset',
        samplesCreated: 7,
      },
    });
    expect(manifest.stores).toEqual([
      {
        storeId: 79,
        storeName: 'Maestro',
        status: 'succeeded',
        leafletsFound: 1,
        imagesFound: 2,
        sourceUrl: 'https://example.com/loja/79/encartes',
        errorMessage: null,
      },
      {
        storeId: 70,
        storeName: 'Messejana',
        status: 'succeeded',
        leafletsFound: 2,
        imagesFound: 4,
        sourceUrl: 'https://example.com/loja/70/encartes',
        errorMessage: null,
      },
    ]);
  });

  it('rejects invalid manifest timestamps', () => {
    expect(() =>
      createCarnaubaRunManifest({
        runId: 'run-1',
        startedAtIso: 'invalid',
        completedAtIso: '2026-07-21T10:00:03.250Z',
        outputDirectoryPath: '/tmp/output',
        metadataPath: '/tmp/output/metadata.json',
        result: createResult(),
        stored: createStoredExtraction(),
        visualDataset: {
          enabled: false,
          rootDirectory: null,
          samplesCreated: 0,
        },
      }),
    ).toThrow(CarnaubaRunManifestError);
    expect(() =>
      createCarnaubaRunManifest({
        runId: 'run-1',
        startedAtIso: '2026-07-21T10:00:03.250Z',
        completedAtIso: '2026-07-21T10:00:00.000Z',
        outputDirectoryPath: '/tmp/output',
        metadataPath: '/tmp/output/metadata.json',
        result: createResult(),
        stored: createStoredExtraction(),
        visualDataset: {
          enabled: false,
          rootDirectory: null,
          samplesCreated: 0,
        },
      }),
    ).toThrow(CarnaubaRunManifestError);
  });

  it('summarizes a partially successful run', () => {
    const result = {
      ...createResult(),
      failedStores: [
        {
          store: {
            storeId: 65,
            name: 'Aldeota',
            cnpj: '',
            corporateName: '',
          },
          sourceUrl: 'https://example.com/loja/65/encartes',
          attempts: 2,
          errorMessage: 'Store unavailable.',
        },
      ],
    };

    const manifest = createCarnaubaRunManifest({
      runId: 'run-1',
      startedAtIso: '2026-07-21T10:00:00.000Z',
      completedAtIso: '2026-07-21T10:00:01.000Z',
      outputDirectoryPath: '/tmp/output',
      metadataPath: '/tmp/output/metadata.json',
      result,
      stored: createStoredExtraction(),
      visualDataset: {
        enabled: false,
        rootDirectory: null,
        samplesCreated: 0,
      },
    });

    expect(manifest.status).toBe('partially_succeeded');
    expect(manifest.storesProcessed).toBe(3);
    expect(manifest.storesSucceeded).toBe(2);
    expect(manifest.storesFailed).toBe(1);
    expect(manifest.stores[2]).toMatchObject({
      storeId: 65,
      status: 'failed',
      errorMessage: 'Store unavailable.',
    });
  });

  it('summarizes a failed run when every store fails', () => {
    const manifest = createCarnaubaRunManifest({
      runId: 'run-1',
      startedAtIso: '2026-07-21T10:00:00.000Z',
      completedAtIso: '2026-07-21T10:00:01.000Z',
      outputDirectoryPath: '/tmp/output',
      metadataPath: '/tmp/output/metadata.json',
      result: {
        ...createResult(),
        stores: [],
        failedStores: [
          {
            store: {
              storeId: 65,
              name: 'Aldeota',
              cnpj: '',
              corporateName: '',
            },
            sourceUrl: 'https://example.com/loja/65/encartes',
            attempts: 2,
            errorMessage: 'Store unavailable.',
          },
        ],
      },
      stored: {
        ...createStoredExtraction(),
        sharedLeaflets: [],
      },
      visualDataset: {
        enabled: false,
        rootDirectory: null,
        samplesCreated: 0,
      },
    });

    expect(manifest.status).toBe('failed');
    expect(manifest.storesSucceeded).toBe(0);
    expect(manifest.storesFailed).toBe(1);
  });
});

describe('writeCarnaubaRunManifest', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'carnauba-run-manifest-'));
  });

  afterEach(async () => {
    await rm(rootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('writes run.json into the output directory', async () => {
    const manifest = createCarnaubaRunManifest({
      runId: 'run-1',
      startedAtIso: '2026-07-21T10:00:00.000Z',
      completedAtIso: '2026-07-21T10:00:01.000Z',
      outputDirectoryPath: rootDirectory,
      metadataPath: join(rootDirectory, 'metadata.json'),
      result: createResult(),
      stored: createStoredExtraction(),
      visualDataset: {
        enabled: false,
        rootDirectory: null,
        samplesCreated: 0,
      },
    });

    const manifestPath = await writeCarnaubaRunManifest(rootDirectory, manifest);

    expect(manifestPath).toBe(join(rootDirectory, 'run.json'));
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toMatchObject({
      runId: 'run-1',
      status: 'succeeded',
    });
  });
});

function createResult(): CarnaubaPlaywrightExtractionResult {
  return {
    brandId: 27,
    source: 'carnauba-playwright',
    extractedAtIso: '2026-07-21T10:00:00.000Z',
    stores: [
      {
        store: {
          storeId: 79,
          name: 'Maestro',
          cnpj: '',
          corporateName: '',
        },
        sourceUrl: 'https://example.com/loja/79/encartes',
        attempts: 1,
        leaflets: [
          {
            leafletId: 'leaflet-1',
            title: 'Leaflet 1',
            cardIndex: 0,
            coverImageUrl: 'https://cdn.example.com/cover-1.png',
            images: [
              {
                order: 1,
                imageUrl: 'https://cdn.example.com/1.png',
              },
              {
                order: 2,
                imageUrl: 'https://cdn.example.com/2.png',
              },
            ],
          },
        ],
      },
      {
        store: {
          storeId: 70,
          name: 'Messejana',
          cnpj: '',
          corporateName: '',
        },
        sourceUrl: 'https://example.com/loja/70/encartes',
        attempts: 1,
        leaflets: [
          {
            leafletId: 'leaflet-2',
            title: 'Leaflet 2',
            cardIndex: 0,
            coverImageUrl: 'https://cdn.example.com/cover-2.png',
            images: [
              {
                order: 1,
                imageUrl: 'https://cdn.example.com/3.png',
              },
            ],
          },
          {
            leafletId: 'leaflet-3',
            title: 'Leaflet 3',
            cardIndex: 1,
            coverImageUrl: 'https://cdn.example.com/cover-3.png',
            images: [
              {
                order: 1,
                imageUrl: 'https://cdn.example.com/4.png',
              },
              {
                order: 2,
                imageUrl: 'https://cdn.example.com/5.png',
              },
              {
                order: 3,
                imageUrl: 'https://cdn.example.com/6.png',
              },
            ],
          },
        ],
      },
    ],
    failedStores: [],
  };
}

function createStoredExtraction(): StoredCarnaubaPlaywrightExtraction {
  return {
    directoryPath: '/tmp/output',
    metadataPath: '/tmp/output/metadata.json',
    sharedLeafletsDirectoryPath: '/tmp/output/shared-leaflets',
    sharedLeafletsCreated: 2,
    sharedLeafletsReused: 1,
    sharedImagesDownloaded: 4,
    sharedImagesReused: 2,
    sharedLeaflets: [
      {
        contentSignature: 'signature-1',
        representativeLeafletId: 'leaflet-1',
        title: 'Leaflet 1',
        directoryPath: '/tmp/output/shared-leaflets/signature-1',
        metadataPath: '/tmp/output/shared-leaflets/signature-1/metadata.json',
        images: [
          {
            order: 1,
            sourceUrl: 'https://cdn.example.com/1.png',
            canonicalUrl: 'https://cdn.example.com/1.png',
            filePath: '/tmp/output/shared-leaflets/signature-1/001.png',
            contentType: 'image/png',
            byteLength: 10,
            contentHash: 'hash-1',
          },
          {
            order: 2,
            sourceUrl: 'https://cdn.example.com/2.png',
            canonicalUrl: 'https://cdn.example.com/2.png',
            filePath: '/tmp/output/shared-leaflets/signature-1/002.png',
            contentType: 'image/png',
            byteLength: 20,
            contentHash: 'hash-2',
          },
        ],
      },
      {
        contentSignature: 'signature-2',
        representativeLeafletId: 'leaflet-2',
        title: 'Leaflet 2',
        directoryPath: '/tmp/output/shared-leaflets/signature-2',
        metadataPath: '/tmp/output/shared-leaflets/signature-2/metadata.json',
        images: [
          {
            order: 1,
            sourceUrl: 'https://cdn.example.com/3.png',
            canonicalUrl: 'https://cdn.example.com/3.png',
            filePath: '/tmp/output/shared-leaflets/signature-2/001.png',
            contentType: 'image/png',
            byteLength: 30,
            contentHash: 'hash-3',
          },
          {
            order: 2,
            sourceUrl: 'https://cdn.example.com/4.png',
            canonicalUrl: 'https://cdn.example.com/4.png',
            filePath: '/tmp/output/shared-leaflets/signature-2/002.png',
            contentType: 'image/png',
            byteLength: 40,
            contentHash: 'hash-4',
          },
          {
            order: 3,
            sourceUrl: 'https://cdn.example.com/5.png',
            canonicalUrl: 'https://cdn.example.com/5.png',
            filePath: '/tmp/output/shared-leaflets/signature-2/003.png',
            contentType: 'image/png',
            byteLength: 50,
            contentHash: 'hash-5',
          },
        ],
      },
    ],
    stores: [],
  };
}
