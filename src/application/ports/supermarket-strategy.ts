import type { AcademicDatasetSample } from '../../domain/dataset/academic-dataset-sample';
import type { LeafletMetadata } from '../../domain/leaflet/leaflet-metadata';
import type { PromotionLeaflet } from '../../domain/leaflet/promotion-leaflet';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import type { Logger } from './logger';

export interface StrategyExecutionContext {
  readonly runId: string;
  readonly startedAtIso: string;
  readonly logger: Logger;
}

export interface StrategyExtractionOutput<TMetadata extends LeafletMetadata = LeafletMetadata> {
  readonly leaflet: PromotionLeaflet<TMetadata>;
  readonly datasetSamples: readonly AcademicDatasetSample[];
}

export interface SupermarketStrategy<TMetadata extends LeafletMetadata = LeafletMetadata> {
  readonly supermarketId: SupermarketId;
  readonly supermarketName: string;
  readonly anchorUrl: string;
  execute(context: StrategyExecutionContext): Promise<StrategyExtractionOutput<TMetadata>>;
}
