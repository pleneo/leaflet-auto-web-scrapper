import { describe, expect, it } from 'vitest';
import { createExtractionTarget } from '../../../domain/extraction/extraction-target';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type {
  StoreSharedPdfLeafletExtractionInput,
  StoredSharedPdfLeafletExtraction,
} from '../../storage/leaflet-pdf-storage';
import type {
  ExtractMixMateusLeafletsInput,
  MixMateusLeafletExtractionResult,
} from './mixmateus-leaflet-extractor';
import { MixMateusPlaywrightStrategyAdapter } from './mixmateus-playwright-strategy-adapter';
import type { MixMateusMonitoredStore } from './mixmateus-targets';

describe('MixMateusPlaywrightStrategyAdapter', () => {
  it('executes extraction, stores PDFs and maps output to the worker contract', async () => {
    const extractionService = new FakeExtractionService(createResult());
    const storage = new FakeStorage();
    const adapter = createAdapter(extractionService, storage);

    const output = await adapter.execute(createInput('always'));

    expect(extractionService.inputs[0]?.visualDataset).toEqual({
      runId: 'run-1',
      split: 'unassigned',
    });
    expect(storage.inputs[0]).toMatchObject({
      supermarketId: 'mixmateus',
      units: [
        {
          unitId: 'mix-aracati',
          leaflets: [
            {
              leafletId: 'leaflet-1',
              pdfUrl: 'https://cdn.example.com/leaflet.pdf',
            },
          ],
        },
      ],
    });
    expect(output).toMatchObject({
      runId: 'run-1',
      targetId: 'mixmateus',
      supermarketId: 'mixmateus',
      status: 'partially_succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 1,
      artifactsReused: 2,
      datasetSamplesCreated: 5,
      failures: [
        {
          targetId: 'mixmateus:store:mix-caninde',
          message: 'Store failed.',
        },
      ],
    });
    expect(output.units).toEqual([
      {
        unitId: 'mix-aracati',
        unitName: 'Mix Mateus Aracati',
        status: 'succeeded',
        sourceUrl: STORE.finalPageUrl,
        leaflets: [
          {
            leafletKey: 'signature-1',
            title: 'Leaflet 1',
            contentSignature: 'signature-1',
            artifactCount: 1,
            sourceUrl: 'https://cdn.example.com/leaflet.pdf',
          },
        ],
        errorMessage: null,
      },
      {
        unitId: 'mix-caninde',
        unitName: 'Mix Mateus Canindé',
        status: 'failed',
        sourceUrl: SECOND_STORE.finalPageUrl,
        leaflets: [],
        errorMessage: 'Store failed.',
      },
    ]);
  });

  it('does not pass visual dataset input or count samples when capture is disabled', async () => {
    const extractionService = new FakeExtractionService({
      ...createResult(),
      failedStores: [],
    });
    const storage = new FakeStorage();
    const adapter = createAdapter(extractionService, storage);

    const output = await adapter.execute(createInput('disabled'));

    expect(extractionService.inputs[0]?.visualDataset).toBeUndefined();
    expect(output.status).toBe('succeeded');
    expect(output.datasetSamplesCreated).toBe(0);
  });

  it('marks empty and fully failed results', async () => {
    const emptyAdapter = createAdapter(
      new FakeExtractionService({
        ...createResult(),
        stores: [
          {
            store: STORE,
            sourceUrl: STORE.finalPageUrl,
            leaflets: [],
          },
        ],
        failedStores: [],
      }),
      new FakeStorage({
        units: [
          {
            unitId: 'mix-aracati',
            unitName: 'Mix Mateus Aracati',
            sourceUrl: STORE.finalPageUrl,
            directoryPath: '/tmp/mixmateus/units/mix-aracati',
            metadataPath: '/tmp/mixmateus/units/mix-aracati/metadata.json',
            leafletsDirectoryPath: '/tmp/mixmateus/units/mix-aracati/leaflets',
            leaflets: [],
          },
        ],
        sharedLeaflets: [],
      }),
    );
    const failedAdapter = createAdapter(
      new FakeExtractionService({
        ...createResult(),
        stores: [],
      }),
      new FakeStorage({
        units: [],
        sharedLeaflets: [],
      }),
    );

    const emptyOutput = await emptyAdapter.execute(createInput('disabled'));
    const failedOutput = await failedAdapter.execute(createInput('disabled'));

    expect(emptyOutput.units[0]?.status).toBe('empty');
    expect(failedOutput.status).toBe('failed');
  });

  it('uses zero artifact count when storage metadata cannot resolve a shared PDF', async () => {
    const storage = new FakeStorage({
      sharedLeaflets: [],
    });
    const adapter = createAdapter(new FakeExtractionService(createResult()), storage);

    const output = await adapter.execute(createInput('disabled'));

    expect(output.units[0]?.leaflets[0]?.artifactCount).toBe(0);
  });
});

const STORE: MixMateusMonitoredStore = {
  stateCode: 'CE',
  stateName: 'Ceará',
  cityName: 'Aracati',
  storeSlug: 'mix-aracati',
  storeName: 'Mix Mateus Aracati',
  finalPageUrl: 'https://ofertasmateus.com/ce/aracati/mix-aracati',
};

