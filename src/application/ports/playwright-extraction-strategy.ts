import type { VisualDatasetCapturePolicy } from '../../domain/dataset/visual-dataset-capture-policy';
import type { ExtractionTarget } from '../../domain/extraction/extraction-target';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import type { Logger } from './logger';

export interface PlaywrightExtractionInput {
  readonly runId: string;
  readonly target: ExtractionTarget;
  readonly startedAtIso: string;
  readonly visualDatasetCapturePolicy: VisualDatasetCapturePolicy;
  readonly logger: Logger;
}

export interface PlaywrightExtractionOutput {
  readonly runId: string;
  readonly targetId: string;
  readonly supermarketId: SupermarketId;
  readonly status: 'succeeded' | 'partially_succeeded' | 'failed';
  readonly leafletsFound: number;
  readonly artifactsDownloaded: number;
  readonly artifactsReused: number;
  readonly datasetSamplesCreated: number;
  readonly failures: readonly PlaywrightExtractionFailure[];
}

export interface PlaywrightExtractionFailure {
  readonly targetId: string;
  readonly message: string;
}

export interface PlaywrightExtractionStrategy {
  readonly supermarketId: SupermarketId;
  execute(input: PlaywrightExtractionInput): Promise<PlaywrightExtractionOutput>;
}
