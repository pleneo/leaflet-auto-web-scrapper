import type {
  PlaywrightExtractionInput,
  PlaywrightExtractionLeafletOutput,
  PlaywrightExtractionOutput,
  PlaywrightExtractionStrategy,
  PlaywrightExtractionUnitOutput,
} from '../../../application/ports/playwright-extraction-strategy';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { SupermarketId } from '../../../domain/supermarket/supermarket-id';
import type {
  CarnaubaPlaywrightExtractionInput,
  CarnaubaPlaywrightExtractionResult,
} from './carnauba-playwright-extraction';
import type {
  StoredCarnaubaPlaywrightExtraction,
  StoreCarnaubaPlaywrightExtractionInput,
} from '../../storage/carnauba-playwright-leaflet-storage';
import {
  createCarnaubaRunManifest,
  writeCarnaubaRunManifest,
} from '../../worker/carnauba-run-manifest';

export interface CarnaubaPlaywrightExtractionPort {
  extract(input: CarnaubaPlaywrightExtractionInput): Promise<CarnaubaPlaywrightExtractionResult>;
}

export interface CarnaubaPlaywrightStoragePort {
  store(input: StoreCarnaubaPlaywrightExtractionInput): Promise<StoredCarnaubaPlaywrightExtraction>;
}

export interface CarnaubaPlaywrightStrategyAdapterConfig {
  readonly extractionInput: Omit<CarnaubaPlaywrightExtractionInput, 'visualDataset'>;
  readonly outputRootDirectory: string;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export interface CarnaubaPlaywrightStrategyAdapterDependencies {
  readonly extractionService: CarnaubaPlaywrightExtractionPort;
  readonly storage: CarnaubaPlaywrightStoragePort;
  readonly countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>;
  readonly nowIso: () => string;
}

export class CarnaubaPlaywrightStrategyAdapter implements PlaywrightExtractionStrategy {
  readonly supermarketId: SupermarketId = 'carnauba';

  private readonly config: CarnaubaPlaywrightStrategyAdapterConfig;

  private readonly extractionService: CarnaubaPlaywrightExtractionPort;

  private readonly storage: CarnaubaPlaywrightStoragePort;

  private readonly countVisualDatasetSamples: (
    rootDirectory: string,
    runId: string,
  ) => Promise<number>;

  private readonly nowIso: () => string;

  constructor(
    config: CarnaubaPlaywrightStrategyAdapterConfig,
    dependencies: CarnaubaPlaywrightStrategyAdapterDependencies,
  ) {
    this.config = config;
    this.extractionService = dependencies.extractionService;
    this.storage = dependencies.storage;
    this.countVisualDatasetSamples = dependencies.countVisualDatasetSamples;
    this.nowIso = dependencies.nowIso;
  }

  async execute(input: PlaywrightExtractionInput): Promise<PlaywrightExtractionOutput> {
    const extractionInput = createExtractionInput(this.config, input);
    const result = await this.extractionService.extract(extractionInput);
    const stored = await this.storage.store({
      rootDirectory: this.config.outputRootDirectory,
      result,
    });
    const completedAtIso = this.nowIso();
    const samplesCreated =
      input.visualDatasetCapturePolicy === 'always'
        ? await this.countVisualDatasetSamples(this.config.visualDatasetRootDirectory, input.runId)
        : 0;
    const manifest = createCarnaubaRunManifest({
      runId: input.runId,
      startedAtIso: input.startedAtIso,
      completedAtIso,
      outputDirectoryPath: stored.directoryPath,
      metadataPath: stored.metadataPath,
      result,
      stored,
      visualDataset: {
        enabled: input.visualDatasetCapturePolicy === 'always',
        rootDirectory:
          input.visualDatasetCapturePolicy === 'always'
            ? this.config.visualDatasetRootDirectory
            : null,
        samplesCreated,
      },
    });

    await writeCarnaubaRunManifest(stored.directoryPath, manifest);

    return {
      runId: input.runId,
      targetId: input.target.targetId,
      supermarketId: this.supermarketId,
      status: manifest.status,
      leafletsFound: manifest.leafletsFound,
      artifactsDownloaded: stored.sharedImagesDownloaded,
      artifactsReused: stored.sharedImagesReused,
      datasetSamplesCreated: samplesCreated,
      units: createExtractionUnits(result, stored),
      failures: result.failedStores.map((failedStore) => ({
        targetId: `${input.target.targetId}:store:${String(failedStore.store.storeId)}`,
        message: failedStore.errorMessage,
      })),
    };
  }
}

function createExtractionInput(
  config: CarnaubaPlaywrightStrategyAdapterConfig,
  input: PlaywrightExtractionInput,
): CarnaubaPlaywrightExtractionInput {
  if (input.visualDatasetCapturePolicy === 'disabled') {
    return config.extractionInput;
  }

  return {
    ...config.extractionInput,
    visualDataset: {
      runId: input.runId,
      split: config.visualDatasetSplit,
    },
  };
}

function createExtractionUnits(
  result: CarnaubaPlaywrightExtractionResult,
  stored: StoredCarnaubaPlaywrightExtraction,
): readonly PlaywrightExtractionUnitOutput[] {
  const failedUnits = result.failedStores.map((failedStore): PlaywrightExtractionUnitOutput => {
    return {
      unitId: String(failedStore.store.storeId),
      unitName: failedStore.store.name,
      status: 'failed',
      sourceUrl: failedStore.sourceUrl,
      leaflets: [],
      errorMessage: failedStore.errorMessage,
    };
  });
  const succeededUnits = stored.stores.map((store): PlaywrightExtractionUnitOutput => {
    return {
      unitId: String(store.storeId),
      unitName: store.storeName,
      status: store.leaflets.length === 0 ? 'empty' : 'succeeded',
      sourceUrl: store.sourceUrl,
      leaflets: store.leaflets.map((leaflet) => createExtractionLeaflet(leaflet, stored)),
      errorMessage: null,
    };
  });

  return [...succeededUnits, ...failedUnits];
}

function createExtractionLeaflet(
  leaflet: StoredCarnaubaPlaywrightExtraction['stores'][number]['leaflets'][number],
  stored: StoredCarnaubaPlaywrightExtraction,
): PlaywrightExtractionLeafletOutput {
  const sharedLeaflet = stored.sharedLeaflets.find(
    (candidateLeaflet) => candidateLeaflet.contentSignature === leaflet.contentSignature,
  );

  return {
    leafletKey: leaflet.contentSignature,
    title: leaflet.title,
    contentSignature: leaflet.contentSignature,
    artifactCount: sharedLeaflet?.images.length ?? 0,
    sourceUrl: leaflet.coverImageUrl,
  };
}
