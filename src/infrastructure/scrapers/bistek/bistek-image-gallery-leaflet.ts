export interface BistekCity {
  readonly cityId: string;
  readonly stateCode: string;
  readonly cityName: string;
  readonly displayName: string;
}

export interface BistekStore {
  readonly storeId: string;
  readonly cityId: string;
  readonly storeName: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface BistekMonitoredStore {
  readonly cityId: string;
  readonly stateCode: string;
  readonly cityName: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly storeSlug: string;
}

export interface BistekLeafletCard {
  readonly leafletId: string;
  readonly title: string;
  readonly cardIndex: number;
  readonly fancyboxGroup: string;
  readonly coverImageUrl: string;
  readonly imageUrls: readonly string[];
  readonly validityStartDateIso: string | null;
  readonly validityEndDateIso: string | null;
}

export interface ExtractedBistekImageGalleryLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly sourcePageUrl: string;
  readonly coverImageUrl: string;
  readonly imageUrls: readonly string[];
  readonly validityStartDateIso: string | null;
  readonly validityEndDateIso: string | null;
}

export interface BistekExtractedStore {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly store: BistekMonitoredStore;
  readonly leaflets: readonly ExtractedBistekImageGalleryLeaflet[];
}

export interface BistekFailedStore {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly errorMessage: string;
}
