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
  MixMateusApiExtractionInput,
  MixMateusApiExtractionResult,
} from './mixmateus-api-extraction';

export interface MixMateusApiExtractionPort {
  extract(input: MixMateusApiExtractionInput): Promise<MixMateusApiExtractionResult>;
}

export interface MixMateusApiStoragePort {
  store(input: StoreSharedPdfLeafletExtractionInput): Promise<StoredSharedPdfLeafletExtraction>;
}

export interface MixMateusApiStrategyAdapterConfig {
  readonly extractionInput: MixMateusApiExtractionInput;
  readonly outputRootDirectory: string;
}

export interface MixMateusApiStrategyAdapterDependencies {
  readonly extractionService: MixMateusApiExtractionPort;
  readonly storage: MixMateusApiStoragePort;
}

export class MixMateusApiStrategyAdapter implements ExtractionStrategy {
  readonly supermarketId: SupermarketId = 'mixmateus';

  readonly mode = 'api';

  private readonly config: MixMateusApiStrategyAdapterConfig;

  private readonly extractionService: MixMateusApiExtractionPort;

  private readonly storage: MixMateusApiStoragePort;

  constructor(
    config: MixMateusApiStrategyAdapterConfig,
    dependencies: MixMateusApiStrategyAdapterDependencies,
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
      leafletsFound: result.stores.reduce((total, store) => total + store.leaflets.length, 0),
      artifactsDownloaded: stored.sharedPdfsDownloaded,
      artifactsReused: stored.sharedPdfsReused,
      datasetSamplesCreated: 0,
      units: createExtractionUnits(result, stored),
      failures: result.failedStores.map((failedStore) => ({
        targetId: `${input.target.targetId}:store:${failedStore.store.storeSlug}`,
        message: failedStore.errorMessage,
      })),
    };
  }
}

function createStorageInput(
  config: MixMateusApiStrategyAdapterConfig,
  result: MixMateusApiExtractionResult,
): StoreSharedPdfLeafletExtractionInput {
  return {
    rootDirectory: config.outputRootDirectory,
    supermarketId: 'mixmateus',
    extractedAtIso: result.extractedAtIso,
    units: result.stores.map((store) => {
      return {
        unitId: store.store.storeSlug,
        unitName: store.store.storeName,
        sourceUrl: store.sourceUrl,
        leaflets: store.leaflets.map((leaflet) => {
          return {
            leafletId: leaflet.leafletId,
            title: leaflet.title,
            pdfUrl: leaflet.pdfUrl,
          };
        }),
      };
    }),
  };
}

function createExtractionUnits(
  result: MixMateusApiExtractionResult,
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
  const failedUnits = result.failedStores.map((failedStore): ExtractionStrategyUnitOutput => {
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

function resolveStatus(result: MixMateusApiExtractionResult): ExtractionStrategyOutput['status'] {
  if (result.failedStores.length === 0) {
    return 'succeeded';
  }

  return result.stores.length > 0 ? 'partially_succeeded' : 'failed';
}
