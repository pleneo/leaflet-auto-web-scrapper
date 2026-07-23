import type {
  SuperDoPovoAddress,
  SuperDoPovoBooklet,
  SuperDoPovoBookletProvider,
  SuperDoPovoShop,
  SuperDoPovoShopCatalogProvider,
} from './superdopovo-api-types';

interface SuperDoPovoAddressResponse {
  readonly zipcode?: string;
  readonly street?: string;
  readonly number?: string;
  readonly neighborhood?: string;
  readonly city?: string;
  readonly state?: string;
}

interface SuperDoPovoShopResponse {
  readonly id?: number;
  readonly name?: string;
  readonly address?: SuperDoPovoAddressResponse;
}

interface SuperDoPovoBookletSheetResponse {
  readonly id?: number;
  readonly booklet_id?: number;
  readonly link?: string;
}

interface SuperDoPovoBookletResponse {
  readonly id?: number;
  readonly name?: string;
  readonly start?: string | null;
  readonly end?: string | null;
  readonly link?: string;
  readonly links?: readonly string[];
  readonly pivot?: {
    readonly shop_id?: number;
  };
  readonly sheets?: readonly SuperDoPovoBookletSheetResponse[];
}

export interface SuperDoPovoApiClientConfig {
  readonly baseUrl: string;
  readonly authTokenProvider: SuperDoPovoAuthTokenProvider;
}

export interface SuperDoPovoAuthTokenProvider {
  getAuthorizationHeader(): Promise<string>;
}

export class SuperDoPovoApiClient
  implements SuperDoPovoShopCatalogProvider, SuperDoPovoBookletProvider
{
  private readonly baseUrl: string;

  private readonly authTokenProvider: SuperDoPovoAuthTokenProvider;

  constructor(config: SuperDoPovoApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.authTokenProvider = config.authTokenProvider;
  }

  async listShops(): Promise<readonly SuperDoPovoShop[]> {
    const response = await this.fetchJsonArray<SuperDoPovoShopResponse>('/shops/addresses');

    return response.map(parseShop);
  }

  async listBooklets(shopId: number): Promise<readonly SuperDoPovoBooklet[]> {
    validatePositiveInteger(shopId, 'shopId');
    const response = await this.fetchJsonArray<SuperDoPovoBookletResponse>(
      `/booklets/${String(shopId)}`,
    );

    return response.map((booklet) => parseBooklet(booklet, shopId));
  }

  private async fetchJsonArray<TResponse>(path: string): Promise<readonly TResponse[]> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: await this.authTokenProvider.getAuthorizationHeader(),
        Origin: 'https://loja.superdopovo.com.br',
        Referer: 'https://loja.superdopovo.com.br/',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Super do Povo request failed: ${String(response.status)} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as readonly TResponse[] | object | null;

    if (!Array.isArray(json)) {
      throw new Error(`Expected Super do Povo response at ${path} to be an array.`);
    }

    return json;
  }
}

function parseShop(response: SuperDoPovoShopResponse): SuperDoPovoShop {
  if (response.id === undefined || response.name === undefined || response.address === undefined) {
    throw new Error('Invalid Super do Povo shop response.');
  }

  return {
    shopId: response.id,
    name: response.name,
    address: parseAddress(response.address),
  };
}

function parseAddress(response: SuperDoPovoAddressResponse): SuperDoPovoAddress {
  return {
    zipcode: response.zipcode ?? '',
    street: response.street ?? '',
    number: response.number ?? '',
    neighborhood: response.neighborhood ?? '',
    city: response.city ?? '',
    state: response.state ?? '',
  };
}

function parseBooklet(
  response: SuperDoPovoBookletResponse,
  fallbackShopId: number,
): SuperDoPovoBooklet {
  if (response.id === undefined || response.name === undefined || response.link === undefined) {
    throw new Error('Invalid Super do Povo booklet response.');
  }

  return {
    bookletId: response.id,
    name: response.name,
    startDateIso: response.start ?? null,
    endDateIso: response.end ?? null,
    coverImageUrl: response.link,
    imageUrls: createBookletImageUrls(response),
    shopId: response.pivot?.shop_id ?? fallbackShopId,
  };
}

function createBookletImageUrls(response: SuperDoPovoBookletResponse): readonly string[] {
  const imageUrls = [
    response.link,
    ...(response.links ?? []),
    ...(response.sheets ?? []).map((sheet) => sheet.link).filter((link) => link !== undefined),
  ].filter((url) => url !== undefined);

  return [...new Set(imageUrls)];
}

function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
}
