import type { AtacadaoMonitoredStore } from './atacadao-targets';

export interface ExtractedAtacadaoPdfLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly cardIndex: number;
  readonly pdfUrl: string;
  readonly validityText: string | null;
}

export interface AtacadaoExtractedStore {
  readonly store: AtacadaoMonitoredStore;
  readonly sourceUrl: string;
  readonly leaflets: readonly ExtractedAtacadaoPdfLeaflet[];
}

export interface AtacadaoFailedStore {
  readonly store: AtacadaoMonitoredStore;
  readonly sourceUrl: string;
  readonly errorMessage: string;
}
