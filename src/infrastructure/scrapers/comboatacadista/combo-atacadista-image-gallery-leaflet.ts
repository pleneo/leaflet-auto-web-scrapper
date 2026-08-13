export interface ComboAtacadistaLeafletCard {
  readonly leafletId: string;
  readonly title: string;
  readonly href: string;
  readonly sourcePageUrl: string;
  readonly validUntilIso: string | null;
  readonly cardIndex: number;
}

export interface ExtractedComboAtacadistaImageGalleryLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly sourcePageUrl: string;
  readonly coverImageUrl: string;
  readonly imageUrls: readonly string[];
  readonly validUntilIso: string | null;
}

export interface ComboAtacadistaExtractedUnit {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly leaflets: readonly ExtractedComboAtacadistaImageGalleryLeaflet[];
}

export interface ComboAtacadistaFailedUnit {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly errorMessage: string;
}
