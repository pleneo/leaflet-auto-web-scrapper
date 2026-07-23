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
  SuperDoPovoPlaywrightExtractionInput,
  SuperDoPovoPlaywrightExtractionResult,
} from './superdopovo-playwright-extraction';

export interface SuperDoPovoPlaywrightExtractionPort {
  extract(
    input: SuperDoPovoPlaywrightExtractionInput,
  ): Promise<SuperDoPovoPlaywrightExtractionResult>;
}

export interface SuperDoPovoPlaywrightStoragePort {
  store(
    input: StoreSharedImageGalleryExtractionInput,
  ): Promise<StoredSharedImageGalleryExtraction>;
}

export interface SuperDoPovoPlaywrightStrategyAdapterConfig {
  readonly extractionInput: Omit<SuperDoPovoPlaywrightExtractionInput, 'visualDataset'>;
  readonly outputRootDirectory: string;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export interface SuperDoPovoPlaywrightStrategyAdapterDependencies {
  readonly extractionService: SuperDoPovoPlaywrightExtractionPort;
  readonly storage: SuperDoPovoPlaywrightStoragePort;
  readonly countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>;
}

export class SuperDoPovoPlaywrightStrategyAdapter implements PlaywrightExtractionStrategy {
  readonly supermarketId: SupermarketId = 'superdopovo';

  private readonly config: SuperDoPovoPlaywrightStrategyAdapterConfig;

  private readonly extractionService: SuperDoPovoPlaywrightExtractionPort;

  private readonly storage: SuperDoPovoPlaywrightStoragePort;

  private readonly countVisualDatasetSamples: (
    rootDirectory: string,
    runId: string,
  ) => Promise<number>;

  constructor(
    config: SuperDoPovoPlaywrightStrategyAdapterConfig,
    dependencies: SuperDoPovoPlaywrightStrategyAdapterDependencies,
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
      leafletsFound: result.shops.reduce((total, shop) => total + shop.leaflets.length, 0),
      artifactsDownloaded: stored.sharedImagesDownloaded,
      artifactsReused: stored.sharedImagesReused,
      datasetSamplesCreated: samplesCreated,
      units: createExtractionUnits(result, stored),
      failures: result.failedShops.map((failedShop) => ({
        targetId: `${input.target.targetId}:shop:${String(failedShop.shop.shopId)}`,
        message: failedShop.errorMessage,
      })),
    };
  }
}

function createExtractionInput(
  config: SuperDoPovoPlaywrightStrategyAdapterConfig,
  input: PlaywrightExtractionInput,
): SuperDoPovoPlaywrightExtractionInput {
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
  config: SuperDoPovoPlaywrightStrategyAdapterConfig,
  result: SuperDoPovoPlaywrightExtractionResult,
): StoreSharedImageGalleryExtractionInput {
  return {
    rootDirectory: config.outputRootDirectory,
    supermarketId: 'superdopovo',
    extractedAtIso: result.extractedAtIso,
    units: result.shops.map((shop) => {
      return {
        unitId: String(shop.shop.shopId),
        unitName: shop.shop.name,
        sourceUrl: shop.sourceUrl,
        leaflets: shop.leaflets.map((leaflet) => {
          return {
            leafletId: leaflet.leafletId,
            title: leaflet.title,
            coverImageUrl: leaflet.coverImageUrl,
            imageUrls: leaflet.images.map((image) => image.imageUrl),
          };
        }),
      };
    }),
  };
}

function createExtractionUnits(
  result: SuperDoPovoPlaywrightExtractionResult,
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
  const failedUnits = result.failedShops.map((failedShop): PlaywrightExtractionUnitOutput => {
    return {
      unitId: String(failedShop.shop.shopId),
      unitName: failedShop.shop.name,
      status: 'failed',
      sourceUrl: failedShop.sourceUrl,
      leaflets: [],
      errorMessage: failedShop.errorMessage,
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
    imageCount: sharedLeaflet?.images.length ?? 0,
    sourceUrl: leaflet.coverImageUrl,
  };
}

function resolveStatus(
  result: SuperDoPovoPlaywrightExtractionResult,
): PlaywrightExtractionOutput['status'] {
  if (result.failedShops.length === 0) {
    return 'succeeded';
  }

  return result.shops.length > 0 ? 'partially_succeeded' : 'failed';
}