const SECOND_STORE: MixMateusMonitoredStore = {
  stateCode: 'CE',
  stateName: 'Ceará',
  cityName: 'Canindé',
  storeSlug: 'mix-caninde',
  storeName: 'Mix Mateus Canindé',
  finalPageUrl: 'https://ofertasmateus.com/ce/caninde/mix-caninde',
};

function createAdapter(
  extractionService: FakeExtractionService,
  storage: FakeStorage,
): MixMateusPlaywrightStrategyAdapter {
  return new MixMateusPlaywrightStrategyAdapter(
    {
      extractionInput: {
        homeUrl: 'https://ofertasmateus.com/',
        stores: [STORE],
        viewport: createVisualViewport({
          width: 1366,
          height: 768,
          deviceScaleFactor: 1,
        }),
        timeoutMs: 30_000,
        storeTimeoutMs: 30_000,
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
      countVisualDatasetSamples: () => Promise.resolve(5),
    },
  );
}

function createInput(
  visualDatasetCapturePolicy: 'always' | 'disabled',
): Parameters<MixMateusPlaywrightStrategyAdapter['execute']>[0] {
  return {
    runId: 'run-1',
    startedAtIso: '2026-07-23T10:00:00.000Z',
    target: createExtractionTarget({
      targetId: 'mixmateus',
      supermarketId: 'mixmateus',
      supermarketName: 'Mix Mateus',
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

function createResult(): MixMateusLeafletExtractionResult {
  return {
    source: 'mixmateus-playwright',
    extractedAtIso: '2026-07-23T10:00:00.000Z',
    stores: [
      {
        store: STORE,
        sourceUrl: STORE.finalPageUrl,
        leaflets: [
          {
            leafletId: 'leaflet-1',
            title: 'Leaflet 1',
            cardIndex: 0,
            pdfUrl: 'https://cdn.example.com/leaflet.pdf',
          },
        ],
      },
    ],
    failedStores: [
      {
        store: SECOND_STORE,
        sourceUrl: SECOND_STORE.finalPageUrl,
        errorMessage: 'Store failed.',
      },
    ],
  };
}

class FakeExtractionService {
  readonly inputs: ExtractMixMateusLeafletsInput[] = [];

  private readonly result: MixMateusLeafletExtractionResult;

  constructor(result: MixMateusLeafletExtractionResult) {
    this.result = result;
  }

  extract(input: ExtractMixMateusLeafletsInput): Promise<MixMateusLeafletExtractionResult> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}

class FakeStorage {
  readonly inputs: StoreSharedPdfLeafletExtractionInput[] = [];

  private readonly overrides: PartialStoredExtraction;

  constructor(overrides: PartialStoredExtraction = {}) {
    this.overrides = overrides;
  }

  store(input: StoreSharedPdfLeafletExtractionInput): Promise<StoredSharedPdfLeafletExtraction> {
    this.inputs.push(input);

    return Promise.resolve({
      directoryPath: '/tmp/mixmateus',
      metadataPath: '/tmp/mixmateus/metadata.json',
      sharedPdfsDirectoryPath: '/tmp/mixmateus/shared-pdfs',
      sharedLeafletsCreated: 1,
      sharedLeafletsReused: 0,
      sharedPdfsDownloaded: 1,
      sharedPdfsReused: 2,
      units: this.overrides.units ?? [
        {
          unitId: 'mix-aracati',
          unitName: 'Mix Mateus Aracati',
          sourceUrl: STORE.finalPageUrl,
          directoryPath: '/tmp/mixmateus/units/mix-aracati',
          metadataPath: '/tmp/mixmateus/units/mix-aracati/metadata.json',
          leafletsDirectoryPath: '/tmp/mixmateus/units/mix-aracati/leaflets',
          leaflets: [
            {
              leafletId: 'leaflet-1',
              title: 'Leaflet 1',
              pdfUrl: 'https://cdn.example.com/leaflet.pdf',
              contentSignature: 'signature-1',
              sharedLeafletDirectoryPath: '/tmp/mixmateus/shared-leaflets/signature-1',
              referencePath: '/tmp/mixmateus/units/mix-aracati/leaflets/leaflet-1.json',
            },
          ],
        },
      ],
      sharedLeaflets: this.overrides.sharedLeaflets ?? [
        {
          contentSignature: 'signature-1',
          representativeLeafletId: 'leaflet-1',
          title: 'Leaflet 1',
          directoryPath: '/tmp/mixmateus/shared-leaflets/signature-1',
          metadataPath: '/tmp/mixmateus/shared-leaflets/signature-1/metadata.json',
          pdf: {
            sourceUrl: 'https://cdn.example.com/leaflet.pdf',
            canonicalUrl: 'https://cdn.example.com/leaflet.pdf',
            filePath: '/tmp/mixmateus/shared-pdfs/signature-1.pdf',
            contentType: 'application/pdf',
            byteLength: 3,
            contentHash: 'signature-1',
          },
        },
      ],
    });
  }
}

interface PartialStoredExtraction {
  readonly units?: StoredSharedPdfLeafletExtraction['units'];
  readonly sharedLeaflets?: StoredSharedPdfLeafletExtraction['sharedLeaflets'];
}
