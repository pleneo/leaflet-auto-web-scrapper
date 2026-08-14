import { describe, expect, it } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type { ExtractionStrategyInput } from '../../../application/ports/extraction-strategy';
import type {
  StoreSharedPdfLeafletExtractionInput,
  StoredSharedPdfLeafletExtraction,
} from '../../storage/leaflet-pdf-storage';
import type { TausteApiExtractionResult } from './tauste-api-extraction';
import {
  TausteApiStrategyAdapter,
  type TausteApiExtractionPort,
  type TausteApiStoragePort,
} from './tauste-api-strategy-adapter';

describe('TausteApiStrategyAdapter', () => {
  it('maps API extraction output to worker output', async () => {
    const extractionService = new FakeApiExtractionService(createExtractionResult());
    const storage = new FakePdfStorage(createStoredExtraction());
    const adapter = new TausteApiStrategyAdapter(
      {
        extractionInput: {},
        outputRootDirectory: '.data/leaflets-api',
      },
      {
        extractionService,
        storage,
      },
    );

    const output = await adapter.execute(createInput());

    expect(output).toMatchObject({
      status: 'partially_succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 1,
      datasetSamplesCreated: 0,
      failures: [
        {
          targetId: 'tauste:publication:tauste:ofertas-tauste-marilia',
          message: 'No PDF.',
        },
      ],
    });
    expect(storage.inputs[0]?.rootDirectory).toBe('.data/leaflets-api');
  });

  it('maps succeeded and failed statuses', async () => {
    const succeeded = await createAdapter({
      ...createExtractionResult(),
      failedPublications: [],
    }).execute(createInput());
    const failed = await createAdapter({
      ...createExtractionResult(),
      units: [],
    }).execute(createInput());

    expect(succeeded.status).toBe('succeeded');
    expect(succeeded.units[0]?.leaflets[0]?.artifactCount).toBe(1);
    expect(failed.status).toBe('failed');
    expect(failed.units[0]?.unitId).toBe('tauste:ofertas-tauste-marilia');
  });

  it('keeps stored units with no leaflets as empty outputs', async () => {
    const output = await createAdapterWithStorage(
      {
        ...createExtractionResult(),
        failedPublications: [],
      },
      {
        ...createStoredExtraction(),
        units: [createEmptyStoredUnit()],
      },
    ).execute(createInput());

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

  it('maps a stored PDF reference without a shared leaflet record as zero artifacts', async () => {
    const output = await createAdapterWithStorage(createExtractionResult(), {
      ...createStoredExtraction(),
      sharedLeaflets: [],
    }).execute(createInput());

    expect(output.units[0]?.leaflets[0]?.artifactCount).toBe(0);
  });
});

function createAdapter(result: TausteApiExtractionResult): TausteApiStrategyAdapter {
  return createAdapterWithStorage(result, {
    ...createStoredExtraction(),
    units: result.units.length === 0 ? [] : createStoredExtraction().units,
  });
}

function createAdapterWithStorage(
  result: TausteApiExtractionResult,
  stored: StoredSharedPdfLeafletExtraction,
): TausteApiStrategyAdapter {
  return new TausteApiStrategyAdapter(
    {
      extractionInput: {},
      outputRootDirectory: '.data/leaflets-api',
    },
    {
      extractionService: new FakeApiExtractionService(result),
      storage: new FakePdfStorage(stored),
    },
  );
}

function createInput(): ExtractionStrategyInput {
  return {
    runId: 'run-1',
    target: {
      targetId: 'tauste',
      supermarketId: 'tauste',
      supermarketName: 'Tauste Supermercados',
      mode: 'api',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    },
    startedAtIso: '2026-08-13T10:00:00.000Z',
    visualDatasetCapturePolicy: 'disabled',
    logger: new NullLogger(),
  };
}

function createExtractionResult(): TausteApiExtractionResult {
  return {
    source: 'tauste-api',
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
            coverImageUrl: null,
            publishedAtIso: null,
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
        errorMessage: 'No PDF.',
      },
    ],
  };
}

function createStoredExtraction(): StoredSharedPdfLeafletExtraction {
  return {
    directoryPath: '.data/leaflets-api/tauste/2026-08-13/10-00',
    metadataPath: '.data/leaflets-api/tauste/2026-08-13/10-00/metadata.json',
    sharedPdfsDirectoryPath: '.data/leaflets-api/tauste/shared-pdfs',
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

class FakeApiExtractionService implements TausteApiExtractionPort {
  private readonly result: TausteApiExtractionResult;

  constructor(result: TausteApiExtractionResult) {
    this.result = result;
  }

  extract(): Promise<TausteApiExtractionResult> {
    return Promise.resolve(this.result);
  }
}

class FakePdfStorage implements TausteApiStoragePort {
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
