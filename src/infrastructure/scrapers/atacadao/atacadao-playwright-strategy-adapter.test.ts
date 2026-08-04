import { describe, expect, it } from 'vitest';
import type { PlaywrightExtractionInput } from '../../../application/ports/playwright-extraction-strategy';
import { createExtractionTarget } from '../../../domain/extraction/extraction-target';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type {
  StoreSharedPdfLeafletExtractionInput,
  StoredSharedPdfLeafletExtraction,
} from '../../storage/leaflet-pdf-storage';
import type {
  AtacadaoLeafletExtractionResult,
  ExtractAtacadaoLeafletsInput,
} from './atacadao-leaflet-extractor';
import { AtacadaoPlaywrightStrategyAdapter } from './atacadao-playwright-strategy-adapter';
import type { AtacadaoMonitoredStore } from './atacadao-targets';

describe('AtacadaoPlaywrightStrategyAdapter', () => {
  it('maps extracted PDF leaflets to generic worker output', async () => {
    const extraction = new FakeExtractionService({
      source: 'atacadao-playwright',
      extractedAtIso: '2026-08-04T10:00:00.000Z',
      stores: [
        {
          store: STORE,
          sourceUrl: STORE.finalPageUrl,
          leaflets: [
            {
              leafletId: 'ipiranga-01-boa-do-dia',
              title: 'Boa do Dia',
              cardIndex: 0,
              pdfUrl: 'https://cdn.example.com/boa.pdf',
              validityText: 'De 4/8 até 4/8',
            },
          ],
        },
      ],
      failedStores: [],
    });
    const storage = new FakeStorage();
    const adapter = createAdapter(extraction, storage);

    const output = await adapter.execute(createInput('always'));

    expect(extraction.lastInput?.visualDataset).toEqual({
      runId: 'run-1',
      split: 'unassigned',
    });
    expect(storage.lastInput?.units[0]?.leaflets[0]).toEqual({
      leafletId: 'ipiranga-01-boa-do-dia',
      title: 'Boa do Dia',
      pdfUrl: 'https://cdn.example.com/boa.pdf',
    });
    expect(output).toMatchObject({
      runId: 'run-1',
      targetId: 'atacadao',
      supermarketId: 'atacadao',
      status: 'succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 1,
      artifactsReused: 0,
      datasetSamplesCreated: 3,
      failures: [],
    });
    expect(output.units[0]?.leaflets[0]).toEqual({
      leafletKey: 'hash-1',
      title: 'Boa do Dia',
      contentSignature: 'hash-1',
      artifactCount: 1,
      sourceUrl: 'https://cdn.example.com/boa.pdf',
    });
  });

  it('does not pass visual dataset input when capture is disabled', async () => {
    const extraction = new FakeExtractionService({
      source: 'atacadao-playwright',
      extractedAtIso: '2026-08-04T10:00:00.000Z',
      stores: [],
      failedStores: [],
    });
    const adapter = createAdapter(extraction, new FakeStorage());

    const output = await adapter.execute(createInput('disabled'));

    expect(extraction.lastInput?.visualDataset).toBeUndefined();
    expect(output.datasetSamplesCreated).toBe(0);
  });

  it('reports partial success when some stores fail', async () => {
    const extraction = new FakeExtractionService({
      source: 'atacadao-playwright',
      extractedAtIso: '2026-08-04T10:00:00.000Z',
      stores: [
        {
          store: STORE,
          sourceUrl: STORE.finalPageUrl,
          leaflets: [],
        },
      ],
      failedStores: [
        {
          store: SECOND_STORE,
          sourceUrl: SECOND_STORE.finalPageUrl,
          errorMessage: 'Store failed.',
        },
      ],
    });
    const adapter = createAdapter(extraction, new FakeStorage());

    const output = await adapter.execute(createInput('disabled'));

    expect(output.status).toBe('partially_succeeded');
    expect(output.units).toEqual([
      {
        unitId: 'ipiranga',
        unitName: 'Ipiranga',
        status: 'empty',
        sourceUrl: STORE.finalPageUrl,
        leaflets: [],
        errorMessage: null,
      },
      {
        unitId: 'penha',
        unitName: 'Penha',
        status: 'failed',
        sourceUrl: SECOND_STORE.finalPageUrl,
        leaflets: [],
        errorMessage: 'Store failed.',
      },
    ]);
    expect(output.failures).toEqual([
      {
        targetId: 'atacadao:store:penha',
        message: 'Store failed.',
      },
    ]);
  });

  it('reports failed when every store fails', async () => {
    const extraction = new FakeExtractionService({
      source: 'atacadao-playwright',
      extractedAtIso: '2026-08-04T10:00:00.000Z',
      stores: [],
      failedStores: [
        {
          store: STORE,
          sourceUrl: STORE.finalPageUrl,
          errorMessage: 'Store failed.',
        },
      ],
    });
    const adapter = createAdapter(extraction, new FakeStorage());

    const output = await adapter.execute(createInput('disabled'));

    expect(output.status).toBe('failed');
  });
});

