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
  StoreSharedPdfLeafletExtractionInput,
  StoredSharedPdfLeafletExtraction,
} from '../../storage/leaflet-pdf-storage';
import type {
  AtacadaoLeafletExtractionResult,
  ExtractAtacadaoLeafletsInput,
} from './atacadao-leaflet-extractor';

export interface AtacadaoPlaywrightExtractionPort {
  extract(input: ExtractAtacadaoLeafletsInput): Promise<AtacadaoLeafletExtractionResult>;
}

export interface AtacadaoPlaywrightStoragePort {
  store(input: StoreSharedPdfLeafletExtractionInput): Promise<StoredSharedPdfLeafletExtraction>;
}

export interface AtacadaoPlaywrightStrategyAdapterConfig {
  readonly extractionInput: Omit<ExtractAtacadaoLeafletsInput, 'visualDataset'>;
  readonly outputRootDirectory: string;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export interface AtacadaoPlaywrightStrategyAdapterDependencies {
  readonly extractionService: AtacadaoPlaywrightExtractionPort;
  readonly storage: AtacadaoPlaywrightStoragePort;
  readonly countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>;
}

export class AtacadaoPlaywrightStrategyAdapter implements PlaywrightExtractionStrategy {
  readonly supermarketId: SupermarketId = 'atacadao';

  private readonly config: AtacadaoPlaywrightStrategyAdapterConfig;

  private readonly extractionService: AtacadaoPlaywrightExtractionPort;

  private readonly storage: AtacadaoPlaywrightStoragePort;

  private readonly countVisualDatasetSamples: (
    rootDirectory: string,
    runId: string,
  ) => Promise<number>;

  constructor(
    config: AtacadaoPlaywrightStrategyAdapterConfig,
    dependencies: AtacadaoPlaywrightStrategyAdapterDependencies,
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
      artifactsDownloaded: stored.sharedPdfsDownloaded,
      artifactsReused: stored.sharedPdfsReused,
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
  config: AtacadaoPlaywrightStrategyAdapterConfig,
  input: PlaywrightExtractionInput,
): ExtractAtacadaoLeafletsInput {
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
  config: AtacadaoPlaywrightStrategyAdapterConfig,
  result: AtacadaoLeafletExtractionResult,
): StoreSharedPdfLeafletExtractionInput {
  return {
    rootDirectory: config.outputRootDirectory,
    supermarketId: 'atacadao',
    extractedAtIso: result.extractedAtIso,
    units: result.stores.map((store) => ({
      unitId: store.store.storeSlug,
      unitName: store.store.storeName,
      sourceUrl: store.sourceUrl,
      leaflets: store.leaflets.map((leaflet) => ({
        leafletId: leaflet.leafletId,
        title: leaflet.title,
        pdfUrl: leaflet.pdfUrl,
      })),
    })),
  };
}

function createExtractionUnits(
  result: AtacadaoLeafletExtractionResult,
  stored: StoredSharedPdfLeafletExtraction,
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
  leaflet: StoredSharedPdfLeafletExtraction['units'][number]['leaflets'][number],
  stored: StoredSharedPdfLeafletExtraction,
): PlaywrightExtractionLeafletOutput {
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

function resolveStatus(
  result: AtacadaoLeafletExtractionResult,
): PlaywrightExtractionOutput['status'] {
  if (result.failedStores.length === 0) {
    return 'succeeded';
  }

  return result.stores.length > 0 ? 'partially_succeeded' : 'failed';
}
