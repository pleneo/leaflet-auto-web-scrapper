import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PlaywrightExtractionInput } from '../../../application/ports/playwright-extraction-strategy';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type {
  StoreSharedImageGalleryExtractionInput,
  StoredSharedImageGalleryExtraction,
} from '../../storage/shared-image-gallery-storage';
import type { SuperDoPovoPlaywrightExtractionResult } from './superdopovo-playwright-extraction';
import {
  SuperDoPovoPlaywrightStrategyAdapter,
  type SuperDoPovoPlaywrightExtractionPort,
  type SuperDoPovoPlaywrightStoragePort,
} from './superdopovo-playwright-strategy-adapter';

describe('SuperDoPovoPlaywrightStrategyAdapter', () => {
  it('maps extraction and deduplicated storage into the generic worker output', async () => {
    const extractionService = new FakeExtractionService(createExtractionResult());
    const storage = new FakeStorage(createStoredExtraction());
    const countVisualDatasetSamples = vi.fn(() => Promise.resolve(5));
    const adapter = createAdapter({
      extractionService,
      storage,
      countVisualDatasetSamples,
    });

    const output = await adapter.execute(createInput('always'));

    expect(output).toEqual({
      runId: 'run-1',
      targetId: 'superdopovo',
      supermarketId: 'superdopovo',
      status: 'partially_succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 1,
      artifactsReused: 2,
      datasetSamplesCreated: 5,
      units: [
        {
          unitId: '24',
          unitName: 'Serrinha',
          status: 'succeeded',
          sourceUrl: 'https://loja.superdopovo.com.br/booklets',
          leaflets: [
            {
              leafletKey: 'signature-1',
              title: 'Booklet 1609',
              contentSignature: 'signature-1',
              imageCount: 1,
              sourceUrl: 'https://img.test/cover.jpg',
            },
          ],
          errorMessage: null,
        },
        {
          unitId: '57',
          unitName: 'Cambeba',
          status: 'failed',
          sourceUrl: 'https://loja.superdopovo.com.br/booklets',
          leaflets: [],
          errorMessage: 'Request failed.',
        },
      ],
      failures: [
        {
          targetId: 'superdopovo:shop:57',
          message: 'Request failed.',
        },
      ],
    });
    expect(extractionService.inputs[0]?.visualDataset).toEqual({
      runId: 'run-1',
      split: 'unassigned',
    });
    expect(storage.inputs[0]).toEqual({
      rootDirectory: '.data/leaflets-playwright',
      supermarketId: 'superdopovo',
      extractedAtIso: '2026-07-23T10:00:00.000Z',
      units: [
        {
          unitId: '24',
          unitName: 'Serrinha',
          sourceUrl: 'https://loja.superdopovo.com.br/booklets',
          leaflets: [
            {
              leafletId: 'superdopovo-1609',
              title: 'Booklet 1609',
              coverImageUrl: 'https://img.test/cover.jpg',
              imageUrls: ['https://img.test/cover.jpg'],
            },
          ],
        },
      ],
    });
    expect(countVisualDatasetSamples).toHaveBeenCalledWith('.data/visual-dataset', 'run-1');
  });

  it('does not enable Visual Dataset when policy is disabled', async () => {
    const extractionService = new FakeExtractionService({
      ...createExtractionResult(),
      failedShops: [],
    });
    const adapter = createAdapter({
      extractionService,
      storage: new FakeStorage(createStoredExtraction()),
      countVisualDatasetSamples: vi.fn(() => Promise.resolve(5)),
    });

    const output = await adapter.execute(createInput('disabled'));

    expect(output.datasetSamplesCreated).toBe(0);
    expect(extractionService.inputs[0]?.visualDataset).toBeUndefined();
  });

  it('maps empty units and fully failed extractions', async () => {
    const storedExtraction = createStoredExtraction();
    const storedUnit = storedExtraction.units[0];

    if (storedUnit === undefined) {
      throw new Error('Expected stored unit fixture.');
    }

    const adapter = createAdapter({
      extractionService: new FakeExtractionService({
        ...createExtractionResult(),
        shops: [],
      }),
      storage: new FakeStorage({
        ...storedExtraction,
        units: [
          {
            ...storedUnit,
            leaflets: [],
          },
        ],
        sharedLeaflets: [],
      }),
      countVisualDatasetSamples: vi.fn(() => Promise.resolve(0)),
    });

    const output = await adapter.execute(createInput('disabled'));

    expect(output.status).toBe('failed');
    expect(output.units[0]?.status).toBe('empty');
    expect(output.units[0]?.leaflets).toEqual([]);
  });

  it('uses zero image count when shared leaflet metadata is missing', async () => {
    const adapter = createAdapter({
      extractionService: new FakeExtractionService({
        ...createExtractionResult(),
        failedShops: [],
      }),
      storage: new FakeStorage({
        ...createStoredExtraction(),
        sharedLeaflets: [],
      }),
      countVisualDatasetSamples: vi.fn(() => Promise.resolve(0)),
    });

    const output = await adapter.execute(createInput('disabled'));

    expect(output.status).toBe('succeeded');
    expect(output.units[0]?.leaflets[0]?.imageCount).toBe(0);
  });
});

function createAdapter(input: {
  readonly extractionService: SuperDoPovoPlaywrightExtractionPort;
  readonly storage: SuperDoPovoPlaywrightStoragePort;
  readonly countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>;
}): SuperDoPovoPlaywrightStrategyAdapter {
  return new SuperDoPovoPlaywrightStrategyAdapter(
    {
      extractionInput: {
        siteBaseUrl: 'https://loja.superdopovo.com.br',
        defaultShopId: 24,
        viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
        timeoutMs: 30_000,
        shopTimeoutMs: 30_000,
        maxShopAttempts: 2,
        settleDelayMs: 3_000,
      },
      outputRootDirectory: '.data/leaflets-playwright',
      visualDatasetRootDirectory: '.data/visual-dataset',
      visualDatasetSplit: 'unassigned',
    },
    input,
  );
}

