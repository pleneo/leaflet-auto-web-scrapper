import { describe, expect, it } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type { PlaywrightExtractionInput } from '../../../application/ports/playwright-extraction-strategy';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type {
  StoredSharedImageGalleryExtraction,
  StoreSharedImageGalleryExtractionInput,
} from '../../storage/shared-image-gallery-storage';
import type {
  CoopLeafletExtractionResult,
  ExtractCoopLeafletsInput,
} from './coop-leaflet-extractor';
import {
  CoopPlaywrightStrategyAdapter,
  type CoopPlaywrightExtractionPort,
  type CoopPlaywrightStoragePort,
} from './coop-playwright-strategy-adapter';
import { listCoopMonitoredStores } from './coop-targets';

describe('CoopPlaywrightStrategyAdapter', () => {
  it('maps Playwright extraction output and counts visual dataset samples', async () => {
    const extractionService = new FakePlaywrightExtractionService(createExtractionResult());
    const storage = new FakeImageGalleryStorage(createStoredExtraction());
    const adapter = createAdapter(extractionService, storage, () => Promise.resolve(3));

    const output = await adapter.execute(createInput('always'));

    expect(output).toMatchObject({
      status: 'partially_succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 2,
      artifactsReused: 1,
      datasetSamplesCreated: 3,
      failures: [
        {
          targetId: 'coop:unit:coop-atacarejo-boa-vista',
          message: 'Unit failed.',
        },
      ],
    });
    expect(extractionService.inputs[0]?.visualDataset).toEqual({
      runId: 'run-1',
      split: 'unassigned',
    });
    expect(storage.inputs[0]?.supermarketId).toBe('coop');
  });

  it('maps succeeded and failed statuses with visual dataset disabled', async () => {
    const succeeded = await createAdapter(
      new FakePlaywrightExtractionService({
        ...createExtractionResult(),
        failedUnits: [],
      }),
      new FakeImageGalleryStorage({
        ...createStoredExtraction(),
        sharedLeaflets: [],
      }),
      () => Promise.resolve(99),
    ).execute(createInput('disabled'));
    const failed = await createAdapter(
      new FakePlaywrightExtractionService({
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
      () => Promise.resolve(99),
    ).execute(createInput('disabled'));

    expect(succeeded.status).toBe('succeeded');
    expect(succeeded.datasetSamplesCreated).toBe(0);
    expect(succeeded.units[0]?.leaflets[0]?.artifactCount).toBe(0);
    expect(failed.status).toBe('failed');
    expect(failed.units[0]?.status).toBe('empty');
  });
});

function createAdapter(
  extractionService: CoopPlaywrightExtractionPort,
  storage: CoopPlaywrightStoragePort,
  countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>,
): CoopPlaywrightStrategyAdapter {
  return new CoopPlaywrightStrategyAdapter(
    {
      extractionInput: {
        startUrlMode: 'store-page',
        monitoredStores: listCoopMonitoredStores(),
        viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
        timeoutMs: 30_000,
        settleDelayMs: 1_000,
      },
      outputRootDirectory: '.data/leaflets-playwright',
      visualDatasetRootDirectory: '.data/visual-dataset',
      visualDatasetSplit: 'unassigned',
    },
    {
      extractionService,
      storage,
      countVisualDatasetSamples,
    },
  );
}

function createInput(
  visualDatasetCapturePolicy: PlaywrightExtractionInput['visualDatasetCapturePolicy'],
): PlaywrightExtractionInput {
  return {
    runId: 'run-1',
    target: {
      targetId: 'coop',
      supermarketId: 'coop',
      supermarketName: 'Coop Supermercados',
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

function createExtractionResult(): CoopLeafletExtractionResult {
  return {
    source: 'coop-playwright-direct',
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
    directoryPath: '.data/leaflets-playwright/coop/2026-08-13/10-00',
    metadataPath: '.data/leaflets-playwright/coop/2026-08-13/10-00/metadata.json',
    sharedImagesDirectoryPath: '.data/leaflets-playwright/coop/shared-images',
    sharedLeafletsDirectoryPath: '.data/leaflets-playwright/coop/shared-leaflets',
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

class FakePlaywrightExtractionService implements CoopPlaywrightExtractionPort {
  readonly inputs: ExtractCoopLeafletsInput[] = [];

  private readonly result: CoopLeafletExtractionResult;

  constructor(result: CoopLeafletExtractionResult) {
    this.result = result;
  }

  extract(input: ExtractCoopLeafletsInput): Promise<CoopLeafletExtractionResult> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}

class FakeImageGalleryStorage implements CoopPlaywrightStoragePort {
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
