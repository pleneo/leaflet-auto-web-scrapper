import type { LeafletImageContentType } from '../../storage/leaflet-image-storage';

export interface TaustePublication {
  readonly publicationId: string;
  readonly title: string;
  readonly directLink: string;
  readonly publicationUrl: string;
  readonly coverImageUrl: string | null;
  readonly publishedAtIso: string | null;
  readonly sourceCardIndex?: number;
}

export interface ExtractedTaustePdfLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly publicationUrl: string;
  readonly coverImageUrl: string | null;
  readonly publishedAtIso: string | null;
  readonly pdfUrl: string;
}

export interface ExtractedTausteImageGalleryLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly publicationUrl: string;
  readonly coverImageUrl: string;
  readonly publishedAtIso: string | null;
  readonly imageUrls: readonly string[];
  readonly downloadedImages: readonly DownloadedTausteImageGalleryImage[];
}

export interface DownloadedTausteImageGalleryImage {
  readonly sourceUrl: string;
  readonly body: Uint8Array;
  readonly contentType: LeafletImageContentType;
}

export interface TausteExtractedUnit {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly leaflets: readonly ExtractedTaustePdfLeaflet[];
}

export interface TausteImageGalleryExtractedUnit {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly leaflets: readonly ExtractedTausteImageGalleryLeaflet[];
}

export interface TausteFailedPublication {
  readonly publicationId: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly errorMessage: string;
}
