export interface AngeloniApiLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly pdfUrl: string;
  readonly sourcePageUrl: string;
}

export interface AngeloniRegionLeafletQuery {
  readonly regionUrl: string;
}

export interface AngeloniRegionLeafletProvider {
  listRegionLeaflets(query: AngeloniRegionLeafletQuery): Promise<readonly AngeloniApiLeaflet[]>;
}
