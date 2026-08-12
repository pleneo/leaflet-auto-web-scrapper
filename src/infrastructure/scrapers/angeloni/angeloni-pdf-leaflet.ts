import type { AngeloniMonitoredRegion } from './angeloni-targets';

export interface ExtractedAngeloniPdfLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly cardIndex: number;
  readonly pdfUrl: string;
}

export interface AngeloniExtractedRegion {
  readonly region: AngeloniMonitoredRegion;
  readonly sourceUrl: string;
  readonly leaflets: readonly ExtractedAngeloniPdfLeaflet[];
}

export interface AngeloniFailedRegion {
  readonly region: AngeloniMonitoredRegion;
  readonly sourceUrl: string;
  readonly errorMessage: string;
}
