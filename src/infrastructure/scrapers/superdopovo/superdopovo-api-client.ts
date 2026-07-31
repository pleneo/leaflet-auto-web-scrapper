import type {
  SuperDoPovoAddress,
  SuperDoPovoBooklet,
  SuperDoPovoBookletProvider,
  SuperDoPovoShop,
  SuperDoPovoShopCatalogProvider,
} from './superdopovo-api-types';

export interface SuperDoPovoAddressResponse {
  readonly zipcode?: string;
  readonly street?: string;
  readonly number?: string;
  readonly neighborhood?: string;
  readonly city?: string;
  readonly state?: string;
}

export interface SuperDoPovoShopResponse {
  readonly id?: number;
  readonly name?: string;
  readonly address?: SuperDoPovoAddressResponse;
}

export interface SuperDoPovoBookletSheetResponse {
  readonly id?: number;
  readonly booklet_id?: number;
  readonly link?: string;
}

export interface SuperDoPovoBookletResponse {
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

    return response.map(parseSuperDoPovoShopResponse);
  }

  async listBooklets(shopId: number): Promise<readonly SuperDoPovoBooklet[]> {
    validatePositiveInteger(shopId, 'shopId');
    const response = await this.fetchJsonArray<SuperDoPovoBookletResponse>(
      `/booklets/${String(shopId)}`,
    );

    return response.map((booklet) => parseSuperDoPovoBookletResponse(booklet, shopId));
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

    const json = (await response.json()) as readonly TResponse[];

    if (Object.prototype.toString.call(json) !== '[object Array]') {
      throw new Error(`Expected Super do Povo response at ${path} to be an array.`);
    }

    return json;
  }
}

export function parseSuperDoPovoShopResponse(response: SuperDoPovoShopResponse): SuperDoPovoShop {
  if (response.id === undefined || response.name === undefined || response.address === undefined) {
    throw new Error('Invalid Super do Povo shop response.');
  }

  return {
    shopId: response.id,
    name: response.name,
    address: parseSuperDoPovoAddressResponse(response.address),
  };
}

export function parseSuperDoPovoAddressResponse(
  response: SuperDoPovoAddressResponse,
): SuperDoPovoAddress {
  return {
    zipcode: response.zipcode ?? '',
    street: response.street ?? '',
    number: response.number ?? '',
    neighborhood: response.neighborhood ?? '',
    city: response.city ?? '',
    state: response.state ?? '',
  };
}

export function parseSuperDoPovoBookletResponse(
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
    imageUrls: createSuperDoPovoBookletImageUrls(response),
    shopId: response.pivot?.shop_id ?? fallbackShopId,
  };
}

export function createSuperDoPovoBookletImageUrls(
  response: SuperDoPovoBookletResponse,
): readonly string[] {
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
