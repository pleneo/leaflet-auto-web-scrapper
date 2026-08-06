import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyLeafletOutput,
  ExtractionStrategyOutput,
  ExtractionStrategyUnitOutput,
} from '../../../application/ports/extraction-strategy';
import type { SupermarketId } from '../../../domain/supermarket/supermarket-id';
import type {
  StoreSharedImageGalleryExtractionInput,
  StoredSharedImageGalleryExtraction,
} from '../../storage/shared-image-gallery-storage';
import type {
  SuperDoPovoApiExtractionInput,
  SuperDoPovoApiExtractionResult,
} from './superdopovo-api-extraction';

export interface SuperDoPovoApiExtractionPort {
  extract(input: SuperDoPovoApiExtractionInput): Promise<SuperDoPovoApiExtractionResult>;
}

export interface SuperDoPovoApiStoragePort {
  store(input: StoreSharedImageGalleryExtractionInput): Promise<StoredSharedImageGalleryExtraction>;
}

export interface SuperDoPovoApiStrategyAdapterConfig {
  readonly extractionInput: SuperDoPovoApiExtractionInput;
  readonly outputRootDirectory: string;
}

export interface SuperDoPovoApiStrategyAdapterDependencies {
  readonly extractionService: SuperDoPovoApiExtractionPort;
  readonly storage: SuperDoPovoApiStoragePort;
}

export class SuperDoPovoApiStrategyAdapter implements ExtractionStrategy {
  readonly supermarketId: SupermarketId = 'superdopovo';

  readonly mode = 'api';

  private readonly config: SuperDoPovoApiStrategyAdapterConfig;

  private readonly extractionService: SuperDoPovoApiExtractionPort;

  private readonly storage: SuperDoPovoApiStoragePort;

  constructor(
    config: SuperDoPovoApiStrategyAdapterConfig,
    dependencies: SuperDoPovoApiStrategyAdapterDependencies,
  ) {
    this.config = config;
    this.extractionService = dependencies.extractionService;
    this.storage = dependencies.storage;
  }

  async execute(input: ExtractionStrategyInput): Promise<ExtractionStrategyOutput> {
    const result = await this.extractionService.extract(this.config.extractionInput);
    const stored = await this.storage.store(createStorageInput(this.config, result));

    return {
      runId: input.runId,
      targetId: input.target.targetId,
      supermarketId: this.supermarketId,
      status: resolveStatus(result),
      leafletsFound: result.shops.reduce((total, shop) => total + shop.leaflets.length, 0),
      artifactsDownloaded: stored.sharedImagesDownloaded,
      artifactsReused: stored.sharedImagesReused,
      datasetSamplesCreated: 0,
      units: createExtractionUnits(result, stored),
      failures: result.failedShops.map((failedShop) => ({
        targetId: `${input.target.targetId}:shop:${String(failedShop.shop.shopId)}`,
        message: failedShop.errorMessage,
      })),
    };
  }
}

function createStorageInput(
  config: SuperDoPovoApiStrategyAdapterConfig,
  result: SuperDoPovoApiExtractionResult,
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
  result: SuperDoPovoApiExtractionResult,
  stored: StoredSharedImageGalleryExtraction,
): readonly ExtractionStrategyUnitOutput[] {
  const succeededUnits = stored.units.map((unit): ExtractionStrategyUnitOutput => {
    return {
      unitId: unit.unitId,
      unitName: unit.unitName,
      status: unit.leaflets.length === 0 ? 'empty' : 'succeeded',
      sourceUrl: unit.sourceUrl,
      leaflets: unit.leaflets.map((leaflet) => createExtractionLeaflet(leaflet, stored)),
      errorMessage: null,
    };
  });
  const failedUnits = result.failedShops.map((failedShop): ExtractionStrategyUnitOutput => {
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
): ExtractionStrategyLeafletOutput {
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

function resolveStatus(result: SuperDoPovoApiExtractionResult): ExtractionStrategyOutput['status'] {
  if (result.failedShops.length === 0) {
    return 'succeeded';
  }

  return result.shops.length > 0 ? 'partially_succeeded' : 'failed';
}
