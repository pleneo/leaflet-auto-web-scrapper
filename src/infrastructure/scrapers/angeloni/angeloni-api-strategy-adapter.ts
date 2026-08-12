import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyLeafletOutput,
  ExtractionStrategyOutput,
  ExtractionStrategyUnitOutput,
} from '../../../application/ports/extraction-strategy';
import type { SupermarketId } from '../../../domain/supermarket/supermarket-id';
import type {
  StoreSharedPdfLeafletExtractionInput,
  StoredSharedPdfLeafletExtraction,
} from '../../storage/leaflet-pdf-storage';
import type {
  AngeloniApiExtractionInput,
  AngeloniApiExtractionResult,
} from './angeloni-api-extraction';

export interface AngeloniApiExtractionPort {
  extract(input: AngeloniApiExtractionInput): Promise<AngeloniApiExtractionResult>;
}

export interface AngeloniApiStoragePort {
  store(input: StoreSharedPdfLeafletExtractionInput): Promise<StoredSharedPdfLeafletExtraction>;
}

export interface AngeloniApiStrategyAdapterConfig {
  readonly extractionInput: AngeloniApiExtractionInput;
  readonly outputRootDirectory: string;
}

export interface AngeloniApiStrategyAdapterDependencies {
  readonly extractionService: AngeloniApiExtractionPort;
  readonly storage: AngeloniApiStoragePort;
}

export class AngeloniApiStrategyAdapter implements ExtractionStrategy {
  readonly supermarketId: SupermarketId = 'angeloni';

  readonly mode = 'api';

  private readonly config: AngeloniApiStrategyAdapterConfig;

  private readonly extractionService: AngeloniApiExtractionPort;

  private readonly storage: AngeloniApiStoragePort;

  constructor(
    config: AngeloniApiStrategyAdapterConfig,
    dependencies: AngeloniApiStrategyAdapterDependencies,
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
      leafletsFound: result.regions.reduce((total, region) => total + region.leaflets.length, 0),
      artifactsDownloaded: stored.sharedPdfsDownloaded,
      artifactsReused: stored.sharedPdfsReused,
      datasetSamplesCreated: 0,
      units: createExtractionUnits(result, stored),
      failures: result.failedRegions.map((failedRegion) => ({
        targetId: `${input.target.targetId}:region:${failedRegion.region.regionSlug}`,
        message: failedRegion.errorMessage,
      })),
    };
  }
}

function createStorageInput(
  config: AngeloniApiStrategyAdapterConfig,
  result: AngeloniApiExtractionResult,
): StoreSharedPdfLeafletExtractionInput {
  return {
    rootDirectory: config.outputRootDirectory,
    supermarketId: 'angeloni',
    extractedAtIso: result.extractedAtIso,
    units: result.regions.map((region) => ({
      unitId: region.region.regionSlug,
      unitName: region.region.regionName,
      sourceUrl: region.sourceUrl,
      leaflets: region.leaflets.map((leaflet) => ({
        leafletId: leaflet.leafletId,
        title: leaflet.title,
        pdfUrl: leaflet.pdfUrl,
      })),
    })),
  };
}

function createExtractionUnits(
  result: AngeloniApiExtractionResult,
  stored: StoredSharedPdfLeafletExtraction,
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
  const failedUnits = result.failedRegions.map((failedRegion): ExtractionStrategyUnitOutput => {
    return {
      unitId: failedRegion.region.regionSlug,
      unitName: failedRegion.region.regionName,
      status: 'failed',
      sourceUrl: failedRegion.sourceUrl,
      leaflets: [],
      errorMessage: failedRegion.errorMessage,
    };
  });

  return [...succeededUnits, ...failedUnits];
}

function createExtractionLeaflet(
  leaflet: StoredSharedPdfLeafletExtraction['units'][number]['leaflets'][number],
  stored: StoredSharedPdfLeafletExtraction,
): ExtractionStrategyLeafletOutput {
  const sharedLeaflet = stored.sharedLeaflets.find(
    (candidateLeaflet) => candidateLeaflet.contentSignature === leaflet.contentSignature,
  );

  return {
    leafletKey: leaflet.contentSignature,
    title: leaflet.title,
    contentSignature: leaflet.contentSignature,
    artifactCount: sharedLeaflet === undefined ? 0 : 1,
    sourceUrl: leaflet.pdfUrl,
  };
}

function resolveStatus(result: AngeloniApiExtractionResult): ExtractionStrategyOutput['status'] {
  if (result.failedRegions.length === 0) {
    return 'succeeded';
  }

  return result.regions.length > 0 ? 'partially_succeeded' : 'failed';
}
