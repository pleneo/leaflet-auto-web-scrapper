import type { LeafletFileFormat } from './leaflet-file-format';
import type { LeafletMetadata } from './leaflet-metadata';
import type { SupermarketId } from '../supermarket/supermarket-id';

export interface PromotionLeaflet<TMetadata extends LeafletMetadata = LeafletMetadata> {
  readonly leafletId: string;
  readonly supermarketId: SupermarketId;
  readonly supermarketName: string;
  readonly fileFormat: LeafletFileFormat;
  readonly sourcePageUrl: string;
  readonly artifactUrl: string;
  readonly storageKey: string;
  readonly metadata: TMetadata;
}
