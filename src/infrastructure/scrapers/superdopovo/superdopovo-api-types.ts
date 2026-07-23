export interface SuperDoPovoAddress {
  readonly zipcode: string;
  readonly street: string;
  readonly number: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
}

export interface SuperDoPovoShop {
  readonly shopId: number;
  readonly name: string;
  readonly address: SuperDoPovoAddress;
}

export interface SuperDoPovoBookletSheet {
  readonly sheetId: number;
  readonly bookletId: number;
  readonly imageUrl: string;
}

export interface SuperDoPovoBooklet {
  readonly bookletId: number;
  readonly name: string;
  readonly startDateIso: string | null;
  readonly endDateIso: string | null;
  readonly coverImageUrl: string;
  readonly imageUrls: readonly string[];
  readonly shopId: number;
}

export interface SuperDoPovoShopCatalogProvider {
  listShops(): Promise<readonly SuperDoPovoShop[]>;
}

export interface SuperDoPovoBookletProvider {
  listBooklets(shopId: number): Promise<readonly SuperDoPovoBooklet[]>;
}
