import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyLeafletOutput,
  ExtractionStrategyOutput,
  ExtractionStrategyUnitOutput,
} from '../../../application/ports/extraction-strategy';
import type { SupermarketId } from '../../../domain/supermarket/supermarket-id';
import type {
  StoredSharedImageGalleryExtraction,
  StoreSharedImageGalleryExtractionInput,
} from '../../storage/shared-image-gallery-storage';
import type { CoopApiExtractionInput, CoopApiExtractionResult } from './coop-api-extraction';

export interface CoopApiExtractionPort {
  extract(input: CoopApiExtractionInput): Promise<CoopApiExtractionResult>;
}

export interface CoopImageGalleryStoragePort {
  store(input: StoreSharedImageGalleryExtractionInput): Promise<StoredSharedImageGalleryExtraction>;
}

export interface CoopApiStrategyAdapterConfig {
  readonly extractionInput: CoopApiExtractionInput;
  readonly outputRootDirectory: string;
}

export interface CoopApiStrategyAdapterDependencies {
  readonly extractionService: CoopApiExtractionPort;
  readonly storage: CoopImageGalleryStoragePort;
}

export class CoopApiStrategyAdapter implements ExtractionStrategy {
  readonly supermarketId: SupermarketId = 'coop';

  readonly mode = 'api';

  private readonly config: CoopApiStrategyAdapterConfig;

  private readonly extractionService: CoopApiExtractionPort;

  private readonly storage: CoopImageGalleryStoragePort;

  constructor(
    config: CoopApiStrategyAdapterConfig,
    dependencies: CoopApiStrategyAdapterDependencies,
  ) {
    this.config = config;
    this.extractionService = dependencies.extractionService;
    this.storage = dependencies.storage;
  }

  async execute(input: ExtractionStrategyInput): Promise<ExtractionStrategyOutput> {
    const result = await this.extractionService.extract(this.config.extractionInput);
    const stored = await this.storage.store(
      createCoopImageGalleryStorageInput(this.config.outputRootDirectory, result),
    );

    return {
      runId: input.runId,
      targetId: input.target.targetId,
      supermarketId: this.supermarketId,
      status: resolveStatus(result),
      leafletsFound: result.units.reduce((total, unit) => total + unit.leaflets.length, 0),
      artifactsDownloaded: stored.sharedImagesDownloaded,
      artifactsReused: stored.sharedImagesReused,
      datasetSamplesCreated: 0,
      units: createCoopExtractionUnits(result, stored),
      failures: result.failedUnits.map((failedUnit) => ({
        targetId: `${input.target.targetId}:unit:${failedUnit.unitId}`,
        message: failedUnit.errorMessage,
      })),
    };
  }
}

export function createCoopImageGalleryStorageInput(
  outputRootDirectory: string,
  result: Pick<CoopApiExtractionResult, 'extractedAtIso' | 'units'>,
): StoreSharedImageGalleryExtractionInput {
  return {
    rootDirectory: outputRootDirectory,
    supermarketId: 'coop',
    extractedAtIso: result.extractedAtIso,
    units: result.units.map((unit) => ({
      unitId: unit.unitId,
      unitName: unit.unitName,
      sourceUrl: unit.sourceUrl,
      leaflets: unit.leaflets.map((leaflet) => ({
        leafletId: leaflet.leafletId,
        title: leaflet.title,
        coverImageUrl: leaflet.coverImageUrl,
        imageUrls: leaflet.imageUrls,
      })),
    })),
  };
}

export function createCoopExtractionUnits(
  result: Pick<CoopApiExtractionResult, 'units' | 'failedUnits'>,
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
  const failedUnits = result.failedUnits.map((failedUnit): ExtractionStrategyUnitOutput => {
    return {
      unitId: failedUnit.unitId,
      unitName: failedUnit.unitName,
      status: 'failed',
      sourceUrl: failedUnit.sourceUrl,
      leaflets: [],
      errorMessage: failedUnit.errorMessage,
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

function resolveStatus(result: CoopApiExtractionResult): ExtractionStrategyOutput['status'] {
  if (result.failedUnits.length === 0) {
    return 'succeeded';
  }

  return result.units.length > 0 ? 'partially_succeeded' : 'failed';
}
