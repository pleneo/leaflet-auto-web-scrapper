import { describe, expect, it } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type { PlaywrightExtractionInput } from '../../../application/ports/playwright-extraction-strategy';
import type {
  StoreSharedImageGalleryExtractionInput,
  StoredSharedImageGalleryExtraction,
} from '../../storage/shared-image-gallery-storage';
import type {
  ComboAtacadistaLeafletExtractionResult,
  ExtractComboAtacadistaLeafletsInput,
} from './combo-atacadista-leaflet-extractor';
import {
  ComboAtacadistaPlaywrightStrategyAdapter,
  type ComboAtacadistaPlaywrightExtractionPort,
  type ComboAtacadistaPlaywrightStoragePort,
} from './combo-atacadista-playwright-strategy-adapter';

describe('ComboAtacadistaPlaywrightStrategyAdapter', () => {
  it('passes visual dataset input and maps stored output', async () => {
    const extractionService = new FakePlaywrightExtractionService(createExtractionResult());
    const storage = new FakeImageGalleryStorage(createStoredExtraction());
    const adapter = createAdapter(extractionService, storage);

    const output = await adapter.execute(createInput('always'));

    expect(output.status).toBe('partially_succeeded');
    expect(output.leafletsFound).toBe(1);
    expect(output.artifactsDownloaded).toBe(2);
    expect(output.artifactsReused).toBe(1);
    expect(output.datasetSamplesCreated).toBe(3);
    expect(output.failures[0]?.targetId).toBe('comboatacadista:unit:comboatacadista-online');
    expect(extractionService.inputs[0]?.visualDataset).toEqual({
      runId: 'run-1',
      split: 'train',
    });
    expect(storage.inputs[0]?.supermarketId).toBe('comboatacadista');
  });

  it('does not pass visual dataset input when capture is disabled', async () => {
    const extractionService = new FakePlaywrightExtractionService({
      ...createExtractionResult(),
      failedUnits: [],
    });
    const adapter = createAdapter(
      extractionService,
      new FakeImageGalleryStorage({
        ...createStoredExtraction(),
        sharedLeaflets: [],
      }),
    );

    const output = await adapter.execute(createInput('disabled'));

    expect(output.status).toBe('succeeded');
    expect(output.datasetSamplesCreated).toBe(0);
    expect(output.units[0]?.leaflets[0]?.artifactCount).toBe(0);
    expect(extractionService.inputs[0]?.visualDataset).toBeUndefined();
  });

  it('maps failed output', async () => {
    const output = await createAdapter(
      new FakePlaywrightExtractionService({
        ...createExtractionResult(),
        units: [],
      }),
      new FakeImageGalleryStorage({
        ...createStoredExtraction(),
        units: [],
      }),
    ).execute(createInput('disabled'));

    expect(output.status).toBe('failed');
  });
});

function createAdapter(
  extractionService: ComboAtacadistaPlaywrightExtractionPort,
  storage: ComboAtacadistaPlaywrightStoragePort,
): ComboAtacadistaPlaywrightStrategyAdapter {
  return new ComboAtacadistaPlaywrightStrategyAdapter(
    {
      extractionInput: {
        homeUrl: 'https://www.comboatacadista.com.br/',
        offersUrl: 'https://www.comboatacadista.com.br/ofertas',
        startUrlMode: 'offers-page',
        viewport: {
          width: 1280,
          height: 720,
          deviceScaleFactor: 1,
        },
        timeoutMs: 30_000,
        settleDelayMs: 1_000,
      },
      outputRootDirectory: '.data/leaflets-playwright',
      visualDatasetRootDirectory: '.data/visual-dataset',
      visualDatasetSplit: 'train',
    },
    {
      extractionService,
      storage,
      countVisualDatasetSamples: () => Promise.resolve(3),
    },
  );
}

function createInput(
  visualDatasetCapturePolicy: PlaywrightExtractionInput['visualDatasetCapturePolicy'],
): PlaywrightExtractionInput {
  return {
    runId: 'run-1',
    target: {
      targetId: 'comboatacadista',
      supermarketId: 'comboatacadista',
      supermarketName: 'Combo Atacadista',
      mode: 'playwright',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    },
    startedAtIso: '2026-08-13T10:00:00.000Z',
    visualDatasetCapturePolicy,
    logger: new NullLogger(),
  };
}

