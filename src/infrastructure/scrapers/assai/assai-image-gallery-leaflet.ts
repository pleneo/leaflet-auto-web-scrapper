import type { AssaiMonitoredStore } from './assai-targets';

export interface ExtractedAssaiImageGalleryLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly coverImageUrl: string;
  readonly imageUrls: readonly string[];
  readonly startDateIso: string | null;
  readonly endDateIso: string | null;
}

export interface AssaiExtractedStore {
  readonly store: AssaiMonitoredStore;
  readonly sourceUrl: string;
  readonly leaflets: readonly ExtractedAssaiImageGalleryLeaflet[];
}

export interface AssaiFailedStore {
  readonly store: AssaiMonitoredStore;
  readonly sourceUrl: string;
  readonly errorMessage: string;
}
