import { describe, expect, it } from 'vitest';
import type { ExtractionStrategyInput } from '../../../application/ports/extraction-strategy';
import type { Logger } from '../../../application/ports/logger';
import type {
  StoreSharedImageGalleryExtractionInput,
  StoredSharedImageGalleryExtraction,
} from '../../storage/shared-image-gallery-storage';
import type {
  CarnaubaApiExtractionInput,
  CarnaubaApiExtractionResult,
} from './carnauba-api-extraction';
import {
  CarnaubaApiStrategyAdapter,
  type CarnaubaApiExtractionPort,
  type CarnaubaApiStoragePort,
} from './carnauba-api-strategy-adapter';

describe('CarnaubaApiStrategyAdapter', () => {
  it('maps API extraction and shared storage into generic worker output', async () => {
    const extractionService = new FakeExtractionService(createExtractionResult());
    const storage = new FakeStorage(createStoredExtraction());
    const adapter = createAdapter(extractionService, storage);

    const output = await adapter.execute(createInput());

    expect(output).toEqual({
      runId: 'run-1',
      targetId: 'carnauba',
      supermarketId: 'carnauba',
      status: 'succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 2,
      artifactsReused: 1,
      datasetSamplesCreated: 0,
      units: [
        {
          unitId: '79',
          unitName: 'Maestro',
          status: 'succeeded',
          sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
          leaflets: [
            {
              leafletKey: 'signature-1',
              title: 'Leaflet 1',
              contentSignature: 'signature-1',
              artifactCount: 2,
              sourceUrl: 'https://cdn.example.com/page-1.jpeg',
            },
          ],
          errorMessage: null,
        },
      ],
      failures: [],
    });
    expect(extractionService.inputs).toEqual([
      {
        brandId: 27,
        storeCacheTtlMs: 86_400_000,
      },
    ]);
    expect(storage.inputs[0]).toEqual({
      rootDirectory: '.data/leaflets-api',
      supermarketId: 'carnauba',
      extractedAtIso: '2026-08-06T10:00:00.000Z',
      units: [
        {
          unitId: '79',
          unitName: 'Maestro',
          sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
          leaflets: [
            {
              leafletId: '100-leaflet-1',
              title: 'Leaflet 1',
              coverImageUrl: 'https://cdn.example.com/page-1.jpeg',
              imageUrls: [
                'https://cdn.example.com/page-1.jpeg',
                'https://cdn.example.com/page-2.jpeg',
              ],
            },
          ],
        },
      ],
    });
  });

  it('maps stored stores without leaflets as empty units', async () => {
    const adapter = createAdapter(
      new FakeExtractionService({
        ...createExtractionResult(),
        stores: [
          {
            store: {
              storeId: 79,
              name: 'Maestro',
              cnpj: '',
              corporateName: '',
            },
            leaflets: [],
          },
        ],
      }),
      new FakeStorage({
        ...createStoredExtraction(),
        sharedLeaflets: [],
        units: [
          {
            unitId: '79',
            unitName: 'Maestro',
            sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
            directoryPath: '.data/unit',
            metadataPath: '.data/unit/metadata.json',
            leafletsDirectoryPath: '.data/unit/leaflets',
            leaflets: [],
          },
        ],
      }),
    );

    const output = await adapter.execute(createInput());

    expect(output.leafletsFound).toBe(0);
    expect(output.units[0]?.status).toBe('empty');
  });

  it('uses fallback cover and zero artifact count when storage metadata is incomplete', async () => {
    const adapter = createAdapter(
      new FakeExtractionService({
        ...createExtractionResult(),
        stores: [
          {
            store: {
              storeId: 79,
              name: 'Maestro',
              cnpj: '',
              corporateName: '',
            },
            leaflets: [
              {
                leafletId: 'empty',
                flipbookId: 999,
                title: 'Empty leaflet',
                images: [],
              },
            ],
          },
        ],
      }),
      new FakeStorage({
        ...createStoredExtraction(),
        sharedLeaflets: [],
      }),
    );

    await adapter.execute(createInput());

    expect(adapter.mode).toBe('api');
  });
});

function createAdapter(
  extractionService: CarnaubaApiExtractionPort,
  storage: CarnaubaApiStoragePort,
): CarnaubaApiStrategyAdapter {
  return new CarnaubaApiStrategyAdapter(
    {
      extractionInput: {
        brandId: 27,
        storeCacheTtlMs: 86_400_000,
      },
      outputRootDirectory: '.data/leaflets-api',
      siteBaseUrl: 'https://carnaubasupermercados.com.br',
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
      targetId: 'carnauba',
      supermarketId: 'carnauba',
      supermarketName: 'Carnauba Supermercados',
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

function createExtractionResult(): CarnaubaApiExtractionResult {
  return {
    brandId: 27,
    source: 'mercadapp-api',
    extractedAtIso: '2026-08-06T10:00:00.000Z',
    stores: [
      {
        store: {
          storeId: 79,
          name: 'Maestro',
          cnpj: '',
          corporateName: '',
        },
        leaflets: [
          {
            leafletId: '100-leaflet-1',
            flipbookId: 100,
            title: 'Leaflet 1',
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
  };
}

function createStoredExtraction(): StoredSharedImageGalleryExtraction {
  return {
    directoryPath: '.data/leaflets-api/carnauba/2026-08-06/10-00',
    metadataPath: '.data/leaflets-api/carnauba/2026-08-06/10-00/metadata.json',
    sharedImagesDirectoryPath: '.data/leaflets-api/carnauba/shared-images',
    sharedLeafletsDirectoryPath: '.data/leaflets-api/carnauba/shared-leaflets',
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedImagesDownloaded: 2,
    sharedImagesReused: 1,
    units: [
      {
        unitId: '79',
        unitName: 'Maestro',
        sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
        directoryPath: '.data/unit',
        metadataPath: '.data/unit/metadata.json',
        leafletsDirectoryPath: '.data/unit/leaflets',
        leaflets: [
          {
            leafletId: '100-leaflet-1',
            title: 'Leaflet 1',
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
        representativeLeafletId: '100-leaflet-1',
        title: 'Leaflet 1',
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

class FakeExtractionService implements CarnaubaApiExtractionPort {
  readonly inputs: CarnaubaApiExtractionInput[] = [];

  private readonly result: CarnaubaApiExtractionResult;

  constructor(result: CarnaubaApiExtractionResult) {
    this.result = result;
  }

  extract(input: CarnaubaApiExtractionInput): Promise<CarnaubaApiExtractionResult> {
    this.inputs.push(input);

    return Promise.resolve(this.result);
  }
}

class FakeStorage implements CarnaubaApiStoragePort {
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
