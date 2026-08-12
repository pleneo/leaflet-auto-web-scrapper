import { describe, expect, it } from 'vitest';
import type { ExtractionStrategyInput } from '../../../application/ports/extraction-strategy';
import type { Logger } from '../../../application/ports/logger';
import type {
  StoreSharedPdfLeafletExtractionInput,
  StoredSharedPdfLeafletExtraction,
} from '../../storage/leaflet-pdf-storage';
import type {
  AngeloniApiExtractionInput,
  AngeloniApiExtractionResult,
} from './angeloni-api-extraction';
import {
  AngeloniApiStrategyAdapter,
  type AngeloniApiExtractionPort,
  type AngeloniApiStoragePort,
} from './angeloni-api-strategy-adapter';
import type { AngeloniMonitoredRegion } from './angeloni-targets';

describe('AngeloniApiStrategyAdapter', () => {
  it('maps API extraction and shared PDF storage into generic worker output', async () => {
    const extractionService = new FakeExtractionService(createExtractionResult());
    const storage = new FakeStorage(createStoredExtraction());
    const adapter = createAdapter(extractionService, storage);

    const output = await adapter.execute(createInput());

    expect(output).toMatchObject({
      runId: 'run-1',
      targetId: 'angeloni',
      supermarketId: 'angeloni',
      status: 'partially_succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 1,
      artifactsReused: 2,
      datasetSamplesCreated: 0,
      failures: [
        {
          targetId: 'angeloni:region:regiao-florianopolis',
          message: 'Region failed.',
        },
      ],
    });
    expect(output.units).toEqual([
      {
        unitId: 'regiao-florianopolis',
        unitName: 'Florianópolis',
        status: 'succeeded',
        sourceUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
        leaflets: [
          {
            leafletKey: 'signature-1',
            title: 'Semanal Angeloni',
            contentSignature: 'signature-1',
            artifactCount: 1,
            sourceUrl: 'https://statics.angeloni.com.br/encartes/semanal.pdf',
          },
        ],
        errorMessage: null,
      },
      {
        unitId: 'regiao-florianopolis',
        unitName: 'Florianópolis',
        status: 'failed',
        sourceUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
        leaflets: [],
        errorMessage: 'Region failed.',
      },
    ]);
    expect(extractionService.inputs).toEqual([
      {
        regions: [createRegion()],
      },
    ]);
    expect(storage.inputs[0]?.units[0]?.leaflets[0]?.pdfUrl).toBe(
      'https://statics.angeloni.com.br/encartes/semanal.pdf',
    );
  });

  it('maps succeeded empty regions and zero artifact counts', async () => {
    const adapter = createAdapter(
      new FakeExtractionService({
        ...createExtractionResult(),
        failedRegions: [],
      }),
      new FakeStorage({
        ...createStoredExtraction(),
        units: [
          {
            ...createStoredUnit(),
            leaflets: [],
          },
          {
            ...createStoredUnit(),
            leaflets: [createStoredReference()],
          },
        ],
        sharedLeaflets: [],
      }),
    );

    const output = await adapter.execute(createInput());

    expect(output.status).toBe('succeeded');
    expect(output.failures).toEqual([]);
    expect(output.units[0]?.status).toBe('empty');
    expect(output.units[1]?.leaflets[0]?.artifactCount).toBe(0);
  });

  it('maps fully failed extraction status', async () => {
    const adapter = createAdapter(
      new FakeExtractionService({
        ...createExtractionResult(),
        regions: [],
      }),
      new FakeStorage({
        ...createStoredExtraction(),
        units: [],
        sharedLeaflets: [],
      }),
    );

    const output = await adapter.execute(createInput());

    expect(output.status).toBe('failed');
    expect(output.units[0]?.status).toBe('failed');
  });
});

function createAdapter(
  extractionService: AngeloniApiExtractionPort,
  storage: AngeloniApiStoragePort,
): AngeloniApiStrategyAdapter {
  return new AngeloniApiStrategyAdapter(
    {
      extractionInput: {
        regions: [createRegion()],
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
      targetId: 'angeloni',
      supermarketId: 'angeloni',
      supermarketName: 'Angeloni',
      mode: 'api',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    },
    startedAtIso: '2026-08-12T12:00:00.000Z',
    visualDatasetCapturePolicy: 'disabled',
    logger: new NullLogger(),
  };
}

function createExtractionResult(): AngeloniApiExtractionResult {
  return {
    source: 'angeloni-api',
    extractedAtIso: '2026-08-12T12:00:00.000Z',
    regions: [
      {
        region: createRegion(),
        sourceUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
        leaflets: [
          {
            leafletId: 'angeloni-semanal',
            title: 'Semanal Angeloni',
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
    directoryPath: '.data/leaflets-api/angeloni/2026-08-12/12-00',
    metadataPath: '.data/leaflets-api/angeloni/2026-08-12/12-00/metadata.json',
    sharedPdfsDirectoryPath: '.data/leaflets-api/angeloni/shared-pdfs',
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedPdfsDownloaded: 1,
    sharedPdfsReused: 2,
    units: [createStoredUnit()],
    sharedLeaflets: [
      {
        contentSignature: 'signature-1',
        representativeLeafletId: 'angeloni-semanal',
        title: 'Semanal Angeloni',
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
    leaflets: [createStoredReference()],
  };
}

function createStoredReference(): StoredSharedPdfLeafletExtraction['units'][number]['leaflets'][number] {
  return {
    leafletId: 'angeloni-semanal',
    title: 'Semanal Angeloni',
    pdfUrl: 'https://statics.angeloni.com.br/encartes/semanal.pdf',
    contentSignature: 'signature-1',
    sharedLeafletDirectoryPath: '.data/shared-leaflets/signature-1',
    referencePath: '.data/unit/leaflets/signature-1.json',
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

class FakeExtractionService implements AngeloniApiExtractionPort {
  readonly inputs: AngeloniApiExtractionInput[] = [];

  private readonly result: AngeloniApiExtractionResult;

  constructor(result: AngeloniApiExtractionResult) {
    this.result = result;
  }

  extract(input: AngeloniApiExtractionInput): Promise<AngeloniApiExtractionResult> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}

class FakeStorage implements AngeloniApiStoragePort {
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
