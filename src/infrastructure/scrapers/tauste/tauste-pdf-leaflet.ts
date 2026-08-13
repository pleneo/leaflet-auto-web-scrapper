export interface TaustePublication {
  readonly publicationId: string;
  readonly title: string;
  readonly directLink: string;
  readonly publicationUrl: string;
  readonly coverImageUrl: string | null;
  readonly publishedAtIso: string | null;
}

export interface ExtractedTaustePdfLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly publicationUrl: string;
  readonly coverImageUrl: string | null;
  readonly publishedAtIso: string | null;
  readonly pdfUrl: string;
}

export interface TausteExtractedUnit {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly leaflets: readonly ExtractedTaustePdfLeaflet[];
}

export interface TausteFailedPublication {
  readonly publicationId: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly errorMessage: string;
}
