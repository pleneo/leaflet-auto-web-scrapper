import type {
  MixMateusApiCity,
  MixMateusApiLeaflet,
  MixMateusApiState,
  MixMateusApiStore,
  MixMateusCityCatalogProvider,
  MixMateusLeafletProvider,
  MixMateusLeafletQuery,
  MixMateusStateCatalogProvider,
  MixMateusStoreCatalogProvider,
} from './mixmateus-api-types';

type MixMateusApiResourceField = string | number | null | undefined;

type MixMateusApiResourceResponse = Readonly<Record<string, MixMateusApiResourceField>>;

interface MixMateusApiEnvelopeResponse {
  readonly status?: string;
  readonly data?: readonly MixMateusApiResourceResponse[];
  readonly count?: number;
}

interface MixMateusStateResponse {
  readonly sigla?: string;
  readonly descricao?: string;
}

interface MixMateusCityResponse {
  readonly idcidade?: string;
  readonly estado?: string;
  readonly descricao?: string;
}

interface MixMateusStoreResponse {
  readonly idloja?: string;
  readonly cidade?: string;
  readonly nome_exibicao?: string;
  readonly endereco?: string;
  readonly mapa?: string;
  readonly marca?: string;
}

interface MixMateusLeafletResponse {
  readonly id_encarte?: number;
  readonly descricao?: string;
  readonly arquivo?: string;
  readonly marca?: string;
  readonly validade?: string;
  readonly valido?: string;
  readonly inicio?: string;
  readonly inicial?: string;
}

export interface MixMateusApiClientConfig {
  readonly baseUrl: string;
  readonly fetcher?: typeof fetch;
}

export class MixMateusApiClient
  implements
    MixMateusStateCatalogProvider,
    MixMateusCityCatalogProvider,
    MixMateusStoreCatalogProvider,
    MixMateusLeafletProvider
{
  private readonly baseUrl: string;

  private readonly fetcher: typeof fetch;

  constructor(config: MixMateusApiClientConfig) {
    validateAbsoluteUrl(config.baseUrl, 'baseUrl');

    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.fetcher = config.fetcher ?? fetch;
  }

  async listStates(): Promise<readonly MixMateusApiState[]> {
    return this.fetchProxyEndpoint('/estados', parseStateResponse);
  }

  async listCities(stateCode: string): Promise<readonly MixMateusApiCity[]> {
    validateNonBlank(stateCode, 'stateCode');
    return this.fetchProxyEndpoint(
      `/estados/${stateCode.trim().toLowerCase()}/cidades`,
      parseCityResponse,
    );
  }

  async listStores(citySlug: string): Promise<readonly MixMateusApiStore[]> {
    validateNonBlank(citySlug, 'citySlug');
    return this.fetchProxyEndpoint(`/cidades/${citySlug.trim()}/lojas`, parseStoreResponse);
  }

  async listLeaflets(query: MixMateusLeafletQuery): Promise<readonly MixMateusApiLeaflet[]> {
    validateLeafletQuery(query);
    return this.fetchProxyEndpoint(
      `/encartes/${query.stateCode.trim().toLowerCase()}/${query.citySlug.trim()}/${query.storeSlug.trim()}?marca=${query.brandCode.trim()}`,
      parseLeafletResponse,
    );
  }

  buildPdfUrl(filePath: string): string {
    validateNonBlank(filePath, 'filePath');
    const url = new URL(`${this.baseUrl}/api-proxy.php`);

    url.searchParams.set('file', filePath.trim());

    return url.toString();
  }

  private async fetchProxyEndpoint<TParsed>(
    endpoint: string,
    parseResponse: (response: MixMateusApiResourceResponse) => TParsed,
  ): Promise<readonly TParsed[]> {
    const url = new URL(`${this.baseUrl}/api-proxy.php`);

    url.searchParams.set('endpoint', endpoint);

    const response = await this.fetcher(url, {
      headers: {
        Accept: 'application/json',
        Referer: `${this.baseUrl}/`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Mix Mateus API request failed: ${String(response.status)} ${response.statusText}`,
      );
    }

    const json = parseApiEnvelope(await response.text());

    if (json.status !== 'success' || !Array.isArray(json.data)) {
      throw new Error(`Invalid Mix Mateus API response for endpoint ${endpoint}.`);
    }

    return json.data.map(parseResponse);
  }
}

function parseApiEnvelope(text: string): MixMateusApiEnvelopeResponse {
  const parsed = JSON.parse(text) as MixMateusApiEnvelopeResponse;

  return parsed;
}

export function parseStateResponse(response: MixMateusStateResponse): MixMateusApiState {
  if (response.sigla === undefined || response.descricao === undefined) {
    throw new Error('Invalid Mix Mateus state response.');
  }

  return {
    stateCode: response.sigla.trim().toUpperCase(),
    name: response.descricao.trim(),
  };
}

export function parseCityResponse(response: MixMateusCityResponse): MixMateusApiCity {
  if (
    response.idcidade === undefined ||
    response.estado === undefined ||
    response.descricao === undefined
  ) {
    throw new Error('Invalid Mix Mateus city response.');
  }

  return {
    citySlug: response.idcidade.trim(),
    stateCode: response.estado.trim().toUpperCase(),
    name: response.descricao.trim(),
  };
}

export function parseStoreResponse(response: MixMateusStoreResponse): MixMateusApiStore {
  if (
    response.idloja === undefined ||
    response.cidade === undefined ||
    response.nome_exibicao === undefined ||
    response.marca === undefined
  ) {
    throw new Error('Invalid Mix Mateus store response.');
  }

  return {
    storeSlug: response.idloja.trim(),
    citySlug: response.cidade.trim(),
    displayName: response.nome_exibicao.trim(),
    address: response.endereco?.trim() ?? '',
    mapReference: response.mapa?.trim() ?? '',
    brandCode: response.marca.trim(),
  };
}

export function parseLeafletResponse(response: MixMateusLeafletResponse): MixMateusApiLeaflet {
  if (
    response.id_encarte === undefined ||
    response.descricao === undefined ||
    response.arquivo === undefined ||
    response.marca === undefined ||
    response.validade === undefined ||
    response.valido === undefined ||
    response.inicio === undefined ||
    response.inicial === undefined
  ) {
    throw new Error('Invalid Mix Mateus leaflet response.');
  }

  return {
    leafletId: response.id_encarte,
    title: response.descricao.trim(),
    filePath: response.arquivo.trim(),
    brandCode: response.marca.trim(),
    validUntilIso: response.validade.trim(),
    validUntilText: response.valido.trim(),
    startsAtIso: response.inicio.trim(),
    startsAtText: response.inicial.trim(),
  };
}

function validateLeafletQuery(query: MixMateusLeafletQuery): void {
  validateNonBlank(query.stateCode, 'stateCode');
  validateNonBlank(query.citySlug, 'citySlug');
  validateNonBlank(query.storeSlug, 'storeSlug');
  validateNonBlank(query.brandCode, 'brandCode');
}

function validateAbsoluteUrl(value: string, fieldName: string): void {
  try {
    new URL(value);
  } catch {
    throw new Error(`${fieldName} must be absolute and valid.`);
  }
}

function validateNonBlank(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be blank.`);
  }
}
