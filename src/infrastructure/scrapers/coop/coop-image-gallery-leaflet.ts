export interface CoopLeafletCard {
  readonly leafletId: string;
  readonly title: string;
  readonly href: string;
  readonly sourcePageUrl: string;
  readonly validUntilIso: string | null;
  readonly cardIndex: number;
}

export interface ExtractedCoopImageGalleryLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly sourcePageUrl: string;
  readonly coverImageUrl: string;
  readonly imageUrls: readonly string[];
  readonly validUntilIso: string | null;
}

export interface CoopExtractedUnit {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly leaflets: readonly ExtractedCoopImageGalleryLeaflet[];
}

export interface CoopFailedUnit {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly errorMessage: string;
}