function createInput(visualDatasetCapturePolicy: 'always' | 'disabled'): PlaywrightExtractionInput {
  return {
    runId: 'run-1',
    target: {
      targetId: 'superdopovo',
      supermarketId: 'superdopovo',
      supermarketName: 'Super do Povo',
      mode: 'playwright',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 2,
    },
    startedAtIso: '2026-07-23T09:59:00.000Z',
    visualDatasetCapturePolicy,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

function createExtractionResult(): SuperDoPovoPlaywrightExtractionResult {
  return {
    source: 'superdopovo-playwright',
    extractedAtIso: '2026-07-23T10:00:00.000Z',
    shops: [
      {
        shop: {
          shopId: 24,
          name: 'Serrinha',
          address: {
            zipcode: '',
            street: '',
            number: '',
            neighborhood: '',
            city: 'Fortaleza',
            state: 'CE',
          },
        },
        sourceUrl: 'https://loja.superdopovo.com.br/booklets',
        attempts: 1,
        leaflets: [
          {
            leafletId: 'superdopovo-1609',
            title: 'Booklet 1609',
            cardIndex: 0,
            coverImageUrl: 'https://img.test/cover.jpg',
            images: [
              {
                order: 1,
                imageUrl: 'https://img.test/cover.jpg',
              },
            ],
          },
        ],
      },
    ],
    failedShops: [
      {
        shop: {
          shopId: 57,
          name: 'Cambeba',
          address: {
            zipcode: '',
            street: '',
            number: '',
            neighborhood: '',
            city: 'Fortaleza',
            state: 'CE',
          },
        },
        sourceUrl: 'https://loja.superdopovo.com.br/booklets',
        attempts: 1,
        errorMessage: 'Request failed.',
      },
    ],
  };
}

function createStoredExtraction(): StoredSharedImageGalleryExtraction {
  const rootDirectory = join('.data', 'leaflets-playwright', 'superdopovo', '2026-07-23', '10-00');

  return {
    directoryPath: rootDirectory,
    metadataPath: join(rootDirectory, 'metadata.json'),
    sharedImagesDirectoryPath: join('.data', 'leaflets-playwright', 'superdopovo', 'shared-images'),
    sharedLeafletsDirectoryPath: join(
      '.data',
      'leaflets-playwright',
      'superdopovo',
      'shared-leaflets',
    ),
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedImagesDownloaded: 1,
    sharedImagesReused: 2,
    units: [
      {
        unitId: '24',
        unitName: 'Serrinha',
        sourceUrl: 'https://loja.superdopovo.com.br/booklets',
        directoryPath: join(rootDirectory, 'units', '24-serrinha'),
        metadataPath: join(rootDirectory, 'units', '24-serrinha', 'metadata.json'),
        leafletsDirectoryPath: join(rootDirectory, 'units', '24-serrinha', 'leaflets'),
        leaflets: [
          {
            leafletId: 'superdopovo-1609',
            title: 'Booklet 1609',
            coverImageUrl: 'https://img.test/cover.jpg',
            contentSignature: 'signature-1',
            sharedLeafletDirectoryPath: join(
              '.data',
              'leaflets-playwright',
              'superdopovo',
              'shared-leaflets',
              'signature-1',
            ),
            referencePath: join(
              rootDirectory,
              'units',
              '24-serrinha',
              'leaflets',
              'superdopovo-1609.json',
            ),
          },
        ],
      },
    ],
    sharedLeaflets: [
      {
        contentSignature: 'signature-1',
        representativeLeafletId: 'superdopovo-1609',
        title: 'Booklet 1609',
        directoryPath: join(
          '.data',
          'leaflets-playwright',
          'superdopovo',
          'shared-leaflets',
          'signature-1',
        ),
        metadataPath: join(
          '.data',
          'leaflets-playwright',
          'superdopovo',
          'shared-leaflets',
          'signature-1',
          'metadata.json',
        ),
        images: [
          {
            order: 1,
            sourceUrl: 'https://img.test/cover.jpg',
            canonicalUrl: 'https://img.test/cover.jpg',
            filePath: join(
              '.data',
              'leaflets-playwright',
              'superdopovo',
              'shared-images',
              'hash.jpg',
            ),
            contentType: 'image/jpeg',
            byteLength: 100,
            contentHash: 'hash',
          },
        ],
      },
    ],
  };
}

class FakeExtractionService implements SuperDoPovoPlaywrightExtractionPort {
  readonly inputs: Parameters<SuperDoPovoPlaywrightExtractionPort['extract']>[0][] = [];

  private readonly result: SuperDoPovoPlaywrightExtractionResult;

  constructor(result: SuperDoPovoPlaywrightExtractionResult) {
    this.result = result;
  }

  extract(
    input: Parameters<SuperDoPovoPlaywrightExtractionPort['extract']>[0],
  ): Promise<SuperDoPovoPlaywrightExtractionResult> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}

class FakeStorage implements SuperDoPovoPlaywrightStoragePort {
  readonly inputs: StoreSharedImageGalleryExtractionInput[] = [];

  private readonly result: StoredSharedImageGalleryExtraction;

  constructor(result: StoredSharedImageGalleryExtraction) {
    this.result = result;
  }

  store(
    input: StoreSharedImageGalleryExtractionInput,
  ): Promise<StoredSharedImageGalleryExtraction> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}
