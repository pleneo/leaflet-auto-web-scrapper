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
  ExtractTausteLeafletsInput,
  TausteLeafletExtractionResult,
} from './tauste-leaflet-extractor';

export interface TaustePlaywrightExtractionPort {
  extract(input: ExtractTausteLeafletsInput): Promise<TausteLeafletExtractionResult>;
}

export interface TaustePlaywrightStoragePort {
  store(input: StoreSharedPdfLeafletExtractionInput): Promise<StoredSharedPdfLeafletExtraction>;
}

export interface TaustePlaywrightStrategyAdapterConfig {
  readonly extractionInput: Omit<ExtractTausteLeafletsInput, 'visualDataset'>;
  readonly outputRootDirectory: string;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export interface TaustePlaywrightStrategyAdapterDependencies {
  readonly extractionService: TaustePlaywrightExtractionPort;
  readonly storage: TaustePlaywrightStoragePort;
  readonly countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>;
}

export class TaustePlaywrightStrategyAdapter implements PlaywrightExtractionStrategy {
  readonly supermarketId: SupermarketId = 'tauste';

  private readonly config: TaustePlaywrightStrategyAdapterConfig;

  private readonly extractionService: TaustePlaywrightExtractionPort;

  private readonly storage: TaustePlaywrightStoragePort;

  private readonly countVisualDatasetSamples: (
    rootDirectory: string,
    runId: string,
  ) => Promise<number>;

  constructor(
    config: TaustePlaywrightStrategyAdapterConfig,
    dependencies: TaustePlaywrightStrategyAdapterDependencies,
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
      leafletsFound: result.units.reduce((total, unit) => total + unit.leaflets.length, 0),
      artifactsDownloaded: stored.sharedPdfsDownloaded,
      artifactsReused: stored.sharedPdfsReused,
      datasetSamplesCreated: samplesCreated,
      units: createExtractionUnits(result, stored),
      failures: result.failedPublications.map((failedPublication) => ({
        targetId: `${input.target.targetId}:publication:${failedPublication.publicationId}`,
        message: failedPublication.errorMessage,
      })),
    };
  }
}

function createExtractionInput(
  config: TaustePlaywrightStrategyAdapterConfig,
  input: PlaywrightExtractionInput,
): ExtractTausteLeafletsInput {
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
  config: TaustePlaywrightStrategyAdapterConfig,
  result: TausteLeafletExtractionResult,
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
  result: TausteLeafletExtractionResult,
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

  if (succeededUnits.length > 0) {
    return succeededUnits;
  }

  return result.failedPublications.map((failedPublication): PlaywrightExtractionUnitOutput => {
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
  result: TausteLeafletExtractionResult,
): PlaywrightExtractionOutput['status'] {
  if (result.failedPublications.length === 0) {
    return 'succeeded';
  }

  return result.units.length > 0 ? 'partially_succeeded' : 'failed';
}
