export interface MixMateusApiState {
  readonly stateCode: string;
  readonly name: string;
}

export interface MixMateusApiCity {
  readonly citySlug: string;
  readonly stateCode: string;
  readonly name: string;
}

export interface MixMateusApiStore {
  readonly storeSlug: string;
  readonly citySlug: string;
  readonly displayName: string;
  readonly address: string;
  readonly mapReference: string;
  readonly brandCode: string;
}

export interface MixMateusApiLeaflet {
  readonly leafletId: number;
  readonly title: string;
  readonly filePath: string;
  readonly brandCode: string;
  readonly validUntilIso: string;
  readonly validUntilText: string;
  readonly startsAtIso: string;
  readonly startsAtText: string;
}

export interface MixMateusLeafletQuery {
  readonly stateCode: string;
  readonly citySlug: string;
  readonly storeSlug: string;
  readonly brandCode: string;
}

export interface MixMateusStateCatalogProvider {
  listStates(): Promise<readonly MixMateusApiState[]>;
}

export interface MixMateusCityCatalogProvider {
  listCities(stateCode: string): Promise<readonly MixMateusApiCity[]>;
}

export interface MixMateusStoreCatalogProvider {
  listStores(citySlug: string): Promise<readonly MixMateusApiStore[]>;
}

export interface MixMateusLeafletProvider {
  listLeaflets(query: MixMateusLeafletQuery): Promise<readonly MixMateusApiLeaflet[]>;
  buildPdfUrl(filePath: string): string;
}
