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
import type { BistekApiExtractionInput, BistekApiExtractionResult } from './bistek-api-extraction';

export interface BistekApiExtractionPort {
  extract(input: BistekApiExtractionInput): Promise<BistekApiExtractionResult>;
}

export interface BistekImageGalleryStoragePort {
  store(input: StoreSharedImageGalleryExtractionInput): Promise<StoredSharedImageGalleryExtraction>;
}

export interface BistekApiStrategyAdapterConfig {
  readonly extractionInput: BistekApiExtractionInput;
  readonly outputRootDirectory: string;
}

export interface BistekApiStrategyAdapterDependencies {
  readonly extractionService: BistekApiExtractionPort;
  readonly storage: BistekImageGalleryStoragePort;
}

export class BistekApiStrategyAdapter implements ExtractionStrategy {
  readonly supermarketId: SupermarketId = 'bistek';

  readonly mode = 'api';

  private readonly config: BistekApiStrategyAdapterConfig;

  private readonly extractionService: BistekApiExtractionPort;

  private readonly storage: BistekImageGalleryStoragePort;

  constructor(
    config: BistekApiStrategyAdapterConfig,
    dependencies: BistekApiStrategyAdapterDependencies,
  ) {
    this.config = config;
    this.extractionService = dependencies.extractionService;
    this.storage = dependencies.storage;
  }

  async execute(input: ExtractionStrategyInput): Promise<ExtractionStrategyOutput> {
    const result = await this.extractionService.extract(this.config.extractionInput);
    const stored = await this.storage.store(
      createBistekImageGalleryStorageInput(this.config, result),
    );

    return {
      runId: input.runId,
      targetId: input.target.targetId,
      supermarketId: this.supermarketId,
      status: resolveStatus(result),
      leafletsFound: result.stores.reduce((total, store) => total + store.leaflets.length, 0),
      artifactsDownloaded: stored.sharedImagesDownloaded,
      artifactsReused: stored.sharedImagesReused,
      datasetSamplesCreated: 0,
      units: createBistekExtractionUnits(result, stored),
      failures: result.failedStores.map((failedStore) => ({
        targetId: `${input.target.targetId}:store:${failedStore.unitId}`,
        message: failedStore.errorMessage,
      })),
    };
  }
}

export function createBistekImageGalleryStorageInput(
  config: Pick<BistekApiStrategyAdapterConfig, 'outputRootDirectory'>,
  result: Pick<BistekApiExtractionResult, 'extractedAtIso' | 'stores'>,
): StoreSharedImageGalleryExtractionInput {
  return {
    rootDirectory: config.outputRootDirectory,
    supermarketId: 'bistek',
    extractedAtIso: result.extractedAtIso,
    units: result.stores.map((store) => ({
      unitId: store.unitId,
      unitName: store.unitName,
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

export function createBistekExtractionUnits(
  result: Pick<BistekApiExtractionResult, 'failedStores'>,
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
  const failedUnits = result.failedStores.map((failedStore): ExtractionStrategyUnitOutput => {
    return {
      unitId: failedStore.unitId,
      unitName: failedStore.unitName,
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

function resolveStatus(result: BistekApiExtractionResult): ExtractionStrategyOutput['status'] {
  if (result.failedStores.length === 0) {
    return 'succeeded';
  }

  return result.stores.length > 0 ? 'partially_succeeded' : 'failed';
}
