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
  AngeloniLeafletExtractionResult,
  ExtractAngeloniLeafletsInput,
} from './angeloni-leaflet-extractor';

export interface AngeloniPlaywrightExtractionPort {
  extract(input: ExtractAngeloniLeafletsInput): Promise<AngeloniLeafletExtractionResult>;
}

export interface AngeloniPlaywrightStoragePort {
  store(input: StoreSharedPdfLeafletExtractionInput): Promise<StoredSharedPdfLeafletExtraction>;
}

export interface AngeloniPlaywrightStrategyAdapterConfig {
  readonly extractionInput: Omit<ExtractAngeloniLeafletsInput, 'visualDataset'>;
  readonly outputRootDirectory: string;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export interface AngeloniPlaywrightStrategyAdapterDependencies {
  readonly extractionService: AngeloniPlaywrightExtractionPort;
  readonly storage: AngeloniPlaywrightStoragePort;
  readonly countVisualDatasetSamples: (rootDirectory: string, runId: string) => Promise<number>;
}

export class AngeloniPlaywrightStrategyAdapter implements PlaywrightExtractionStrategy {
  readonly supermarketId: SupermarketId = 'angeloni';

  private readonly config: AngeloniPlaywrightStrategyAdapterConfig;

  private readonly extractionService: AngeloniPlaywrightExtractionPort;

  private readonly storage: AngeloniPlaywrightStoragePort;

  private readonly countVisualDatasetSamples: (
    rootDirectory: string,
    runId: string,
  ) => Promise<number>;

  constructor(
    config: AngeloniPlaywrightStrategyAdapterConfig,
    dependencies: AngeloniPlaywrightStrategyAdapterDependencies,
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
      leafletsFound: result.regions.reduce((total, region) => total + region.leaflets.length, 0),
      artifactsDownloaded: stored.sharedPdfsDownloaded,
      artifactsReused: stored.sharedPdfsReused,
      datasetSamplesCreated: samplesCreated,
      units: createExtractionUnits(result, stored),
      failures: result.failedRegions.map((failedRegion) => ({
        targetId: `${input.target.targetId}:region:${failedRegion.region.regionSlug}`,
        message: failedRegion.errorMessage,
      })),
    };
  }
}

function createExtractionInput(
  config: AngeloniPlaywrightStrategyAdapterConfig,
  input: PlaywrightExtractionInput,
): ExtractAngeloniLeafletsInput {
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
  config: AngeloniPlaywrightStrategyAdapterConfig,
  result: AngeloniLeafletExtractionResult,
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
  result: AngeloniLeafletExtractionResult,
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
  const failedUnits = result.failedRegions.map((failedRegion): PlaywrightExtractionUnitOutput => {
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
  result: AngeloniLeafletExtractionResult,
): PlaywrightExtractionOutput['status'] {
  if (result.failedRegions.length === 0) {
    return 'succeeded';
  }

  return result.regions.length > 0 ? 'partially_succeeded' : 'failed';
}
