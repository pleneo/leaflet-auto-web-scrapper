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
  createComboAtacadistaExtractionUnits,
  createComboAtacadistaImageGalleryStorageInput,
} from './combo-atacadista-api-strategy-adapter';
import type {
  ComboAtacadistaLeafletExtractionResult,
  ExtractComboAtacadistaLeafletsInput,
} from './combo-atacadista-leaflet-extractor';

export interface ComboAtacadistaPlaywrightExtractionPort {
  extract(
    input: ExtractComboAtacadistaLeafletsInput,
  ): Promise<ComboAtacadistaLeafletExtractionResult>;
}

export interface ComboAtacadistaPlaywrightStoragePort {
  store(input: StoreSharedImageGalleryExtractionInput): Promise<StoredSharedImageGalleryExtraction>;
}

export interface ComboAtacadistaPlaywrightStrategyAdapterConfig {
  readonly extractionInput: Omit<ExtractComboAtacadistaLeafletsInput, 'visualDataset'>;
  readonly outputRootDirectory: string;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export interface ComboAtacadistaPlaywrightStrategyAdapterDependencies {
  readonly extractionService: ComboAtacadistaPlaywrightExtractionPort;
  readonly storage: ComboAtacadistaPlaywrightStoragePort;
  readonly countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>;
}

export class ComboAtacadistaPlaywrightStrategyAdapter implements PlaywrightExtractionStrategy {
  readonly supermarketId: SupermarketId = 'comboatacadista';

  private readonly config: ComboAtacadistaPlaywrightStrategyAdapterConfig;

  private readonly extractionService: ComboAtacadistaPlaywrightExtractionPort;

  private readonly storage: ComboAtacadistaPlaywrightStoragePort;

  private readonly countVisualDatasetSamples: (
    rootDirectory: string,
    runId: string,
  ) => Promise<number>;

  constructor(
    config: ComboAtacadistaPlaywrightStrategyAdapterConfig,
    dependencies: ComboAtacadistaPlaywrightStrategyAdapterDependencies,
  ) {
    this.config = config;
    this.extractionService = dependencies.extractionService;
    this.storage = dependencies.storage;
    this.countVisualDatasetSamples = dependencies.countVisualDatasetSamples;
  }

  async execute(input: PlaywrightExtractionInput): Promise<PlaywrightExtractionOutput> {
    const result = await this.extractionService.extract(createExtractionInput(this.config, input));
    const stored = await this.storage.store(
      createComboAtacadistaImageGalleryStorageInput(this.config.outputRootDirectory, result),
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
      units: createComboAtacadistaExtractionUnits(result, stored),
      failures: result.failedUnits.map((failedUnit) => ({
        targetId: `${input.target.targetId}:unit:${failedUnit.unitId}`,
        message: failedUnit.errorMessage,
      })),
    };
  }
}

function createExtractionInput(
  config: ComboAtacadistaPlaywrightStrategyAdapterConfig,
  input: PlaywrightExtractionInput,
): ExtractComboAtacadistaLeafletsInput {
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
  result: ComboAtacadistaLeafletExtractionResult,
): PlaywrightExtractionOutput['status'] {
  if (result.failedUnits.length === 0) {
    return 'succeeded';
  }

  return result.units.length > 0 ? 'partially_succeeded' : 'failed';
}