const STORE: AtacadaoMonitoredStore = {
  stateCode: 'SP',
  cityName: 'Sao Paulo',
  storeSlug: 'ipiranga',
  storeName: 'Ipiranga',
  finalPageUrl: 'https://www.atacadao.com.br/loja/ipiranga',
};

const SECOND_STORE: AtacadaoMonitoredStore = {
  stateCode: 'SP',
  cityName: 'Sao Paulo',
  storeSlug: 'penha',
  storeName: 'Penha',
  finalPageUrl: 'https://www.atacadao.com.br/loja/penha',
};

function createAdapter(
  extractionService: FakeExtractionService,
  storage: FakeStorage,
): AtacadaoPlaywrightStrategyAdapter {
  return new AtacadaoPlaywrightStrategyAdapter(
    {
      extractionInput: {
        stores: [STORE],
        viewport: createVisualViewport({
          width: 1366,
          height: 768,
          deviceScaleFactor: 1,
        }),
        timeoutMs: 30_000,
        storeTimeoutMs: 60_000,
        maxStoreAttempts: 2,
        settleDelayMs: 1_000,
      },
      outputRootDirectory: '.data/leaflets-playwright',
      visualDatasetRootDirectory: '.data/visual-dataset',
      visualDatasetSplit: 'unassigned',
    },
    {
      extractionService,
      storage,
      countVisualDatasetSamples: () => Promise.resolve(3),
    },
  );
}

function createInput(visualDatasetCapturePolicy: 'always' | 'disabled'): PlaywrightExtractionInput {
  return {
    runId: 'run-1',
    startedAtIso: '2026-08-04T10:00:00.000Z',
    target: createExtractionTarget({
      targetId: 'atacadao',
      supermarketId: 'atacadao',
      supermarketName: 'Atacadão',
      mode: 'playwright',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    }),
    visualDatasetCapturePolicy,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  };
}

class FakeExtractionService {
  private readonly result: AtacadaoLeafletExtractionResult;

  lastInput: ExtractAtacadaoLeafletsInput | undefined;

  constructor(result: AtacadaoLeafletExtractionResult) {
    this.result = result;
  }

  extract(input: ExtractAtacadaoLeafletsInput): Promise<AtacadaoLeafletExtractionResult> {
    this.lastInput = input;
    return Promise.resolve(this.result);
  }
}

class FakeStorage {
  lastInput: StoreSharedPdfLeafletExtractionInput | undefined;

  store(input: StoreSharedPdfLeafletExtractionInput): Promise<StoredSharedPdfLeafletExtraction> {
    this.lastInput = input;

    return Promise.resolve({
      directoryPath: '.data/leaflets-playwright/atacadao/2026-08-04/10-00',
      metadataPath: '.data/leaflets-playwright/atacadao/2026-08-04/10-00/metadata.json',
      sharedPdfsDirectoryPath: '.data/leaflets-playwright/atacadao/shared-pdfs',
      sharedLeafletsCreated: 1,
      sharedLeafletsReused: 0,
      sharedPdfsDownloaded: 1,
      sharedPdfsReused: 0,
      units: input.units.map((unit) => ({
        unitId: unit.unitId,
        unitName: unit.unitName,
        sourceUrl: unit.sourceUrl,
        directoryPath: `.data/${unit.unitId}`,
        metadataPath: `.data/${unit.unitId}/metadata.json`,
        leafletsDirectoryPath: `.data/${unit.unitId}/leaflets`,
        leaflets: unit.leaflets.map((leaflet) => ({
          leafletId: leaflet.leafletId,
          title: leaflet.title,
          pdfUrl: leaflet.pdfUrl,
          contentSignature: 'hash-1',
          sharedLeafletDirectoryPath: '.data/shared-leaflets/hash-1',
          referencePath: `.data/${unit.unitId}/leaflets/${leaflet.leafletId}.json`,
        })),
      })),
      sharedLeaflets:
        input.units[0]?.leaflets.length === 0
          ? []
          : [
              {
                contentSignature: 'hash-1',
                representativeLeafletId: 'ipiranga-01-boa-do-dia',
                title: 'Boa do Dia',
                directoryPath: '.data/shared-leaflets/hash-1',
                metadataPath: '.data/shared-leaflets/hash-1/metadata.json',
                pdf: {
                  sourceUrl: 'https://cdn.example.com/boa.pdf',
                  canonicalUrl: 'https://cdn.example.com/boa.pdf',
                  filePath: '.data/shared-pdfs/hash-1.pdf',
                  contentType: 'application/pdf',
                  byteLength: 10,
                  contentHash: 'hash-1',
                },
              },
            ],
    });
  }
}
