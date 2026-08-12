import { describe, expect, it } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type { PlaywrightExtractionInput } from '../../../application/ports/playwright-extraction-strategy';
import type {
  StoreSharedPdfLeafletExtractionInput,
  StoredSharedPdfLeafletExtraction,
} from '../../storage/leaflet-pdf-storage';
import type {
  AngeloniLeafletExtractionResult,
  ExtractAngeloniLeafletsInput,
} from './angeloni-leaflet-extractor';
import {
  AngeloniPlaywrightStrategyAdapter,
  type AngeloniPlaywrightExtractionPort,
  type AngeloniPlaywrightStoragePort,
} from './angeloni-playwright-strategy-adapter';
import type { AngeloniMonitoredRegion } from './angeloni-targets';

describe('AngeloniPlaywrightStrategyAdapter', () => {
  it('passes visual dataset input and maps stored output', async () => {
    const extractionService = new FakeExtractionService(createExtractionResult());
    const storage = new FakeStorage(createStoredExtraction());
    const adapter = createAdapter(extractionService, storage);

    const output = await adapter.execute(createInput('always'));

    expect(output).toMatchObject({
      status: 'partially_succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 1,
      artifactsReused: 0,
      datasetSamplesCreated: 2,
      failures: [
        {
          targetId: 'angeloni:region:regiao-florianopolis',
          message: 'Region failed.',
        },
      ],
    });
    expect(extractionService.inputs[0]?.visualDataset).toEqual({
      runId: 'run-1',
      split: 'train',
    });
    expect(storage.inputs[0]?.supermarketId).toBe('angeloni');
  });

  it('does not pass visual dataset input when capture is disabled', async () => {
    const extractionService = new FakeExtractionService({
      ...createExtractionResult(),
      failedRegions: [],
    });
    const adapter = createAdapter(
      extractionService,
      new FakeStorage({
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

  it('maps empty and fully failed units', async () => {
    const adapter = createAdapter(
      new FakeExtractionService({
        ...createExtractionResult(),
        regions: [],
      }),
      new FakeStorage({
        ...createStoredExtraction(),
        units: [
          {
            ...createStoredUnit(),
            leaflets: [],
          },
        ],
        sharedLeaflets: [],
      }),
    );

    const output = await adapter.execute(createInput('disabled'));

    expect(output.status).toBe('failed');
    expect(output.units[0]?.status).toBe('empty');
    expect(output.units[0]?.leaflets).toEqual([]);
  });
});

function createAdapter(
  extractionService: AngeloniPlaywrightExtractionPort,
  storage: AngeloniPlaywrightStoragePort,
): AngeloniPlaywrightStrategyAdapter {
  return new AngeloniPlaywrightStrategyAdapter(
    {
      extractionInput: {
        homeUrl: 'https://encartes.angeloni.com.br/',
        regions: [createRegion()],
        viewport: {
          width: 1280,
          height: 720,
          deviceScaleFactor: 1,
        },
        timeoutMs: 30_000,
        regionTimeoutMs: 30_000,
        maxRegionAttempts: 1,
        settleDelayMs: 1_000,
      },
      outputRootDirectory: '.data/leaflets-playwright',
      visualDatasetRootDirectory: '.data/visual-dataset',
      visualDatasetSplit: 'train',
    },
    {
      extractionService,
      storage,
      countVisualDatasetSamples: () => Promise.resolve(2),
    },
  );
}

function createInput(
  visualDatasetCapturePolicy: PlaywrightExtractionInput['visualDatasetCapturePolicy'],
): PlaywrightExtractionInput {
  return {
    runId: 'run-1',
    target: {
      targetId: 'angeloni',
      supermarketId: 'angeloni',
      supermarketName: 'Angeloni',
      mode: 'playwright',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    },
    startedAtIso: '2026-08-12T12:00:00.000Z',
    visualDatasetCapturePolicy,
    logger: new NullLogger(),
  };
}

function createExtractionResult(): AngeloniLeafletExtractionResult {
  return {
    source: 'angeloni-playwright',
    extractedAtIso: '2026-08-12T12:00:00.000Z',
    regions: [
      {
        region: createRegion(),
        sourceUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
        leaflets: [
          {
            leafletId: 'regiao-florianopolis-01-semanal',
            title: 'Semanal',
            cardIndex: 0,
            pdfUrl: 'https://statics.angeloni.com.br/encartes/semanal.pdf',
          },
        ],
      },
    ],
    failedRegions: [
      {
        region: createRegion(),
        sourceUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
        errorMessage: 'Region failed.',
      },
    ],
  };
}

function createStoredExtraction(): StoredSharedPdfLeafletExtraction {
  return {
    directoryPath: '.data/leaflets-playwright/angeloni/2026-08-12/12-00',
    metadataPath: '.data/leaflets-playwright/angeloni/2026-08-12/12-00/metadata.json',
    sharedPdfsDirectoryPath: '.data/leaflets-playwright/angeloni/shared-pdfs',
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedPdfsDownloaded: 1,
    sharedPdfsReused: 0,
    units: [createStoredUnit()],
    sharedLeaflets: [
      {
        contentSignature: 'signature-1',
        representativeLeafletId: 'regiao-florianopolis-01-semanal',
        title: 'Semanal',
        directoryPath: '.data/shared-leaflets/signature-1',
        metadataPath: '.data/shared-leaflets/signature-1/metadata.json',
        pdf: {
          sourceUrl: 'https://statics.angeloni.com.br/encartes/semanal.pdf',
          canonicalUrl: 'https://statics.angeloni.com.br/encartes/semanal.pdf',
          filePath: '.data/shared-pdfs/signature-1.pdf',
          contentType: 'application/pdf',
          byteLength: 100,
          contentHash: 'signature-1',
        },
      },
    ],
  };
}

function createStoredUnit(): StoredSharedPdfLeafletExtraction['units'][number] {
  return {
    unitId: 'regiao-florianopolis',
    unitName: 'Florianópolis',
    sourceUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
    directoryPath: '.data/unit',
    metadataPath: '.data/unit/metadata.json',
    leafletsDirectoryPath: '.data/unit/leaflets',
    leaflets: [
      {
        leafletId: 'regiao-florianopolis-01-semanal',
        title: 'Semanal',
        pdfUrl: 'https://statics.angeloni.com.br/encartes/semanal.pdf',
        contentSignature: 'signature-1',
        sharedLeafletDirectoryPath: '.data/shared-leaflets/signature-1',
        referencePath: '.data/unit/leaflets/signature-1.json',
      },
    ],
  };
}

function createRegion(): AngeloniMonitoredRegion {
  return {
    regionSlug: 'regiao-florianopolis',
    regionName: 'Florianópolis',
    stateCode: 'SC',
    cityName: 'Florianópolis',
    homeUrl: 'https://encartes.angeloni.com.br/',
    regionUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
  };
}

class FakeExtractionService implements AngeloniPlaywrightExtractionPort {
  readonly inputs: ExtractAngeloniLeafletsInput[] = [];

  private readonly result: AngeloniLeafletExtractionResult;

  constructor(result: AngeloniLeafletExtractionResult) {
    this.result = result;
  }

  extract(input: ExtractAngeloniLeafletsInput): Promise<AngeloniLeafletExtractionResult> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}

class FakeStorage implements AngeloniPlaywrightStoragePort {
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
