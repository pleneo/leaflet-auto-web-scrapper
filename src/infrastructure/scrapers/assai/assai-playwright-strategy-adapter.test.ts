import { describe, expect, it } from 'vitest';
import type { PlaywrightExtractionInput } from '../../../application/ports/playwright-extraction-strategy';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type {
  StoreSharedImageGalleryExtractionInput,
  StoredSharedImageGalleryExtraction,
} from '../../storage/shared-image-gallery-storage';
import type { AssaiLeafletExtractionResult } from './assai-leaflet-extractor';
import {
  AssaiPlaywrightStrategyAdapter,
  type AssaiPlaywrightExtractionPort,
  type AssaiPlaywrightStoragePort,
} from './assai-playwright-strategy-adapter';

describe('AssaiPlaywrightStrategyAdapter', () => {
  it('maps extraction and deduplicated image storage into worker output', async () => {
    const extractionService = new FakeExtractionService(createExtractionResult());
    const storage = new FakeStorage(createStoredExtraction());
    const adapter = createAdapter({
      extractionService,
      storage,
      countVisualDatasetSamples: () => Promise.resolve(8),
    });

    const output = await adapter.execute(createInput('always'));

    expect(output).toEqual({
      runId: 'run-1',
      targetId: 'assai',
      supermarketId: 'assai',
      status: 'partially_succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 2,
      artifactsReused: 1,
      datasetSamplesCreated: 8,
      units: [
        {
          unitId: 'assai-parangaba',
          unitName: 'Assai Atacadista Parangaba',
          status: 'succeeded',
          sourceUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
          leaflets: [
            {
              leafletKey: 'signature-1',
              title: 'Jornal de Ofertas 1',
              contentSignature: 'signature-1',
              artifactCount: 2,
              sourceUrl: 'https://cdn.example/page-1.jpeg',
            },
          ],
          errorMessage: null,
        },
        {
          unitId: 'assai-montese',
          unitName: 'Assai Atacadista Montese',
          status: 'failed',
          sourceUrl: 'https://www.assai.com.br/ofertas/ceara/assai-montese',
          leaflets: [],
          errorMessage: 'Store failed.',
        },
      ],
      failures: [
        {
          targetId: 'assai:store:assai-montese',
          message: 'Store failed.',
        },
      ],
    });
    expect(extractionService.inputs[0]?.visualDataset).toEqual({
      runId: 'run-1',
      split: 'unassigned',
    });
    expect(storage.inputs[0]).toEqual({
      rootDirectory: '.data/leaflets-playwright',
      supermarketId: 'assai',
      extractedAtIso: '2026-08-05T10:00:00.000Z',
      units: [
        {
          unitId: 'assai-parangaba',
          unitName: 'Assai Atacadista Parangaba',
          sourceUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
          leaflets: [
            {
              leafletId: 'assai-parangaba-200-jornal-de-ofertas-1',
              title: 'Jornal de Ofertas 1',
              coverImageUrl: 'https://cdn.example/page-1.jpeg',
              imageUrls: ['https://cdn.example/page-1.jpeg', 'https://cdn.example/page-2.jpeg'],
            },
          ],
        },
      ],
    });
  });

  it('does not enable Visual Dataset when policy is disabled', async () => {
    const extractionService = new FakeExtractionService({
      ...createExtractionResult(),
      failedStores: [],
    });
    const adapter = createAdapter({
      extractionService,
      storage: new FakeStorage(createStoredExtraction()),
      countVisualDatasetSamples: () => Promise.resolve(8),
    });

    const output = await adapter.execute(createInput('disabled'));

    expect(output.datasetSamplesCreated).toBe(0);
    expect(output.status).toBe('succeeded');
    expect(extractionService.inputs[0]?.visualDataset).toBeUndefined();
  });

  it('maps empty and fully failed units', async () => {
    const storedExtraction = createStoredExtraction();
    const storedUnit = storedExtraction.units[0];

    if (storedUnit === undefined) {
      throw new Error('Expected stored unit fixture.');
    }

    const adapter = createAdapter({
      extractionService: new FakeExtractionService({
        ...createExtractionResult(),
        stores: [],
      }),
      storage: new FakeStorage({
        ...storedExtraction,
        units: [{ ...storedUnit, leaflets: [] }],
        sharedLeaflets: [],
      }),
      countVisualDatasetSamples: () => Promise.resolve(0),
    });

    const output = await adapter.execute(createInput('disabled'));

    expect(output.status).toBe('failed');
    expect(output.units[0]?.status).toBe('empty');
    expect(output.units[0]?.leaflets).toEqual([]);
  });

  it('reports zero artifacts when a stored leaflet has no shared gallery match', async () => {
    const storedExtraction = createStoredExtraction();

    const adapter = createAdapter({
      extractionService: new FakeExtractionService({
        ...createExtractionResult(),
        failedStores: [],
      }),
      storage: new FakeStorage({
        ...storedExtraction,
        sharedLeaflets: [],
      }),
      countVisualDatasetSamples: () => Promise.resolve(0),
    });

    const output = await adapter.execute(createInput('disabled'));

    expect(output.units[0]?.leaflets[0]?.artifactCount).toBe(0);
  });
});

