import type {
  PlaywrightExtractionInput,
  PlaywrightExtractionOutput,
  PlaywrightExtractionStrategy,
} from '../../../application/ports/playwright-extraction-strategy';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { SupermarketId } from '../../../domain/supermarket/supermarket-id';
import type {
  StoredSharedImageGalleryExtraction,
  StoreSharedImageGalleryExtractionInput,
} from '../../storage/shared-image-gallery-storage';
import {
  createCoopExtractionUnits,
  createCoopImageGalleryStorageInput,
} from './coop-api-strategy-adapter';
import type {
  CoopLeafletExtractionResult,
  ExtractCoopLeafletsInput,
} from './coop-leaflet-extractor';

export interface CoopPlaywrightExtractionPort {
  extract(input: ExtractCoopLeafletsInput): Promise<CoopLeafletExtractionResult>;
}

export interface CoopPlaywrightStoragePort {
  store(input: StoreSharedImageGalleryExtractionInput): Promise<StoredSharedImageGalleryExtraction>;
}

export interface CoopPlaywrightStrategyAdapterConfig {
  readonly extractionInput: Omit<ExtractCoopLeafletsInput, 'visualDataset'>;
  readonly outputRootDirectory: string;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export interface CoopPlaywrightStrategyAdapterDependencies {
  readonly extractionService: CoopPlaywrightExtractionPort;
  readonly storage: CoopPlaywrightStoragePort;
  readonly countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>;
}

export class CoopPlaywrightStrategyAdapter implements PlaywrightExtractionStrategy {
  readonly supermarketId: SupermarketId = 'coop';

  private readonly config: CoopPlaywrightStrategyAdapterConfig;

  private readonly extractionService: CoopPlaywrightExtractionPort;

  private readonly storage: CoopPlaywrightStoragePort;

  private readonly countVisualDatasetSamples: (
    rootDirectory: string,
    runId: string,
  ) => Promise<number>;

  constructor(
    config: CoopPlaywrightStrategyAdapterConfig,
    dependencies: CoopPlaywrightStrategyAdapterDependencies,
  ) {
    this.config = config;
    this.extractionService = dependencies.extractionService;
    this.storage = dependencies.storage;
    this.countVisualDatasetSamples = dependencies.countVisualDatasetSamples;
  }

  async execute(input: PlaywrightExtractionInput): Promise<PlaywrightExtractionOutput> {
    const result = await this.extractionService.extract(createExtractionInput(this.config, input));
    const stored = await this.storage.store(
      createCoopImageGalleryStorageInput(this.config.outputRootDirectory, result),
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
      leafletsFound: result.units.reduce((total, unit) => total + unit.leaflets.length, 0),
      artifactsDownloaded: stored.sharedImagesDownloaded,
      artifactsReused: stored.sharedImagesReused,
      datasetSamplesCreated: samplesCreated,
      units: createCoopExtractionUnits(result, stored),
      failures: result.failedUnits.map((failedUnit) => ({
        targetId: `${input.target.targetId}:unit:${failedUnit.unitId}`,
        message: failedUnit.errorMessage,
      })),
    };
  }
}

function createExtractionInput(
  config: CoopPlaywrightStrategyAdapterConfig,
  input: PlaywrightExtractionInput,
): ExtractCoopLeafletsInput {
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

function resolveStatus(result: CoopLeafletExtractionResult): PlaywrightExtractionOutput['status'] {
  if (result.failedUnits.length === 0) {
    return 'succeeded';
  }

  return result.units.length > 0 ? 'partially_succeeded' : 'failed';
}
