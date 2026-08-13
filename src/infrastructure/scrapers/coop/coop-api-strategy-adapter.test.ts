import { describe, expect, it } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type { ExtractionStrategyInput } from '../../../application/ports/extraction-strategy';
import type {
  StoredSharedImageGalleryExtraction,
  StoreSharedImageGalleryExtractionInput,
} from '../../storage/shared-image-gallery-storage';
import type { CoopApiExtractionInput, CoopApiExtractionResult } from './coop-api-extraction';
import {
  CoopApiStrategyAdapter,
  type CoopApiExtractionPort,
  type CoopImageGalleryStoragePort,
} from './coop-api-strategy-adapter';

describe('CoopApiStrategyAdapter', () => {
  it('maps API extraction output to worker output and shared image storage', async () => {
    const extractionService = new FakeApiExtractionService(createExtractionResult());
    const storage = new FakeImageGalleryStorage(createStoredExtraction());
    const adapter = createAdapter(extractionService, storage);

    const output = await adapter.execute(createInput('api'));

    expect(output).toMatchObject({
      runId: 'run-1',
      targetId: 'coop',
      supermarketId: 'coop',
      status: 'partially_succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 2,
      artifactsReused: 1,
      datasetSamplesCreated: 0,
      failures: [
        {
          targetId: 'coop:unit:coop-atacarejo-boa-vista',
          message: 'Unit failed.',
        },
      ],
    });
    expect(output.units[0]?.leaflets[0]).toEqual({
      leafletKey: 'signature-1',
      title: 'Agua Verde semanal',
      contentSignature: 'signature-1',
      artifactCount: 2,
      sourceUrl: 'https://www.cooper.coop.br/revista/imagens/5010/1.jpg',
    });
    expect(storage.inputs[0]).toMatchObject({
      rootDirectory: '.data/leaflets-api',
      supermarketId: 'coop',
      units: [
        {
          unitId: 'coop-super-agua-verde',
          leaflets: [
            {
              leafletId: 'coop-agua',
              imageUrls: [
                'https://www.cooper.coop.br/revista/imagens/5010/1.jpg',
                'https://www.cooper.coop.br/revista/imagens/5010/2.jpg',
              ],
            },
          ],
        },
      ],
    });
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
  extractionService: CoopApiExtractionPort,
  storage: CoopImageGalleryStoragePort,
): CoopApiStrategyAdapter {
  return new CoopApiStrategyAdapter(
    {
      extractionInput: {
        offersUrl: 'https://www.cooper.coop.br/ofertas',
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
      targetId: 'coop',
      supermarketId: 'coop',
      supermarketName: 'Coop Supermercados',
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

function createExtractionResult(): CoopApiExtractionResult {
  return {
    source: 'coop-api',
    extractedAtIso: '2026-08-13T10:00:00.000Z',
    units: [
      {
        unitId: 'coop-super-agua-verde',
        unitName: 'Cooper Super Agua Verde',
        sourceUrl: 'https://www.cooper.coop.br/ofertas/blumenau/agua-verde',
        leaflets: [
          {
            leafletId: 'coop-agua',
            title: 'Agua Verde semanal',
            sourcePageUrl: 'https://www.cooper.coop.br/revista/?id=agua',
            coverImageUrl: 'https://www.cooper.coop.br/revista/imagens/5010/1.jpg',
            imageUrls: [
              'https://www.cooper.coop.br/revista/imagens/5010/1.jpg',
              'https://www.cooper.coop.br/revista/imagens/5010/2.jpg',
            ],
            validUntilIso: null,
          },
        ],
      },
    ],
    failedUnits: [
      {
        unitId: 'coop-atacarejo-boa-vista',
        unitName: 'Cooper Atacarejo Boa Vista',
        sourceUrl: 'https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
        errorMessage: 'Unit failed.',
      },
    ],
  };
}

function createStoredExtraction(): StoredSharedImageGalleryExtraction {
  return {
    directoryPath: '.data/leaflets-api/coop/2026-08-13/10-00',
    metadataPath: '.data/leaflets-api/coop/2026-08-13/10-00/metadata.json',
    sharedImagesDirectoryPath: '.data/leaflets-api/coop/shared-images',
    sharedLeafletsDirectoryPath: '.data/leaflets-api/coop/shared-leaflets',
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedImagesDownloaded: 2,
    sharedImagesReused: 1,
    units: [createStoredUnit()],
    sharedLeaflets: [
      {
        contentSignature: 'signature-1',
        representativeLeafletId: 'coop-agua',
        title: 'Agua Verde semanal',
        directoryPath: '.data/shared-leaflets/signature-1',
        metadataPath: '.data/shared-leaflets/signature-1/metadata.json',
        images: [
          {
            order: 1,
            sourceUrl: 'https://www.cooper.coop.br/revista/imagens/5010/1.jpg',
            canonicalUrl: 'https://www.cooper.coop.br/revista/imagens/5010/1.jpg',
            filePath: '.data/shared-images/1.jpg',
            contentType: 'image/jpeg',
            byteLength: 100,
            contentHash: 'hash-1',
          },
          {
            order: 2,
            sourceUrl: 'https://www.cooper.coop.br/revista/imagens/5010/2.jpg',
            canonicalUrl: 'https://www.cooper.coop.br/revista/imagens/5010/2.jpg',
            filePath: '.data/shared-images/2.jpg',
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
    unitId: 'coop-super-agua-verde',
    unitName: 'Cooper Super Agua Verde',
    sourceUrl: 'https://www.cooper.coop.br/ofertas/blumenau/agua-verde',
    directoryPath: '.data/unit',
    metadataPath: '.data/unit/metadata.json',
    leafletsDirectoryPath: '.data/unit/leaflets',
    leaflets: [
      {
        leafletId: 'coop-agua',
        title: 'Agua Verde semanal',
        coverImageUrl: 'https://www.cooper.coop.br/revista/imagens/5010/1.jpg',
        contentSignature: 'signature-1',
        sharedLeafletDirectoryPath: '.data/shared-leaflets/signature-1',
        referencePath: '.data/unit/leaflets/signature-1.json',
      },
    ],
  };
}

class FakeApiExtractionService implements CoopApiExtractionPort {
  readonly inputs: CoopApiExtractionInput[] = [];

  private readonly result: CoopApiExtractionResult;

  constructor(result: CoopApiExtractionResult) {
    this.result = result;
  }

  extract(input: CoopApiExtractionInput): Promise<CoopApiExtractionResult> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}

class FakeImageGalleryStorage implements CoopImageGalleryStoragePort {
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
