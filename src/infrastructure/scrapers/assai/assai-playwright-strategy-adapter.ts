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
  StoreSharedImageGalleryExtractionInput,
  StoredSharedImageGalleryExtraction,
} from '../../storage/shared-image-gallery-storage';
import type {
  AssaiLeafletExtractionResult,
  ExtractAssaiLeafletsInput,
} from './assai-leaflet-extractor';

export interface AssaiPlaywrightExtractionPort {
  extract(input: ExtractAssaiLeafletsInput): Promise<AssaiLeafletExtractionResult>;
}

export interface AssaiPlaywrightStoragePort {
  store(input: StoreSharedImageGalleryExtractionInput): Promise<StoredSharedImageGalleryExtraction>;
}

export interface AssaiPlaywrightStrategyAdapterConfig {
  readonly extractionInput: Omit<ExtractAssaiLeafletsInput, 'visualDataset'>;
  readonly outputRootDirectory: string;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export interface AssaiPlaywrightStrategyAdapterDependencies {
  readonly extractionService: AssaiPlaywrightExtractionPort;
  readonly storage: AssaiPlaywrightStoragePort;
  readonly countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>;
}

export class AssaiPlaywrightStrategyAdapter implements PlaywrightExtractionStrategy {
  readonly supermarketId: SupermarketId = 'assai';

  private readonly config: AssaiPlaywrightStrategyAdapterConfig;

  private readonly extractionService: AssaiPlaywrightExtractionPort;

  private readonly storage: AssaiPlaywrightStoragePort;

  private readonly countVisualDatasetSamples: (
    rootDirectory: string,
    runId: string,
  ) => Promise<number>;

  constructor(
    config: AssaiPlaywrightStrategyAdapterConfig,
    dependencies: AssaiPlaywrightStrategyAdapterDependencies,
  ) {
    this.config = config;
    this.extractionService = dependencies.extractionService;
    this.storage = dependencies.storage;
    this.countVisualDatasetSamples = dependencies.countVisualDatasetSamples;
  }

  async execute(input: PlaywrightExtractionInput): Promise<PlaywrightExtractionOutput> {
    const result = await this.extractionService.extract(createExtractionInput(this.config, input));
    const stored = await this.storage.store(createStorageInput(this.config, result));
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
      units: createExtractionUnits(result, stored),
      failures: result.failedStores.map((failedStore) => ({
        targetId: `${input.target.targetId}:store:${failedStore.store.storeSlug}`,
        message: failedStore.errorMessage,
      })),
    };
  }
}

function createExtractionInput(
  config: AssaiPlaywrightStrategyAdapterConfig,
  input: PlaywrightExtractionInput,
): ExtractAssaiLeafletsInput {
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

function createStorageInput(
  config: AssaiPlaywrightStrategyAdapterConfig,
  result: AssaiLeafletExtractionResult,
): StoreSharedImageGalleryExtractionInput {
  return {
    rootDirectory: config.outputRootDirectory,
    supermarketId: 'assai',
    extractedAtIso: result.extractedAtIso,
    units: result.stores.map((store) => ({
      unitId: store.store.storeSlug,
      unitName: store.store.storeName,
      sourceUrl: store.sourceUrl,
      leaflets: store.leaflets.map((leaflet) => ({
        leafletId: leaflet.leafletId,
        title: leaflet.title,
        coverImageUrl: leaflet.coverImageUrl,
        imageUrls: leaflet.imageUrls,
      })),
    })),
  };
}

function createExtractionUnits(
  result: AssaiLeafletExtractionResult,
  stored: StoredSharedImageGalleryExtraction,
): readonly PlaywrightExtractionUnitOutput[] {
  const succeededUnits = stored.units.map((unit): PlaywrightExtractionUnitOutput => {
    return {
      unitId: unit.unitId,
      unitName: unit.unitName,
      status: unit.leaflets.length === 0 ? 'empty' : 'succeeded',
      sourceUrl: unit.sourceUrl,
      leaflets: unit.leaflets.map((leaflet) => createExtractionLeaflet(leaflet, stored)),
      errorMessage: null,
    };
  });
  const failedUnits = result.failedStores.map((failedStore): PlaywrightExtractionUnitOutput => {
    return {
      unitId: failedStore.store.storeSlug,
      unitName: failedStore.store.storeName,
      status: 'failed',
      sourceUrl: failedStore.sourceUrl,
      leaflets: [],
      errorMessage: failedStore.errorMessage,
    };
  });

  return [...succeededUnits, ...failedUnits];
}

function createExtractionLeaflet(
  leaflet: StoredSharedImageGalleryExtraction['units'][number]['leaflets'][number],
  stored: StoredSharedImageGalleryExtraction,
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

function resolveStatus(result: AssaiLeafletExtractionResult): PlaywrightExtractionOutput['status'] {
  if (result.failedStores.length === 0) {
    return 'succeeded';
  }

  return result.stores.length > 0 ? 'partially_succeeded' : 'failed';
}
