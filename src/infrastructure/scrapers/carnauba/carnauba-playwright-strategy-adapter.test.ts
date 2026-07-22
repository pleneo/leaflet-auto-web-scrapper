import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type { PlaywrightExtractionInput } from '../../../application/ports/playwright-extraction-strategy';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type { CarnaubaPlaywrightExtractionResult } from './carnauba-playwright-extraction';
import {
  CarnaubaPlaywrightStrategyAdapter,
  type CarnaubaPlaywrightExtractionPort,
  type CarnaubaPlaywrightStoragePort,
} from './carnauba-playwright-strategy-adapter';
import type { StoredCarnaubaPlaywrightExtraction } from '../../storage/carnauba-playwright-leaflet-storage';

describe('CarnaubaPlaywrightStrategyAdapter', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'carnauba-strategy-adapter-'));
  });

  afterEach(async () => {
    await rm(rootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('extracts, stores, writes manifest and maps generic output', async () => {
    const outputDirectory = join(rootDirectory, 'leaflets');
    const storedDirectory = join(outputDirectory, 'carnauba', '2026-07-22', '10-00');
    await mkdir(storedDirectory, {
      recursive: true,
    });
    const extractionService = new FakeCarnaubaExtractionService(createExtractionResult());
    const storage = new FakeCarnaubaStorage(createStoredExtraction(storedDirectory));
    const countVisualDatasetSamples = vi.fn(() => Promise.resolve(4));
    const adapter = createAdapter({
      countVisualDatasetSamples,
      extractionService,
      outputDirectory,
      storage,
    });

    const output = await adapter.execute(createInput('always'));

    expect(output).toEqual({
      runId: 'run-1',
      targetId: 'carnauba',
      supermarketId: 'carnauba',
      status: 'partially_succeeded',
      leafletsFound: 1,
      artifactsDownloaded: 1,
      artifactsReused: 1,
      datasetSamplesCreated: 4,
      failures: [
        {
          targetId: 'carnauba:store:70',
          message: 'Store unavailable.',
        },
      ],
    });
    expect(extractionService.inputs[0]?.visualDataset).toEqual({
      runId: 'run-1',
      split: 'unassigned',
    });
    expect(storage.inputs[0]?.rootDirectory).toBe(outputDirectory);
    expect(countVisualDatasetSamples).toHaveBeenCalledWith(join(rootDirectory, 'visual'), 'run-1');

    const manifest = JSON.parse(await readFile(join(storedDirectory, 'run.json'), 'utf8')) as {
      readonly visualDataset: {
        readonly enabled: boolean;
        readonly samplesCreated: number;
      };
    };
    expect(manifest.visualDataset).toEqual({
      enabled: true,
      rootDirectory: join(rootDirectory, 'visual'),
      samplesCreated: 4,
    });
  });

  it('does not pass Visual Dataset config when capture policy is disabled', async () => {
    const outputDirectory = join(rootDirectory, 'leaflets');
    const storedDirectory = join(outputDirectory, 'carnauba', '2026-07-22', '10-00');
    await mkdir(storedDirectory, {
      recursive: true,
    });
    const extractionService = new FakeCarnaubaExtractionService(createExtractionResult());
    const adapter = createAdapter({
      countVisualDatasetSamples: vi.fn(() => Promise.resolve(4)),
      extractionService,
      outputDirectory,
      storage: new FakeCarnaubaStorage(createStoredExtraction(storedDirectory)),
    });

    const output = await adapter.execute(createInput('disabled'));

    expect(output.datasetSamplesCreated).toBe(0);
    expect(extractionService.inputs[0]?.visualDataset).toBeUndefined();
  });

  function createAdapter(input: {
    readonly countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>;
    readonly extractionService: CarnaubaPlaywrightExtractionPort;
    readonly outputDirectory: string;
    readonly storage: CarnaubaPlaywrightStoragePort;
  }): CarnaubaPlaywrightStrategyAdapter {
    return new CarnaubaPlaywrightStrategyAdapter(
      {
        extractionInput: {
          brandId: 27,
          storeCacheTtlMs: 86_400_000,
          siteBaseUrl: 'https://carnaubasupermercados.com.br',
          viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
          timeoutMs: 30_000,
          storeTimeoutMs: 120_000,
          maxStoreAttempts: 2,
          settleDelayMs: 5_000,
        },
        outputRootDirectory: input.outputDirectory,
        visualDatasetRootDirectory: join(rootDirectory, 'visual'),
        visualDatasetSplit: 'unassigned',
      },
      {
        extractionService: input.extractionService,
        storage: input.storage,
        countVisualDatasetSamples: input.countVisualDatasetSamples,
        nowIso: () => '2026-07-22T10:05:00.000Z',
      },
    );
  }
});

function createInput(visualDatasetCapturePolicy: 'always' | 'disabled'): PlaywrightExtractionInput {
  return {
    runId: 'run-1',
    target: {
      targetId: 'carnauba',
      supermarketId: 'carnauba',
      supermarketName: 'Carnauba Supermercados',
      mode: 'playwright',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 3,
    },
    startedAtIso: '2026-07-22T10:00:00.000Z',
    visualDatasetCapturePolicy,
    logger: new FakeLogger(),
  };
}

function createExtractionResult(): CarnaubaPlaywrightExtractionResult {
  return {
    brandId: 27,
    source: 'carnauba-playwright',
    extractedAtIso: '2026-07-22T10:00:00.000Z',
    stores: [
      {
        store: {
          storeId: 79,
          name: 'Maestro',
          cnpj: '',
          corporateName: '',
        },
        sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
        attempts: 1,
        leaflets: [
          {
            leafletId: 'leaflet-1',
            title: 'Leaflet 1',
            cardIndex: 0,
            coverImageUrl: 'https://cdn.example.com/cover.png',
            images: [
              {
                order: 1,
                imageUrl: 'https://cdn.example.com/1.png',
              },
              {
                order: 2,
                imageUrl: 'https://cdn.example.com/2.png',
              },
            ],
          },
        ],
      },
    ],
    failedStores: [
      {
        store: {
          storeId: 70,
          name: 'Messejana',
          cnpj: '',
          corporateName: '',
        },
        sourceUrl: 'https://carnaubasupermercados.com.br/loja/70/encartes',
        attempts: 2,
        errorMessage: 'Store unavailable.',
      },
    ],
  };
}

function createStoredExtraction(directoryPath: string): StoredCarnaubaPlaywrightExtraction {
  return {
    directoryPath,
    metadataPath: join(directoryPath, 'metadata.json'),
    sharedLeafletsDirectoryPath: join(directoryPath, 'shared-leaflets'),
    sharedLeaflets: [
      {
        contentSignature: 'signature-1',
        representativeLeafletId: 'leaflet-1',
        title: 'Leaflet 1',
        directoryPath: join(directoryPath, 'shared-leaflets', 'signature-1'),
        metadataPath: join(directoryPath, 'shared-leaflets', 'signature-1', 'metadata.json'),
        images: [
          {
            order: 1,
            sourceUrl: 'https://cdn.example.com/1.png',
            canonicalUrl: 'https://cdn.example.com/1.png',
            filePath: join(directoryPath, 'shared-leaflets', 'signature-1', '001.png'),
            contentType: 'image/png',
            byteLength: 1,
            contentHash: 'hash-1',
          },
        ],
      },
    ],
    stores: [],
  };
}

class FakeCarnaubaExtractionService implements CarnaubaPlaywrightExtractionPort {
  readonly inputs: Parameters<CarnaubaPlaywrightExtractionPort['extract']>[0][] = [];

  private readonly result: CarnaubaPlaywrightExtractionResult;

  constructor(result: CarnaubaPlaywrightExtractionResult) {
    this.result = result;
  }

  extract(
    input: Parameters<CarnaubaPlaywrightExtractionPort['extract']>[0],
  ): Promise<CarnaubaPlaywrightExtractionResult> {
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }
}

class FakeCarnaubaStorage implements CarnaubaPlaywrightStoragePort {
  readonly inputs: Parameters<CarnaubaPlaywrightStoragePort['store']>[0][] = [];

  private readonly stored: StoredCarnaubaPlaywrightExtraction;

  constructor(stored: StoredCarnaubaPlaywrightExtraction) {
    this.stored = stored;
  }

  store(
    input: Parameters<CarnaubaPlaywrightStoragePort['store']>[0],
  ): Promise<StoredCarnaubaPlaywrightExtraction> {
    this.inputs.push(input);
    return Promise.resolve(this.stored);
  }
}

class FakeLogger implements Logger {
  debug = vi.fn();

  info = vi.fn();

  warn = vi.fn();

  error = vi.fn();
}
