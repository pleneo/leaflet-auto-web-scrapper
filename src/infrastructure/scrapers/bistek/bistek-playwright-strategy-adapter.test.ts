import { describe, expect, it } from 'vitest';
import type { PlaywrightExtractionInput } from '../../../application/ports/playwright-extraction-strategy';
import type {
  StoreSharedImageGalleryExtractionInput,
  StoredSharedImageGalleryExtraction,
} from '../../storage/shared-image-gallery-storage';
import type {
  BistekLeafletExtractionResult,
  ExtractBistekLeafletsInput,
} from './bistek-leaflet-extractor';
import {
  BistekPlaywrightStrategyAdapter,
  type BistekPlaywrightExtractionPort,
  type BistekPlaywrightStoragePort,
} from './bistek-playwright-strategy-adapter';

describe('BistekPlaywrightStrategyAdapter', () => {
  it('passes visual dataset input and maps stored output', async () => {
    const extractionService = new FakePlaywrightExtractionService(createExtractionResult());
    const storage = new FakeImageGalleryStorage(createStoredExtraction());
    const adapter = createAdapter(extractionService, storage);

    const output = await adapter.execute(createInput('always'));

    expect(output.status).toBe('partially_succeeded');
    expect(output.leafletsFound).toBe(1);
    expect(output.artifactsDownloaded).toBe(1);
    expect(output.datasetSamplesCreated).toBe(5);
    expect(output.failures[0]?.targetId).toBe('bistek:store:bistek-store-3');
    expect(extractionService.inputs[0]?.visualDataset).toEqual({
      runId: 'run-1',
      split: 'train',
    });
    expect(storage.inputs[0]?.supermarketId).toBe('bistek');
  });

  it('does not pass visual dataset input when capture is disabled and maps failed output', async () => {
    const extractionService = new FakePlaywrightExtractionService({
      ...createExtractionResult(),
      stores: [],
    });
    const storage = new FakeImageGalleryStorage({
      ...createStoredExtraction(),
      units: [],
    });
    const output = await createAdapter(extractionService, storage).execute(createInput('disabled'));

    expect(output.status).toBe('failed');
    expect(output.datasetSamplesCreated).toBe(0);
    expect(extractionService.inputs[0]?.visualDataset).toBeUndefined();
  });

  it('maps succeeded status when every store succeeds', async () => {
    const extractionService = new FakePlaywrightExtractionService({
      ...createExtractionResult(),
      failedStores: [],
    });
    const output = await createAdapter(
      extractionService,
      new FakeImageGalleryStorage(createStoredExtraction()),
    ).execute(createInput('disabled'));

    expect(output.status).toBe('succeeded');
  });
});

function createAdapter(
  extractionService: BistekPlaywrightExtractionPort,
  storage: BistekPlaywrightStoragePort,
): BistekPlaywrightStrategyAdapter {
  return new BistekPlaywrightStrategyAdapter(
    {
      extractionInput: {
        offersUrl: 'https://institucional.bistek.com.br/ofertas',
        viewport: {
          width: 1366,
          height: 768,
          deviceScaleFactor: 1,
        },
        timeoutMs: 30_000,
        storeTimeoutMs: 60_000,
        maxStoreAttempts: 2,
        settleDelayMs: 1_000,
        storeIds: [],
        cityIds: [],
      },
      outputRootDirectory: '.data/leaflets-playwright',
      visualDatasetRootDirectory: '.data/visual-dataset',
      visualDatasetSplit: 'train',
    },
    {
      extractionService,
      storage,
      countVisualDatasetSamples: () => Promise.resolve(5),
    },
  );
}

class FakePlaywrightExtractionService implements BistekPlaywrightExtractionPort {
  readonly inputs: ExtractBistekLeafletsInput[] = [];

  private readonly result: BistekLeafletExtractionResult;

  constructor(result: BistekLeafletExtractionResult) {
    this.result = result;
  }

