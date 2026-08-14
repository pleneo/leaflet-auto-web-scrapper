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
import type { TausteApiExtractionInput, TausteApiExtractionResult } from './tauste-api-extraction';

export interface TausteApiExtractionPort {
  extract(input: TausteApiExtractionInput): Promise<TausteApiExtractionResult>;
}

export interface TausteApiStoragePort {
  store(input: StoreSharedPdfLeafletExtractionInput): Promise<StoredSharedPdfLeafletExtraction>;
}

export interface TausteApiStrategyAdapterConfig {
  readonly extractionInput: TausteApiExtractionInput;
  readonly outputRootDirectory: string;
}

export interface TausteApiStrategyAdapterDependencies {
  readonly extractionService: TausteApiExtractionPort;
  readonly storage: TausteApiStoragePort;
}

export class TausteApiStrategyAdapter implements ExtractionStrategy {
  readonly supermarketId: SupermarketId = 'tauste';

  readonly mode = 'api';

  private readonly config: TausteApiStrategyAdapterConfig;

  private readonly extractionService: TausteApiExtractionPort;

  private readonly storage: TausteApiStoragePort;

  constructor(
    config: TausteApiStrategyAdapterConfig,
    dependencies: TausteApiStrategyAdapterDependencies,
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
      leafletsFound: result.units.reduce((total, unit) => total + unit.leaflets.length, 0),
      artifactsDownloaded: stored.sharedPdfsDownloaded,
      artifactsReused: stored.sharedPdfsReused,
      datasetSamplesCreated: 0,
      units: createExtractionUnits(result, stored),
      failures: result.failedPublications.map((failedPublication) => ({
        targetId: `${input.target.targetId}:publication:${failedPublication.publicationId}`,
        message: failedPublication.errorMessage,
      })),
    };
  }
}

function createStorageInput(
  config: TausteApiStrategyAdapterConfig,
  result: TausteApiExtractionResult,
): StoreSharedPdfLeafletExtractionInput {
  return {
    rootDirectory: config.outputRootDirectory,
    supermarketId: 'tauste',
    extractedAtIso: result.extractedAtIso,
    units: result.units.map((unit) => ({
      unitId: unit.unitId,
      unitName: unit.unitName,
      sourceUrl: unit.sourceUrl,
      leaflets: unit.leaflets.map((leaflet) => ({
        leafletId: leaflet.leafletId,
        title: leaflet.title,
        pdfUrl: leaflet.pdfUrl,
      })),
    })),
  };
}

function createExtractionUnits(
  result: TausteApiExtractionResult,
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

  if (succeededUnits.length > 0) {
    return succeededUnits;
  }

  return result.failedPublications.map((failedPublication): ExtractionStrategyUnitOutput => {
    return {
      unitId: failedPublication.publicationId,
      unitName: failedPublication.title,
      status: 'failed',
      sourceUrl: failedPublication.sourceUrl,
      leaflets: [],
      errorMessage: failedPublication.errorMessage,
    };
  });
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

function resolveStatus(result: TausteApiExtractionResult): ExtractionStrategyOutput['status'] {
  if (result.failedPublications.length === 0) {
    return 'succeeded';
  }

  return result.units.length > 0 ? 'partially_succeeded' : 'failed';
}
