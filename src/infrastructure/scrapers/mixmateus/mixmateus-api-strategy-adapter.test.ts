import { describe, expect, it } from 'vitest';
import type { ExtractionStrategyInput } from '../../../application/ports/extraction-strategy';
import type { Logger } from '../../../application/ports/logger';
import type {
  StoreSharedPdfLeafletExtractionInput,
  StoredSharedPdfLeafletExtraction,
} from '../../storage/leaflet-pdf-storage';
import type {
  MixMateusApiExtractionInput,
  MixMateusApiExtractionResult,
} from './mixmateus-api-extraction';
import {
  MixMateusApiStrategyAdapter,
  type MixMateusApiExtractionPort,
  type MixMateusApiStoragePort,
} from './mixmateus-api-strategy-adapter';
import type { MixMateusMonitoredStore } from './mixmateus-targets';

describe('MixMateusApiStrategyAdapter', () => {
  it('maps API extraction and shared PDF storage into generic worker output', async () => {
    const extractionService = new FakeExtractionService(createExtractionResult());
    const storage = new FakeStorage(createStoredExtraction());
    const adapter = createAdapter(extractionService, storage);

    const output = await adapter.execute(createInput());

    expect(output.status).toBe('partially_succeeded');
    expect(output.leafletsFound).toBe(1);
    expect(output.artifactsDownloaded).toBe(1);
    expect(output.artifactsReused).toBe(2);
    expect(output.datasetSamplesCreated).toBe(0);
    expect(output.failures).toEqual([
      {
        targetId: 'mixmateus:store:mix-messejana',
        message: 'Store failed.',
      },
    ]);
    expect(output.units).toEqual([
      {
        unitId: 'mix-henrique-jorge',
        unitName: 'Mix Mateus Henrique Jorge',
        status: 'succeeded',
        sourceUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-henrique-jorge',
        leaflets: [
          {
            leafletKey: 'signature-1',
            title: 'Exclusivo Itambé',
            contentSignature: 'signature-1',
            artifactCount: 1,
            sourceUrl: 'https://ofertasmateus.com/api-proxy.php?file=file.pdf',
          },
        ],
        errorMessage: null,
      },
      {
        unitId: 'mix-messejana',
        unitName: 'Mix Mateus Messejana',
        status: 'failed',
        sourceUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-messejana',
        leaflets: [],
        errorMessage: 'Store failed.',
      },
    ]);
    expect(extractionService.inputs).toEqual([
      {
        stores: [createStore()],
      },
    ]);
    expect(storage.inputs[0]?.units[0]?.leaflets[0]?.pdfUrl).toBe(
      'https://ofertasmateus.com/api-proxy.php?file=file.pdf',
    );
  });

  it('maps succeeded empty units and zero artifact counts', async () => {
    const adapter = createAdapter(
      new FakeExtractionService({
        ...createExtractionResult(),
        failedStores: [],
      }),
      new FakeStorage({
        ...createStoredExtraction(),
        units: [
          {
            unitId: 'mix-henrique-jorge',
            unitName: 'Mix Mateus Henrique Jorge',
            sourceUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-henrique-jorge',
            directoryPath: '.data/unit',
            metadataPath: '.data/unit/metadata.json',
            leafletsDirectoryPath: '.data/unit/leaflets',
            leaflets: [
              {
                leafletId: 'mixmateus-13961',
                title: 'Exclusivo Itambé',
                pdfUrl: 'https://ofertasmateus.com/api-proxy.php?file=file.pdf',
                contentSignature: 'signature-1',
                sharedLeafletDirectoryPath: '.data/shared-leaflets/signature-1',
                referencePath: '.data/unit/leaflets/signature-1.json',
              },
            ],
          },
          {
            unitId: 'mix-empty',
            unitName: 'Mix Empty',
            sourceUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-empty',
            directoryPath: '.data/unit-empty',
            metadataPath: '.data/unit-empty/metadata.json',
            leafletsDirectoryPath: '.data/unit-empty/leaflets',
            leaflets: [],
          },
        ],
        sharedLeaflets: [],
      }),
    );

    const output = await adapter.execute(createInput());

    expect(output.status).toBe('succeeded');
    expect(output.failures).toEqual([]);
    expect(output.units[0]?.leaflets[0]?.artifactCount).toBe(0);
    expect(output.units[1]?.status).toBe('empty');
  });

  it('maps fully failed extraction status', async () => {
    const adapter = createAdapter(
      new FakeExtractionService({
        ...createExtractionResult(),
        stores: [],
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
  extractionService: MixMateusApiExtractionPort,
  storage: MixMateusApiStoragePort,
): MixMateusApiStrategyAdapter {
  return new MixMateusApiStrategyAdapter(
    {
      extractionInput: {
        stores: [createStore()],
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
      targetId: 'mixmateus',
      supermarketId: 'mixmateus',
      supermarketName: 'Mix Mateus',
      mode: 'api',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    },
    startedAtIso: '2026-08-06T10:00:00.000Z',
    visualDatasetCapturePolicy: 'disabled',
    logger: new NullLogger(),
  };
}

function createExtractionResult(): MixMateusApiExtractionResult {
  return {
    source: 'mixmateus-api',
    extractedAtIso: '2026-08-06T10:00:00.000Z',
    stores: [
      {
        store: createStore(),
        sourceUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-henrique-jorge',
        leaflets: [
          {
            leafletId: 'mixmateus-13961',
            title: 'Exclusivo Itambé',
            cardIndex: 0,
            pdfUrl: 'https://ofertasmateus.com/api-proxy.php?file=file.pdf',
          },
        ],
      },
    ],
    failedStores: [
      {
        store: createStore({
          storeSlug: 'mix-messejana',
          storeName: 'Mix Mateus Messejana',
          finalPageUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-messejana',
        }),
        sourceUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-messejana',
        errorMessage: 'Store failed.',
      },
    ],
  };
}

function createStoredExtraction(): StoredSharedPdfLeafletExtraction {
  return {
    directoryPath: '.data/leaflets-api/mixmateus/2026-08-06/10-00',
    metadataPath: '.data/leaflets-api/mixmateus/2026-08-06/10-00/metadata.json',
    sharedPdfsDirectoryPath: '.data/leaflets-api/mixmateus/shared-pdfs',
    sharedLeafletsCreated: 1,
    sharedLeafletsReused: 0,
    sharedPdfsDownloaded: 1,
    sharedPdfsReused: 2,
    units: [
      {
        unitId: 'mix-henrique-jorge',
        unitName: 'Mix Mateus Henrique Jorge',
        sourceUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-henrique-jorge',
        directoryPath: '.data/unit',
        metadataPath: '.data/unit/metadata.json',
        leafletsDirectoryPath: '.data/unit/leaflets',
        leaflets: [
          {
            leafletId: 'mixmateus-13961',
            title: 'Exclusivo Itambé',
            pdfUrl: 'https://ofertasmateus.com/api-proxy.php?file=file.pdf',
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
        representativeLeafletId: 'mixmateus-13961',
        title: 'Exclusivo Itambé',
        directoryPath: '.data/shared-leaflets/signature-1',
        metadataPath: '.data/shared-leaflets/signature-1/metadata.json',
        pdf: {
          sourceUrl: 'https://ofertasmateus.com/api-proxy.php?file=file.pdf',
          canonicalUrl: 'https://ofertasmateus.com/api-proxy.php?file=file.pdf',
          filePath: '.data/shared-pdfs/signature-1.pdf',
          contentType: 'application/pdf',
          byteLength: 10,
          contentHash: 'hash-1',
        },
      },
    ],
  };
}

class FakeExtractionService implements MixMateusApiExtractionPort {
  readonly inputs: MixMateusApiExtractionInput[] = [];

  private readonly result: MixMateusApiExtractionResult;

  constructor(result: MixMateusApiExtractionResult) {
    this.result = result;
  }

  extract(input: MixMateusApiExtractionInput): Promise<MixMateusApiExtractionResult> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}

class FakeStorage implements MixMateusApiStoragePort {
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
  debug(message: string, context?: Record<string, string | number | boolean | null>): void {
    void message;
    void context;
  }

  info(message: string, context?: Record<string, string | number | boolean | null>): void {
    void message;
    void context;
  }

  warn(message: string, context?: Record<string, string | number | boolean | null>): void {
    void message;
    void context;
  }

  error(message: string, context?: Record<string, string | number | boolean | null>): void {
    void message;
    void context;
  }
}

function createStore(input: Partial<MixMateusMonitoredStore> = {}): MixMateusMonitoredStore {
  return {
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Fortaleza',
    storeSlug: 'mix-henrique-jorge',
    storeName: 'Mix Mateus Henrique Jorge',
    finalPageUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-henrique-jorge',
    ...input,
  };
}
