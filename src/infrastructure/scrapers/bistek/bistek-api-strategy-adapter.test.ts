import { describe, expect, it } from 'vitest';
import type {
  StoreSharedImageGalleryExtractionInput,
  StoredSharedImageGalleryExtraction,
  StoredSharedImageGalleryLeafletReference,
  StoredSharedImageGalleryUnit,
} from '../../storage/shared-image-gallery-storage';
import type { BistekApiExtractionInput, BistekApiExtractionResult } from './bistek-api-extraction';
import {
  BistekApiStrategyAdapter,
  createBistekImageGalleryStorageInput,
} from './bistek-api-strategy-adapter';

describe('BistekApiStrategyAdapter', () => {
  it('maps extracted image galleries to shared gallery storage and strategy output', async () => {
    const extractionService = new FakeExtractionService(createApiResult());
    const storage = new FakeStorage();
    const adapter = new BistekApiStrategyAdapter(
      {
        extractionInput: {
          offersUrl: 'https://institucional.bistek.com.br/ofertas',
          cityIds: [],
          storeIds: [],
        },
        outputRootDirectory: '/tmp/output',
      },
      {
        extractionService,
        storage,
      },
    );

    const output = await adapter.execute({
      runId: 'run-1',
      startedAtIso: '2026-08-14T10:00:00.000Z',
      visualDatasetCapturePolicy: 'disabled',
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
      target: {
        targetId: 'bistek',
        supermarketId: 'bistek',
        supermarketName: 'Bistek',
        enabled: true,
        intervalMinutes: 60,
        maxAttempts: 1,
        mode: 'api',
      },
    });

    expect(extractionService.inputs).toHaveLength(1);
    expect(storage.inputs[0]).toEqual({
      rootDirectory: '/tmp/output',
      supermarketId: 'bistek',
      extractedAtIso: '2026-08-14T10:00:00.000Z',
      units: [
        {
          unitId: 'bistek-store-2',
          unitName: 'SC - Blumenau - Loja Nº 4',
          sourceUrl: 'https://institucional.bistek.com.br/ofertas',
          leaflets: [
            {
              leafletId: 'bistek-store-2-oferta-1',
              title: 'Ofertas',
              coverImageUrl: 'https://institucional.bistek.com.br/image/1.jpg',
              imageUrls: ['https://institucional.bistek.com.br/image/1.jpg'],
            },
          ],
        },
      ],
    });
    expect(output).toMatchObject({
      runId: 'run-1',
      targetId: 'bistek',
      supermarketId: 'bistek',
      status: 'partially_succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 1,
      artifactsReused: 0,
      datasetSamplesCreated: 0,
      failures: [
        {
          targetId: 'bistek:store:bistek-store-3',
          message: 'Store failed.',
        },
      ],
    });
    expect(output.units.map((unit) => unit.status)).toEqual(['succeeded', 'failed']);
  });

  it('creates storage input from API extraction result', () => {
    expect(
      createBistekImageGalleryStorageInput(
        { outputRootDirectory: '/tmp/output' },
        createApiResult(),
      ),
    ).toEqual({
      rootDirectory: '/tmp/output',
      supermarketId: 'bistek',
      extractedAtIso: '2026-08-14T10:00:00.000Z',
      units: [
        {
          unitId: 'bistek-store-2',
          unitName: 'SC - Blumenau - Loja Nº 4',
          sourceUrl: 'https://institucional.bistek.com.br/ofertas',
          leaflets: [
            {
              leafletId: 'bistek-store-2-oferta-1',
              title: 'Ofertas',
              coverImageUrl: 'https://institucional.bistek.com.br/image/1.jpg',
              imageUrls: ['https://institucional.bistek.com.br/image/1.jpg'],
            },
          ],
        },
      ],
    });
  });

  it('maps fully succeeded and fully failed statuses', async () => {
    await expect(
      createAdapter({
        ...createApiResult(),
        failedStores: [],
      }).execute(createInput()),
    ).resolves.toMatchObject({
      status: 'succeeded',
    });
    await expect(
      createAdapter({
        ...createApiResult(),
        stores: [],
      }).execute(createInput()),
    ).resolves.toMatchObject({
      status: 'failed',
    });
  });

  it('maps empty stored units and missing shared leaflet metadata', async () => {
    const storedExtraction = createStoredExtraction();
    const baseUnit = createStoredUnit();
    const baseLeafletRef = createStoredLeafletRef();
    const output = await new BistekApiStrategyAdapter(
      {
        extractionInput: {
          offersUrl: 'https://institucional.bistek.com.br/ofertas',
          cityIds: [],
          storeIds: [],
        },
        outputRootDirectory: '/tmp/output',
      },
      {
        extractionService: new FakeExtractionService({
          ...createApiResult(),
          failedStores: [],
        }),
        storage: new FakeStorage({
          ...storedExtraction,
          units: [
            {
              ...baseUnit,
              leaflets: [],
            },
            {
              ...baseUnit,
              unitId: 'bistek-store-3',
              leaflets: [
                {
                  ...baseLeafletRef,
                  contentSignature: 'missing-signature',
                },
              ],
            },
          ],
          sharedLeaflets: [],
        }),
      },
    ).execute(createInput());

    expect(output.units[0]?.status).toBe('empty');
    expect(output.units[1]?.leaflets[0]?.artifactCount).toBe(0);
  });
});

