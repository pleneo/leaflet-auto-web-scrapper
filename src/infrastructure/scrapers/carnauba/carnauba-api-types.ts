export interface CarnaubaStore {
  readonly storeId: number;
  readonly name: string;
  readonly cnpj: string;
  readonly corporateName: string;
}

export interface CarnaubaStoreSnapshot {
  readonly brandId: number;
  readonly fetchedAtIso: string;
  readonly stores: readonly CarnaubaStore[];
}

export interface CarnaubaFlipbookImage {
  readonly order: number;
  readonly imageUrl: string;
}

export interface CarnaubaFlipbook {
  readonly flipbookId: number;
  readonly name: string;
  readonly images: readonly CarnaubaFlipbookImage[];
}

export interface CarnaubaStoreCatalogProvider {
  listStores(): Promise<readonly CarnaubaStore[]>;
}

export interface CarnaubaFlipbookProvider {
  listFlipbooks(storeId: number): Promise<readonly CarnaubaFlipbook[]>;
}
