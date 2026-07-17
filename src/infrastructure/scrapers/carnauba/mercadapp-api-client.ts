import type {
  CarnaubaFlipbook,
  CarnaubaFlipbookImage,
  CarnaubaFlipbookProvider,
  CarnaubaStore,
  CarnaubaStoreCatalogProvider,
} from './carnauba-api-types';

interface MercadappMarketResponse {
  readonly id: number;
  readonly name: string;
  readonly cnpj?: string;
  readonly corporate_name?: string;
}

interface MercadappFlipbookResponse {
  readonly id: number;
  readonly name: string;
  readonly images_urls: readonly string[];
}

interface MercadappFlipbooksResponse {
  readonly flipbooks: readonly MercadappFlipbookResponse[];
}

export interface MercadappCarnaubaApiClientConfig {
  readonly baseUrl: string;
  readonly brandId: number;
  readonly authTokenProvider?: MercadappAuthTokenProvider;
}

export interface MercadappAuthTokenProvider {
  getAuthorizationHeader(): Promise<string>;
}

export class MercadappCarnaubaApiClient
  implements CarnaubaStoreCatalogProvider, CarnaubaFlipbookProvider
{
  private readonly baseUrl: string;

  private readonly brandId: number;

  private readonly authTokenProvider: MercadappAuthTokenProvider | undefined;

  constructor(config: MercadappCarnaubaApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.brandId = config.brandId;
    this.authTokenProvider = config.authTokenProvider;
  }

  async listStores(): Promise<readonly CarnaubaStore[]> {
    const response = await this.fetchJsonArray<MercadappMarketResponse>(
      `/markets?brand_id=${String(this.brandId)}`,
    );

    return response.map((store) => ({
      storeId: store.id,
      name: store.name,
      cnpj: store.cnpj ?? '',
      corporateName: store.corporate_name ?? '',
    }));
  }

  async listFlipbooks(storeId: number): Promise<readonly CarnaubaFlipbook[]> {
    const response = await this.fetchJsonObject<MercadappFlipbooksResponse>(
      `/markets/${String(storeId)}/flipbooks`,
    );

    return response.flipbooks.map((flipbook) => ({
      flipbookId: flipbook.id,
      name: flipbook.name,
      images: flipbook.images_urls.map((imageUrl, index): CarnaubaFlipbookImage => {
        return {
          order: index + 1,
          imageUrl,
        };
      }),
    }));
  }

  private async fetchJsonArray<TResponse>(path: string): Promise<readonly TResponse[]> {
    const response = await this.fetchJson(path);

    if (!Array.isArray(response)) {
      throw new Error(`Expected Mercadapp response at ${path} to be an array.`);
    }

    return response as TResponse[];
  }

  private async fetchJsonObject<TResponse>(path: string): Promise<TResponse> {
    const response = await this.fetchJson(path);

    if (Array.isArray(response) || typeof response !== 'object') {
      throw new Error(`Expected Mercadapp response at ${path} to be an object.`);
    }

    return response as TResponse;
  }

  private async fetchJson(path: string): Promise<object | readonly object[]> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        ...(await this.getAuthorizationHeaders()),
        Origin: 'https://carnaubasupermercados.com.br',
        Referer: 'https://carnaubasupermercados.com.br/',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Mercadapp request failed: ${String(response.status)} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as object | readonly object[] | null;

    if (Array.isArray(json)) {
      return json as readonly object[];
    }

    if (json !== null && typeof json === 'object') {
      return json;
    }

    throw new Error('Mercadapp response must be a JSON object or array.');
  }

  private async getAuthorizationHeaders(): Promise<Readonly<Record<string, string>>> {
    if (this.authTokenProvider === undefined) {
      return {};
    }

    return {
      Authorization: await this.authTokenProvider.getAuthorizationHeader(),
    };
  }
}