function createAdapter(input: {
  readonly extractionService: AssaiPlaywrightExtractionPort;
  readonly storage: AssaiPlaywrightStoragePort;
  readonly countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>;
}): AssaiPlaywrightStrategyAdapter {
  return new AssaiPlaywrightStrategyAdapter(
    {
      extractionInput: {
        stores: [],
        viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
        timeoutMs: 30_000,
        storeTimeoutMs: 90_000,
        maxStoreAttempts: 2,
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
      targetId: 'assai',
      supermarketId: 'assai',
      supermarketName: 'Assai',
      mode: 'playwright',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 2,
    },
    startedAtIso: '2026-08-05T09:59:00.000Z',
    visualDatasetCapturePolicy,
    logger: new NullLogger(),
  };
}

function createExtractionResult(): AssaiLeafletExtractionResult {
  return {
    source: 'assai-playwright',
    extractedAtIso: '2026-08-05T10:00:00.000Z',
    stores: [
      {
        store: {
          stateCode: 'CE',
          stateName: 'Ceara',
          cityName: 'Fortaleza',
          storeSlug: 'assai-parangaba',
          storeName: 'Assai Atacadista Parangaba',
          initialPageUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
        },
        sourceUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
        leaflets: [
          {
            leafletId: 'assai-parangaba-200-jornal-de-ofertas-1',
            title: 'Jornal de Ofertas 1',
            coverImageUrl: 'https://cdn.example/page-1.jpeg',
            imageUrls: ['https://cdn.example/page-1.jpeg', 'https://cdn.example/page-2.jpeg'],
            startDateIso: '2026-07-20',
            endDateIso: '2026-07-23',
          },
        ],
      },
    ],
    failedStores: [
      {
        store: {
          stateCode: 'CE',
          stateName: 'Ceara',
          cityName: 'Fortaleza',
          storeSlug: 'assai-montese',
          storeName: 'Assai Atacadista Montese',
          initialPageUrl: 'https://www.assai.com.br/ofertas/ceara/assai-montese',
        },
        sourceUrl: 'https://www.assai.com.br/ofertas/ceara/assai-montese',
        errorMessage: 'Store failed.',
      },
    ],
  };
}

function createStoredExtraction(): StoredSharedImageGalleryExtraction {
  return {
    directoryPath: '.data/leaflets-playwright/assai/2026-08-05/10-00',
    metadataPath: '.data/leaflets-playwright/assai/2026-08-05/10-00/metadata.json',
    sharedImagesDirectoryPath: '.data/leaflets-playwright/assai/shared-images',
    sharedLeafletsDirectoryPath: '.data/leaflets-playwright/assai/shared-leaflets',
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedImagesDownloaded: 2,
    sharedImagesReused: 1,
    units: [
      {
        unitId: 'assai-parangaba',
        unitName: 'Assai Atacadista Parangaba',
        sourceUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
        directoryPath: '.data/unit',
        metadataPath: '.data/unit/metadata.json',
        leafletsDirectoryPath: '.data/unit/leaflets',
        leaflets: [
          {
            leafletId: 'assai-parangaba-200-jornal-de-ofertas-1',
            title: 'Jornal de Ofertas 1',
            coverImageUrl: 'https://cdn.example/page-1.jpeg',
            contentSignature: 'signature-1',
            sharedLeafletDirectoryPath: '.data/shared-leaflets/signature-1',
            referencePath: '.data/unit/leaflets/signature-1.json',
          },
        ],
      },
    ],
    sharedLeaflets: [
      {
        contentSignature: 'signature-1',
        representativeLeafletId: 'assai-parangaba-200-jornal-de-ofertas-1',
        title: 'Jornal de Ofertas 1',
        directoryPath: '.data/shared-leaflets/signature-1',
        metadataPath: '.data/shared-leaflets/signature-1/metadata.json',
        images: [
          {
            order: 1,
            sourceUrl: 'https://cdn.example/page-1.jpeg',
            canonicalUrl: 'https://cdn.example/page-1.jpeg',
            filePath: '.data/shared-images/page-1.jpeg',
            contentType: 'image/jpeg',
            byteLength: 10,
            contentHash: 'hash-1',
          },
          {
            order: 2,
            sourceUrl: 'https://cdn.example/page-2.jpeg',
            canonicalUrl: 'https://cdn.example/page-2.jpeg',
            filePath: '.data/shared-images/page-2.jpeg',
            contentType: 'image/jpeg',
            byteLength: 10,
            contentHash: 'hash-2',
          },
        ],
      },
    ],
  };
}

class FakeExtractionService implements AssaiPlaywrightExtractionPort {
  readonly inputs: Parameters<AssaiPlaywrightExtractionPort['extract']>[0][] = [];

  private readonly result: AssaiLeafletExtractionResult;

  constructor(result: AssaiLeafletExtractionResult) {
    this.result = result;
  }

  extract(
    input: Parameters<AssaiPlaywrightExtractionPort['extract']>[0],
  ): Promise<AssaiLeafletExtractionResult> {
    this.inputs.push(input);

    return Promise.resolve(this.result);
  }
}

class FakeStorage implements AssaiPlaywrightStoragePort {
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

class NullLogger {
  debug(message: string): void {
    void message;
  }

  info(message: string): void {
    void message;
  }

  warn(message: string): void {
    void message;
  }

  error(message: string): void {
    void message;
  }
}