function createExtractionResult(): ComboAtacadistaLeafletExtractionResult {
  return {
    source: 'comboatacadista-playwright',
    extractedAtIso: '2026-08-13T10:00:00.000Z',
    units: [
      {
        unitId: 'comboatacadista-online',
        unitName: 'Combo Atacadista',
        sourceUrl: 'https://www.comboatacadista.com.br/ofertas',
        leaflets: [
          {
            leafletId: 'comboatacadista-ofertas-dia',
            title: 'Ofertas do dia',
            sourcePageUrl: 'https://www.comboatacadista.com.br/ofertas-dia',
            coverImageUrl: 'https://www.comboatacadista.com.br/upload/weekend_image/1.jpeg',
            imageUrls: ['https://www.comboatacadista.com.br/upload/weekend_image/1.jpeg'],
            validUntilIso: '2026-08-13',
          },
        ],
      },
    ],
    failedUnits: [
      {
        unitId: 'comboatacadista-online',
        unitName: 'Combo Atacadista',
        sourceUrl: 'https://www.comboatacadista.com.br/ofertas',
        errorMessage: 'Unit failed.',
      },
    ],
  };
}

function createStoredExtraction(): StoredSharedImageGalleryExtraction {
  return {
    directoryPath: '.data/leaflets-playwright/comboatacadista/2026-08-13/10-00',
    metadataPath: '.data/leaflets-playwright/comboatacadista/2026-08-13/10-00/metadata.json',
    sharedImagesDirectoryPath: '.data/leaflets-playwright/comboatacadista/shared-images',
    sharedLeafletsDirectoryPath: '.data/leaflets-playwright/comboatacadista/shared-leaflets',
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedImagesDownloaded: 2,
    sharedImagesReused: 1,
    units: [
      {
        unitId: 'comboatacadista-online',
        unitName: 'Combo Atacadista',
        sourceUrl: 'https://www.comboatacadista.com.br/ofertas',
        directoryPath: '.data/unit',
        metadataPath: '.data/unit/metadata.json',
        leafletsDirectoryPath: '.data/unit/leaflets',
        leaflets: [
          {
            leafletId: 'comboatacadista-ofertas-dia',
            title: 'Ofertas do dia',
            coverImageUrl: 'https://www.comboatacadista.com.br/upload/weekend_image/1.jpeg',
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
        representativeLeafletId: 'comboatacadista-ofertas-dia',
        title: 'Ofertas do dia',
        directoryPath: '.data/shared-leaflets/signature-1',
        metadataPath: '.data/shared-leaflets/signature-1/metadata.json',
        images: [
          {
            order: 1,
            sourceUrl: 'https://www.comboatacadista.com.br/upload/weekend_image/1.jpeg',
            canonicalUrl: 'https://www.comboatacadista.com.br/upload/weekend_image/1.jpeg',
            filePath: '.data/shared-images/1.jpeg',
            contentType: 'image/jpeg',
            byteLength: 100,
            contentHash: 'hash-1',
          },
        ],
      },
    ],
  };
}

class FakePlaywrightExtractionService implements ComboAtacadistaPlaywrightExtractionPort {
  readonly inputs: ExtractComboAtacadistaLeafletsInput[] = [];

  private readonly result: ComboAtacadistaLeafletExtractionResult;

  constructor(result: ComboAtacadistaLeafletExtractionResult) {
    this.result = result;
  }

  extract(
    input: ExtractComboAtacadistaLeafletsInput,
  ): Promise<ComboAtacadistaLeafletExtractionResult> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}

class FakeImageGalleryStorage implements ComboAtacadistaPlaywrightStoragePort {
  readonly inputs: StoreSharedImageGalleryExtractionInput[] = [];

  private readonly stored: StoredSharedImageGalleryExtraction;

  constructor(stored: StoredSharedImageGalleryExtraction) {
    this.stored = stored;
  }

  store(
    input: StoreSharedImageGalleryExtractionInput,
  ): Promise<StoredSharedImageGalleryExtraction> {
    this.inputs.push(input);
    return Promise.resolve(this.stored);
  }
}

class NullLogger implements Logger {
  debug(): void {
    return undefined;
  }

  info(): void {
    return undefined;
  }

  warn(): void {
    return undefined;
  }

  error(): void {
    return undefined;
  }
}