function createAdapter(result: BistekApiExtractionResult): BistekApiStrategyAdapter {
  return new BistekApiStrategyAdapter(
    {
      extractionInput: {
        offersUrl: 'https://institucional.bistek.com.br/ofertas',
        cityIds: [],
        storeIds: [],
      },
      outputRootDirectory: '/tmp/output',
    },
    {
      extractionService: new FakeExtractionService(result),
      storage: new FakeStorage(),
    },
  );
}

function createInput(): Parameters<BistekApiStrategyAdapter['execute']>[0] {
  return {
    runId: 'run-1',
    startedAtIso: '2026-08-14T10:00:00.000Z',
    visualDatasetCapturePolicy: 'disabled',
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    target: {
      targetId: 'bistek',
      supermarketId: 'bistek',
      supermarketName: 'Bistek',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
      mode: 'api',
    },
  };
}

class FakeExtractionService {
  readonly inputs: BistekApiExtractionInput[] = [];

  private readonly result: BistekApiExtractionResult;

  constructor(result: BistekApiExtractionResult) {
    this.result = result;
  }

  extract(input: BistekApiExtractionInput): Promise<BistekApiExtractionResult> {
    this.inputs.push(input);

    return Promise.resolve(this.result);
  }
}

class FakeStorage {
  readonly inputs: StoreSharedImageGalleryExtractionInput[] = [];

  private readonly result: StoredSharedImageGalleryExtraction;

  constructor(result = createStoredExtraction()) {
    this.result = result;
  }

  store(
    input: StoreSharedImageGalleryExtractionInput,
  ): Promise<StoredSharedImageGalleryExtraction> {
    this.inputs.push(input);

    return Promise.resolve(this.result);
  }
}

function createStoredExtraction(): StoredSharedImageGalleryExtraction {
  return {
    directoryPath: '/tmp/output/bistek/2026-08-14/10-00',
    metadataPath: '/tmp/output/bistek/2026-08-14/10-00/metadata.json',
    sharedImagesDirectoryPath: '/tmp/output/bistek/shared-images',
    sharedLeafletsDirectoryPath: '/tmp/output/bistek/shared-leaflets',
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedImagesDownloaded: 1,
    sharedImagesReused: 0,
    units: [
      {
        unitId: 'bistek-store-2',
        unitName: 'SC - Blumenau - Loja Nº 4',
        sourceUrl: 'https://institucional.bistek.com.br/ofertas',
        directoryPath: '/tmp/output/unit',
        metadataPath: '/tmp/output/unit/metadata.json',
        leafletsDirectoryPath: '/tmp/output/unit/leaflets',
        leaflets: [
          {
            leafletId: 'bistek-store-2-oferta-1',
            title: 'Ofertas',
            coverImageUrl: 'https://institucional.bistek.com.br/image/1.jpg',
            contentSignature: 'signature-1',
            sharedLeafletDirectoryPath: '/tmp/output/shared-leaflets/signature-1',
            referencePath: '/tmp/output/unit/leaflets/signature-1.json',
          },
        ],
      },
    ],
    sharedLeaflets: [
      {
        contentSignature: 'signature-1',
        representativeLeafletId: 'bistek-store-2-oferta-1',
        title: 'Ofertas',
        directoryPath: '/tmp/output/shared-leaflets/signature-1',
        metadataPath: '/tmp/output/shared-leaflets/signature-1/metadata.json',
        images: [
          {
            order: 1,
            sourceUrl: 'https://institucional.bistek.com.br/image/1.jpg',
            canonicalUrl: 'https://institucional.bistek.com.br/image/1.jpg',
            filePath: '/tmp/output/shared-images/1.jpg',
            contentType: 'image/jpeg',
            byteLength: 3,
            contentHash: 'hash-1',
          },
        ],
      },
    ],
  };
}

function createApiResult(): BistekApiExtractionResult {
  return {
    source: 'bistek-api',
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

function createStoredUnit(): StoredSharedImageGalleryUnit {
  return {
    unitId: 'bistek-store-2',
    unitName: 'SC - Blumenau - Loja Nº 4',
    sourceUrl: 'https://institucional.bistek.com.br/ofertas',
    directoryPath: '/tmp/output/unit',
    metadataPath: '/tmp/output/unit/metadata.json',
    leafletsDirectoryPath: '/tmp/output/unit/leaflets',
    leaflets: [createStoredLeafletRef()],
  };
}

function createStoredLeafletRef(): StoredSharedImageGalleryLeafletReference {
  return {
    leafletId: 'bistek-store-2-oferta-1',
    title: 'Ofertas',
    coverImageUrl: 'https://institucional.bistek.com.br/image/1.jpg',
    contentSignature: 'signature-1',
    sharedLeafletDirectoryPath: '/tmp/output/shared-leaflets/signature-1',
    referencePath: '/tmp/output/unit/leaflets/signature-1.json',
  };
}
