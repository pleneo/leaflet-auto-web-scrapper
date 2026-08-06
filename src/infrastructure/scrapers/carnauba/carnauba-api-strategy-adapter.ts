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
  CarnaubaApiExtractionInput,
  CarnaubaApiExtractionResult,
} from './carnauba-api-extraction';

export interface CarnaubaApiExtractionPort {
  extract(input: CarnaubaApiExtractionInput): Promise<CarnaubaApiExtractionResult>;
}

export interface CarnaubaApiStoragePort {
  store(input: StoreSharedImageGalleryExtractionInput): Promise<StoredSharedImageGalleryExtraction>;
}

export interface CarnaubaApiStrategyAdapterConfig {
  readonly extractionInput: CarnaubaApiExtractionInput;
  readonly outputRootDirectory: string;
  readonly siteBaseUrl: string;
}

export interface CarnaubaApiStrategyAdapterDependencies {
  readonly extractionService: CarnaubaApiExtractionPort;
  readonly storage: CarnaubaApiStoragePort;
}

export class CarnaubaApiStrategyAdapter implements ExtractionStrategy {
  readonly supermarketId: SupermarketId = 'carnauba';

  readonly mode = 'api';

  private readonly config: CarnaubaApiStrategyAdapterConfig;

  private readonly extractionService: CarnaubaApiExtractionPort;

  private readonly storage: CarnaubaApiStoragePort;

  constructor(
    config: CarnaubaApiStrategyAdapterConfig,
    dependencies: CarnaubaApiStrategyAdapterDependencies,
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
      status: 'succeeded',
      leafletsFound: result.stores.reduce((total, store) => total + store.leaflets.length, 0),
      artifactsDownloaded: stored.sharedImagesDownloaded,
      artifactsReused: stored.sharedImagesReused,
      datasetSamplesCreated: 0,
      units: createExtractionUnits(stored),
      failures: [],
    };
  }
}

function createStorageInput(
  config: CarnaubaApiStrategyAdapterConfig,
  result: CarnaubaApiExtractionResult,
): StoreSharedImageGalleryExtractionInput {
  return {
    rootDirectory: config.outputRootDirectory,
    supermarketId: 'carnauba',
    extractedAtIso: result.extractedAtIso,
    units: result.stores.map((store) => {
      return {
        unitId: String(store.store.storeId),
        unitName: store.store.name,
        sourceUrl: buildStoreLeafletsUrl(config.siteBaseUrl, store.store.storeId),
        leaflets: store.leaflets.map((leaflet) => {
          return {
            leafletId: leaflet.leafletId,
            title: leaflet.title,
            coverImageUrl: leaflet.images[0]?.imageUrl ?? String(leaflet.flipbookId),
            imageUrls: leaflet.images.map((image) => image.imageUrl),
          };
        }),
      };
    }),
  };
}

function createExtractionUnits(
  stored: StoredSharedImageGalleryExtraction,
): readonly ExtractionStrategyUnitOutput[] {
  return stored.units.map((unit): ExtractionStrategyUnitOutput => {
    return {
      unitId: unit.unitId,
      unitName: unit.unitName,
      status: unit.leaflets.length === 0 ? 'empty' : 'succeeded',
      sourceUrl: unit.sourceUrl,
      leaflets: unit.leaflets.map((leaflet) => createExtractionLeaflet(leaflet, stored)),
      errorMessage: null,
    };
  });
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

function buildStoreLeafletsUrl(siteBaseUrl: string, storeId: number): string {
  return `${siteBaseUrl.replace(/\/+$/, '')}/loja/${String(storeId)}/encartes`;
}
