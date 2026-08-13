import { describe, expect, it } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type { ExtractionStrategyInput } from '../../../application/ports/extraction-strategy';
import type {
  StoreSharedImageGalleryExtractionInput,
  StoredSharedImageGalleryExtraction,
} from '../../storage/shared-image-gallery-storage';
import type {
  ComboAtacadistaApiExtractionInput,
  ComboAtacadistaApiExtractionResult,
} from './combo-atacadista-api-extraction';
import {
  ComboAtacadistaApiStrategyAdapter,
  type ComboAtacadistaApiExtractionPort,
  type ComboAtacadistaImageGalleryStoragePort,
} from './combo-atacadista-api-strategy-adapter';

describe('ComboAtacadistaApiStrategyAdapter', () => {
  it('maps API extraction output to worker output and shared image storage', async () => {
    const extractionService = new FakeApiExtractionService(createExtractionResult());
    const storage = new FakeImageGalleryStorage(createStoredExtraction());
    const adapter = createAdapter(extractionService, storage);

    const output = await adapter.execute(createInput('api'));

    expect(output).toMatchObject({
      status: 'partially_succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 2,
      artifactsReused: 1,
      datasetSamplesCreated: 0,
      failures: [
        {
          targetId: 'comboatacadista:unit:comboatacadista-online',
          message: 'Unit failed.',
        },
      ],
    });
    expect(output.units[0]?.leaflets[0]).toEqual({
      leafletKey: 'signature-1',
      title: 'Ofertas do dia',
      contentSignature: 'signature-1',
      artifactCount: 2,
      sourceUrl: 'https://www.comboatacadista.com.br/upload/weekend_image/1.jpeg',
    });
    expect(storage.inputs[0]?.supermarketId).toBe('comboatacadista');
  });

  it('maps succeeded and failed statuses', async () => {
    const succeeded = await createAdapter(
      new FakeApiExtractionService({
        ...createExtractionResult(),
        failedUnits: [],
      }),
      new FakeImageGalleryStorage({
        ...createStoredExtraction(),
        sharedLeaflets: [],
      }),
    ).execute(createInput('api'));
    const failed = await createAdapter(
      new FakeApiExtractionService({
        ...createExtractionResult(),
        units: [],
      }),
      new FakeImageGalleryStorage({
        ...createStoredExtraction(),
        units: [
          {
            ...createStoredUnit(),
            leaflets: [],
          },
        ],
        sharedLeaflets: [],
      }),
    ).execute(createInput('api'));

    expect(succeeded.status).toBe('succeeded');
    expect(succeeded.units[0]?.leaflets[0]?.artifactCount).toBe(0);
    expect(failed.status).toBe('failed');
    expect(failed.units[0]?.status).toBe('empty');
  });
});

function createAdapter(
  extractionService: ComboAtacadistaApiExtractionPort,
  storage: ComboAtacadistaImageGalleryStoragePort,
): ComboAtacadistaApiStrategyAdapter {
  return new ComboAtacadistaApiStrategyAdapter(
    {
      extractionInput: {
        offersUrl: 'https://www.comboatacadista.com.br/ofertas',
      },
      outputRootDirectory: '.data/leaflets-api',
    },
    {
      extractionService,
      storage,
    },
  );
}

function createInput(mode: ExtractionStrategyInput['target']['mode']): ExtractionStrategyInput {
  return {
    runId: 'run-1',
    target: {
      targetId: 'comboatacadista',
      supermarketId: 'comboatacadista',
      supermarketName: 'Combo Atacadista',
      mode,
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    },
    startedAtIso: '2026-08-13T10:00:00.000Z',
    visualDatasetCapturePolicy: 'disabled',
    logger: new NullLogger(),
  };
}

export function createExtractionResult(): ComboAtacadistaApiExtractionResult {
  return {
    source: 'comboatacadista-api',
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
            imageUrls: [
              'https://www.comboatacadista.com.br/upload/weekend_image/1.jpeg',
              'https://www.comboatacadista.com.br/upload/weekend_image/2.jpeg',
            ],
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

export function createStoredExtraction(): StoredSharedImageGalleryExtraction {
  return {
    directoryPath: '.data/leaflets-api/comboatacadista/2026-08-13/10-00',
    metadataPath: '.data/leaflets-api/comboatacadista/2026-08-13/10-00/metadata.json',
    sharedImagesDirectoryPath: '.data/leaflets-api/comboatacadista/shared-images',
    sharedLeafletsDirectoryPath: '.data/leaflets-api/comboatacadista/shared-leaflets',
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedImagesDownloaded: 2,
    sharedImagesReused: 1,
    units: [createStoredUnit()],
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
          {
            order: 2,
            sourceUrl: 'https://www.comboatacadista.com.br/upload/weekend_image/2.jpeg',
            canonicalUrl: 'https://www.comboatacadista.com.br/upload/weekend_image/2.jpeg',
            filePath: '.data/shared-images/2.jpeg',
            contentType: 'image/jpeg',
            byteLength: 100,
            contentHash: 'hash-2',
          },
        ],
      },
    ],
  };
}

function createStoredUnit(): StoredSharedImageGalleryExtraction['units'][number] {
  return {
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
  };
}

class FakeApiExtractionService implements ComboAtacadistaApiExtractionPort {
  readonly inputs: ComboAtacadistaApiExtractionInput[] = [];

  private readonly result: ComboAtacadistaApiExtractionResult;

  constructor(result: ComboAtacadistaApiExtractionResult) {
    this.result = result;
  }

  extract(input: ComboAtacadistaApiExtractionInput): Promise<ComboAtacadistaApiExtractionResult> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}

class FakeImageGalleryStorage implements ComboAtacadistaImageGalleryStoragePort {
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
