import type {
  PlaywrightExtractionInput,
  PlaywrightExtractionOutput,
  PlaywrightExtractionStrategy,
} from '../../../application/ports/playwright-extraction-strategy';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { SupermarketId } from '../../../domain/supermarket/supermarket-id';
import type {
  StoreSharedImageGalleryExtractionInput,
  StoredSharedImageGalleryExtraction,
} from '../../storage/shared-image-gallery-storage';
import {
  createBistekExtractionUnits,
  createBistekImageGalleryStorageInput,
} from './bistek-api-strategy-adapter';
import type {
  BistekLeafletExtractionResult,
  ExtractBistekLeafletsInput,
} from './bistek-leaflet-extractor';

export interface BistekPlaywrightExtractionPort {
  extract(input: ExtractBistekLeafletsInput): Promise<BistekLeafletExtractionResult>;
}

export interface BistekPlaywrightStoragePort {
  store(input: StoreSharedImageGalleryExtractionInput): Promise<StoredSharedImageGalleryExtraction>;
}

export interface BistekPlaywrightStrategyAdapterConfig {
  readonly extractionInput: Omit<ExtractBistekLeafletsInput, 'visualDataset'>;
  readonly outputRootDirectory: string;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export interface BistekPlaywrightStrategyAdapterDependencies {
  readonly extractionService: BistekPlaywrightExtractionPort;
  readonly storage: BistekPlaywrightStoragePort;
  readonly countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>;
}

export class BistekPlaywrightStrategyAdapter implements PlaywrightExtractionStrategy {
  readonly supermarketId: SupermarketId = 'bistek';

  private readonly config: BistekPlaywrightStrategyAdapterConfig;

  private readonly extractionService: BistekPlaywrightExtractionPort;

  private readonly storage: BistekPlaywrightStoragePort;

  private readonly countVisualDatasetSamples: (
    rootDirectory: string,
    runId: string,
  ) => Promise<number>;

  constructor(
    config: BistekPlaywrightStrategyAdapterConfig,
    dependencies: BistekPlaywrightStrategyAdapterDependencies,
  ) {
    this.config = config;
    this.extractionService = dependencies.extractionService;
    this.storage = dependencies.storage;
    this.countVisualDatasetSamples = dependencies.countVisualDatasetSamples;
  }

  async execute(input: PlaywrightExtractionInput): Promise<PlaywrightExtractionOutput> {
    const result = await this.extractionService.extract(createExtractionInput(this.config, input));
    const stored = await this.storage.store(
      createBistekImageGalleryStorageInput(this.config, result),
    );
    const samplesCreated =
      input.visualDatasetCapturePolicy === 'always'
        ? await this.countVisualDatasetSamples(this.config.visualDatasetRootDirectory, input.runId)
        : 0;

    return {
      runId: input.runId,
      targetId: input.target.targetId,
      supermarketId: this.supermarketId,
      status: resolveStatus(result),
      leafletsFound: result.stores.reduce((total, store) => total + store.leaflets.length, 0),
      artifactsDownloaded: stored.sharedImagesDownloaded,
      artifactsReused: stored.sharedImagesReused,
      datasetSamplesCreated: samplesCreated,
      units: createBistekExtractionUnits(result, stored),
      failures: result.failedStores.map((failedStore) => ({
        targetId: `${input.target.targetId}:store:${failedStore.unitId}`,
        message: failedStore.errorMessage,
      })),
    };
  }
}

function createExtractionInput(
  config: BistekPlaywrightStrategyAdapterConfig,
  input: PlaywrightExtractionInput,
): ExtractBistekLeafletsInput {
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

function resolveStatus(
  result: BistekLeafletExtractionResult,
): PlaywrightExtractionOutput['status'] {
  if (result.failedStores.length === 0) {
    return 'succeeded';
  }

  return result.stores.length > 0 ? 'partially_succeeded' : 'failed';
}
