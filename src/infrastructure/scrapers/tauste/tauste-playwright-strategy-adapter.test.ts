import { describe, expect, it } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type { PlaywrightExtractionInput } from '../../../application/ports/playwright-extraction-strategy';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type {
  StoreSharedPdfLeafletExtractionInput,
  StoredSharedPdfLeafletExtraction,
} from '../../storage/leaflet-pdf-storage';
import type {
  ExtractTausteLeafletsInput,
  TausteLeafletExtractionResult,
} from './tauste-leaflet-extractor';
import {
  TaustePlaywrightStrategyAdapter,
  type TaustePlaywrightExtractionPort,
  type TaustePlaywrightStoragePort,
} from './tauste-playwright-strategy-adapter';

describe('TaustePlaywrightStrategyAdapter', () => {
  it('maps Playwright extraction output and counts visual dataset samples', async () => {
    const extractionService = new FakePlaywrightExtractionService(createExtractionResult());
    const storage = new FakePdfStorage(createStoredExtraction());
    const adapter = createAdapter(extractionService, storage, () => Promise.resolve(2));

    const output = await adapter.execute(createInput('always'));

    expect(output).toMatchObject({
      status: 'partially_succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 1,
      artifactsReused: 0,
      datasetSamplesCreated: 2,
      failures: [
        {
          targetId: 'tauste:publication:tauste:ofertas-tauste-marilia',
          message: 'Download unavailable.',
        },
      ],
    });
    expect(extractionService.inputs[0]?.visualDataset).toEqual({
      runId: 'run-1',
      split: 'unassigned',
    });
    expect(storage.inputs[0]?.supermarketId).toBe('tauste');
  });

  it('maps succeeded and failed statuses with visual dataset disabled', async () => {
    const succeeded = await createAdapter(
      new FakePlaywrightExtractionService({
        ...createExtractionResult(),
        failedPublications: [],
      }),
      new FakePdfStorage({
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
      new FakePdfStorage({
        ...createStoredExtraction(),
        units: [],
        sharedLeaflets: [],
      }),
      () => Promise.resolve(99),
    ).execute(createInput('disabled'));

    expect(succeeded.status).toBe('succeeded');
    expect(succeeded.datasetSamplesCreated).toBe(0);
    expect(succeeded.units[0]?.leaflets[0]?.artifactCount).toBe(0);
    expect(failed.status).toBe('failed');
    expect(failed.units[0]?.unitId).toBe('tauste:ofertas-tauste-marilia');
  });

  it('keeps stored units with no leaflets as empty outputs', async () => {
    const output = await createAdapter(
      new FakePlaywrightExtractionService({
        ...createExtractionResult(),
        failedPublications: [],
      }),
      new FakePdfStorage({
        ...createStoredExtraction(),
        units: [createEmptyStoredUnit()],
      }),
      () => Promise.resolve(0),
    ).execute(createInput('disabled'));

    expect(output.units).toEqual([
      {
        unitId: 'tauste-supermercados',
        unitName: 'Tauste Supermercados',
        status: 'empty',
        sourceUrl: 'https://www.flipsnack.com/taustesupermercado/',
        leaflets: [],
        errorMessage: null,
      },
    ]);
  });
});

function createAdapter(
  extractionService: TaustePlaywrightExtractionPort,
  storage: TaustePlaywrightStoragePort,
  countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>,
): TaustePlaywrightStrategyAdapter {
  return new TaustePlaywrightStrategyAdapter(
    {
      extractionInput: {
        startUrlMode: 'flipsnack-profile',
        profileUrl: 'https://www.flipsnack.com/taustesupermercado/',
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
      targetId: 'tauste',
      supermarketId: 'tauste',
      supermarketName: 'Tauste Supermercados',
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

function createExtractionResult(): TausteLeafletExtractionResult {
  return {
    source: 'tauste-playwright-direct',
    extractedAtIso: '2026-08-13T10:00:00.000Z',
    units: [
      {
        unitId: 'tauste-supermercados',
        unitName: 'Tauste Supermercados',
        sourceUrl: 'https://www.flipsnack.com/taustesupermercado/',
        leaflets: [
          {
            leafletId: 'tauste:ofertas-tauste-bauru',
            title: 'Ofertas Tauste Bauru',
            publicationUrl:
              'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-bauru.html',
            coverImageUrl: 'https://cdn.example.com/cover.jpg',
            publishedAtIso: '2026-08-11T09:00:03.000Z',
            pdfUrl: 'https://cdn.example.com/ofertas-tauste-bauru.pdf',
          },
        ],
      },
    ],
    failedPublications: [
      {
        publicationId: 'tauste:ofertas-tauste-marilia',
        title: 'Ofertas Tauste Marília',
        sourceUrl: 'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-marilia.html',
        errorMessage: 'Download unavailable.',
      },
    ],
  };
}

function createStoredExtraction(): StoredSharedPdfLeafletExtraction {
  return {
    directoryPath: '.data/leaflets-playwright/tauste/2026-08-13/10-00',
    metadataPath: '.data/leaflets-playwright/tauste/2026-08-13/10-00/metadata.json',
    sharedPdfsDirectoryPath: '.data/leaflets-playwright/tauste/shared-pdfs',
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedPdfsDownloaded: 1,
    sharedPdfsReused: 0,
    units: [
      {
        unitId: 'tauste-supermercados',
        unitName: 'Tauste Supermercados',
        sourceUrl: 'https://www.flipsnack.com/taustesupermercado/',
        directoryPath: '.data/unit',
        metadataPath: '.data/unit/metadata.json',
        leafletsDirectoryPath: '.data/unit/leaflets',
        leaflets: [
          {
            leafletId: 'tauste:ofertas-tauste-bauru',
            title: 'Ofertas Tauste Bauru',
            pdfUrl: 'https://cdn.example.com/ofertas-tauste-bauru.pdf',
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
        representativeLeafletId: 'tauste:ofertas-tauste-bauru',
        title: 'Ofertas Tauste Bauru',
        directoryPath: '.data/shared-leaflets/signature-1',
        metadataPath: '.data/shared-leaflets/signature-1/metadata.json',
        pdf: {
          sourceUrl: 'https://cdn.example.com/ofertas-tauste-bauru.pdf',
          canonicalUrl: 'https://cdn.example.com/ofertas-tauste-bauru.pdf',
          filePath: '.data/shared-pdfs/1.pdf',
          contentType: 'application/pdf',
          byteLength: 100,
          contentHash: 'hash-1',
        },
      },
    ],
  };
}

function createEmptyStoredUnit(): StoredSharedPdfLeafletExtraction['units'][number] {
  return {
    unitId: 'tauste-supermercados',
    unitName: 'Tauste Supermercados',
    sourceUrl: 'https://www.flipsnack.com/taustesupermercado/',
    directoryPath: '.data/unit',
    metadataPath: '.data/unit/metadata.json',
    leafletsDirectoryPath: '.data/unit/leaflets',
    leaflets: [],
  };
}

class FakePlaywrightExtractionService implements TaustePlaywrightExtractionPort {
  readonly inputs: ExtractTausteLeafletsInput[] = [];

  private readonly result: TausteLeafletExtractionResult;

  constructor(result: TausteLeafletExtractionResult) {
    this.result = result;
  }

  extract(input: ExtractTausteLeafletsInput): Promise<TausteLeafletExtractionResult> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}

class FakePdfStorage implements TaustePlaywrightStoragePort {
  readonly inputs: StoreSharedPdfLeafletExtractionInput[] = [];

  private readonly stored: StoredSharedPdfLeafletExtraction;

  constructor(stored: StoredSharedPdfLeafletExtraction) {
    this.stored = stored;
  }

  store(input: StoreSharedPdfLeafletExtractionInput): Promise<StoredSharedPdfLeafletExtraction> {
    this.inputs.push(input);
    return Promise.resolve(this.stored);
  }
}

class NullLogger implements Logger {
  private callCount = 0;

  debug(): void {
    this.callCount += 1;
  }

  info(): void {
    this.callCount += 1;
  }

  warn(): void {
    this.callCount += 1;
  }

  error(): void {
    this.callCount += 1;
  }
}
