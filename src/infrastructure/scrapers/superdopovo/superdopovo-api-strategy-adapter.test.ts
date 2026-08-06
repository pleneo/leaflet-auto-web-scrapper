import { describe, expect, it } from 'vitest';
import type { ExtractionStrategyInput } from '../../../application/ports/extraction-strategy';
import type { Logger } from '../../../application/ports/logger';
import type {
  StoreSharedImageGalleryExtractionInput,
  StoredSharedImageGalleryExtraction,
} from '../../storage/shared-image-gallery-storage';
import type {
  SuperDoPovoApiExtractionInput,
  SuperDoPovoApiExtractionResult,
} from './superdopovo-api-extraction';
import {
  SuperDoPovoApiStrategyAdapter,
  type SuperDoPovoApiExtractionPort,
  type SuperDoPovoApiStoragePort,
} from './superdopovo-api-strategy-adapter';

describe('SuperDoPovoApiStrategyAdapter', () => {
  it('maps API extraction and shared storage into generic worker output', async () => {
    const extractionService = new FakeExtractionService(createExtractionResult());
    const storage = new FakeStorage(createStoredExtraction());
    const adapter = createAdapter(extractionService, storage);

    const output = await adapter.execute(createInput());

    expect(output.status).toBe('partially_succeeded');
    expect(output.leafletsFound).toBe(1);
    expect(output.artifactsDownloaded).toBe(2);
    expect(output.artifactsReused).toBe(1);
    expect(output.datasetSamplesCreated).toBe(0);
    expect(output.failures).toEqual([
      {
        targetId: 'superdopovo:shop:57',
        message: 'Shop failed.',
      },
    ]);
    expect(output.units).toEqual([
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
            artifactCount: 2,
            sourceUrl: 'https://cdn.example.com/page-1.jpeg',
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
        errorMessage: 'Shop failed.',
      },
    ]);
    expect(extractionService.inputs).toEqual([
      {
        siteBaseUrl: 'https://loja.superdopovo.com.br',
      },
    ]);
    expect(storage.inputs[0]?.units[0]?.leaflets[0]?.imageUrls).toEqual([
      'https://cdn.example.com/page-1.jpeg',
      'https://cdn.example.com/page-2.jpeg',
    ]);
  });

  it('maps empty successful units and fully failed extraction status', async () => {
    const adapter = createAdapter(
      new FakeExtractionService({
        ...createExtractionResult(),
        shops: [],
      }),
      new FakeStorage({
        ...createStoredExtraction(),
        units: [
          {
            unitId: '24',
            unitName: 'Serrinha',
            sourceUrl: 'https://loja.superdopovo.com.br/booklets',
            directoryPath: '.data/unit',
            metadataPath: '.data/unit/metadata.json',
            leafletsDirectoryPath: '.data/unit/leaflets',
            leaflets: [],
          },
        ],
        sharedLeaflets: [],
      }),
    );

    const output = await adapter.execute(createInput());

    expect(output.status).toBe('failed');
    expect(output.units[0]?.status).toBe('empty');
  });

  it('maps succeeded output and zero artifact count without shared leaflet metadata', async () => {
    const adapter = createAdapter(
      new FakeExtractionService({
        ...createExtractionResult(),
        failedShops: [],
      }),
      new FakeStorage({
        ...createStoredExtraction(),
        sharedLeaflets: [],
      }),
    );

    const output = await adapter.execute(createInput());

    expect(output.status).toBe('succeeded');
    expect(output.failures).toEqual([]);
    expect(output.units[0]?.leaflets[0]?.artifactCount).toBe(0);
  });
});

function createAdapter(
  extractionService: SuperDoPovoApiExtractionPort,
  storage: SuperDoPovoApiStoragePort,
): SuperDoPovoApiStrategyAdapter {
  return new SuperDoPovoApiStrategyAdapter(
    {
      extractionInput: {
        siteBaseUrl: 'https://loja.superdopovo.com.br',
      },
      outputRootDirectory: '.data/leaflets-api',
    },
    {
      extractionService,
      storage,
    },
  );
}

function createInput(): ExtractionStrategyInput {
  return {
    runId: 'run-1',
    target: {
      targetId: 'superdopovo',
      supermarketId: 'superdopovo',
      supermarketName: 'Super do Povo',
      mode: 'api',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    },
    startedAtIso: '2026-08-06T09:59:00.000Z',
    visualDatasetCapturePolicy: 'disabled',
    logger: new NullLogger(),
  };
}

function createExtractionResult(): SuperDoPovoApiExtractionResult {
  return {
    source: 'superdopovo-api',
    extractedAtIso: '2026-08-06T10:00:00.000Z',
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
        leaflets: [
          {
            leafletId: 'superdopovo-1609',
            title: 'Booklet 1609',
            cardIndex: 0,
            coverImageUrl: 'https://cdn.example.com/page-1.jpeg',
            images: [
              {
                order: 1,
                imageUrl: 'https://cdn.example.com/page-1.jpeg',
              },
              {
                order: 2,
                imageUrl: 'https://cdn.example.com/page-2.jpeg',
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
        errorMessage: 'Shop failed.',
      },
    ],
  };
}

function createStoredExtraction(): StoredSharedImageGalleryExtraction {
  return {
    directoryPath: '.data/leaflets-api/superdopovo/2026-08-06/10-00',
    metadataPath: '.data/leaflets-api/superdopovo/2026-08-06/10-00/metadata.json',
    sharedImagesDirectoryPath: '.data/leaflets-api/superdopovo/shared-images',
    sharedLeafletsDirectoryPath: '.data/leaflets-api/superdopovo/shared-leaflets',
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedImagesDownloaded: 2,
    sharedImagesReused: 1,
    units: [
      {
        unitId: '24',
        unitName: 'Serrinha',
        sourceUrl: 'https://loja.superdopovo.com.br/booklets',
        directoryPath: '.data/unit',
        metadataPath: '.data/unit/metadata.json',
        leafletsDirectoryPath: '.data/unit/leaflets',
        leaflets: [
          {
            leafletId: 'superdopovo-1609',
            title: 'Booklet 1609',
            coverImageUrl: 'https://cdn.example.com/page-1.jpeg',
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
        representativeLeafletId: 'superdopovo-1609',
        title: 'Booklet 1609',
        directoryPath: '.data/shared-leaflets/signature-1',
        metadataPath: '.data/shared-leaflets/signature-1/metadata.json',
        images: [
          {
            order: 1,
            sourceUrl: 'https://cdn.example.com/page-1.jpeg',
            canonicalUrl: 'https://cdn.example.com/page-1.jpeg',
            filePath: '.data/shared-images/page-1.jpeg',
            contentType: 'image/jpeg',
            byteLength: 10,
            contentHash: 'hash-1',
          },
          {
            order: 2,
            sourceUrl: 'https://cdn.example.com/page-2.jpeg',
            canonicalUrl: 'https://cdn.example.com/page-2.jpeg',
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

class FakeExtractionService implements SuperDoPovoApiExtractionPort {
  readonly inputs: SuperDoPovoApiExtractionInput[] = [];

  private readonly result: SuperDoPovoApiExtractionResult;

  constructor(result: SuperDoPovoApiExtractionResult) {
    this.result = result;
  }

  extract(input: SuperDoPovoApiExtractionInput): Promise<SuperDoPovoApiExtractionResult> {
    this.inputs.push(input);

    return Promise.resolve(this.result);
  }
}

class FakeStorage implements SuperDoPovoApiStoragePort {
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

class NullLogger implements Logger {
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