  extract(input: ExtractBistekLeafletsInput): Promise<BistekLeafletExtractionResult> {
    this.inputs.push(input);

    return Promise.resolve(this.result);
  }
}

class FakeImageGalleryStorage implements BistekPlaywrightStoragePort {
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

function createInput(
  visualDatasetCapturePolicy: PlaywrightExtractionInput['visualDatasetCapturePolicy'],
): PlaywrightExtractionInput {
  return {
    runId: 'run-1',
    target: {
      targetId: 'bistek',
      supermarketId: 'bistek',
      supermarketName: 'Bistek',
      mode: 'playwright',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    },
    startedAtIso: '2026-08-14T10:00:00.000Z',
    visualDatasetCapturePolicy,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  };
}

function createExtractionResult(): BistekLeafletExtractionResult {
  return {
    source: 'bistek-playwright',
    extractedAtIso: '2026-08-14T10:00:00.000Z',
    stores: [
      {
        unitId: 'bistek-store-2',
        unitName: 'SC - Blumenau - Loja Nº 4',
        sourceUrl: 'https://institucional.bistek.com.br/ofertas',
        store: {
          cityId: '4348',
          stateCode: 'SC',
          cityName: 'Blumenau',
          storeId: '2',
          storeName: 'Loja Nº 4',
          storeSlug: 'store-2',
        },
        leaflets: [
          {
            leafletId: 'bistek-store-2-oferta-1',
            title: 'Ofertas',
            sourcePageUrl: 'https://institucional.bistek.com.br/ofertas',
            coverImageUrl: 'https://institucional.bistek.com.br/image/1.jpg',
            imageUrls: ['https://institucional.bistek.com.br/image/1.jpg'],
            validityStartDateIso: null,
            validityEndDateIso: null,
          },
        ],
      },
    ],
    failedStores: [
      {
        unitId: 'bistek-store-3',
        unitName: 'SC - Blumenau - Loja Nº 17',
        sourceUrl: 'https://institucional.bistek.com.br/ofertas',
        errorMessage: 'Store failed.',
      },
    ],
  };
}

function createStoredExtraction(): StoredSharedImageGalleryExtraction {
  return {
    directoryPath: '.data/leaflets-playwright/bistek/2026-08-14/10-00',
    metadataPath: '.data/leaflets-playwright/bistek/2026-08-14/10-00/metadata.json',
    sharedImagesDirectoryPath: '.data/leaflets-playwright/bistek/shared-images',
    sharedLeafletsDirectoryPath: '.data/leaflets-playwright/bistek/shared-leaflets',
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedImagesDownloaded: 1,
    sharedImagesReused: 0,
    units: [
      {
        unitId: 'bistek-store-2',
        unitName: 'SC - Blumenau - Loja Nº 4',
        sourceUrl: 'https://institucional.bistek.com.br/ofertas',
        directoryPath: '.data/unit',
        metadataPath: '.data/unit/metadata.json',
        leafletsDirectoryPath: '.data/unit/leaflets',
        leaflets: [
          {
            leafletId: 'bistek-store-2-oferta-1',
            title: 'Ofertas',
            coverImageUrl: 'https://institucional.bistek.com.br/image/1.jpg',
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
        representativeLeafletId: 'bistek-store-2-oferta-1',
        title: 'Ofertas',
        directoryPath: '.data/shared-leaflets/signature-1',
        metadataPath: '.data/shared-leaflets/signature-1/metadata.json',
        images: [
          {
            order: 1,
            sourceUrl: 'https://institucional.bistek.com.br/image/1.jpg',
            canonicalUrl: 'https://institucional.bistek.com.br/image/1.jpg',
            filePath: '.data/shared-images/1.jpg',
            contentType: 'image/jpeg',
            byteLength: 3,
            contentHash: 'hash-1',
          },
        ],
      },
    ],
  };
}
