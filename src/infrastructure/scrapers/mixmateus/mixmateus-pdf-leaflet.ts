import type { MixMateusMonitoredStore } from './mixmateus-targets';

export interface ExtractedMixMateusPdfLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly cardIndex: number;
  readonly pdfUrl: string;
}

export interface MixMateusExtractedStore {
  readonly store: MixMateusMonitoredStore;
  readonly sourceUrl: string;
  readonly leaflets: readonly ExtractedMixMateusPdfLeaflet[];
}

export interface MixMateusFailedStore {
  readonly store: MixMateusMonitoredStore;
  readonly sourceUrl: string;
  readonly errorMessage: string;
}
