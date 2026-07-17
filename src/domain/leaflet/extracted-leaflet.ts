import type { SupermarketId } from '../supermarket/supermarket-id';

export interface ExtractedLeafletImage {
  readonly order: number;
  readonly imageUrl: string;
}

export interface ExtractedLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly cardIndex: number;
  readonly coverImageUrl: string;
  readonly images: readonly ExtractedLeafletImage[];
}

export interface LeafletExtractionResult {
  readonly supermarketId: SupermarketId;
  readonly sourceUrl: string;
  readonly extractedAtIso: string;
  readonly leaflets: readonly ExtractedLeaflet[];
}
