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

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

interface MixMateusApiEnvelopeResponse {
  readonly status: string;
  readonly data: readonly JsonObject[];
  readonly count: number | null;
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
    this.baseUrl = parseBaseUrl(config.baseUrl, 'baseUrl');
    this.fetcher = config.fetcher ?? fetch;
  }

  async listStates(): Promise<readonly MixMateusApiState[]> {
    return this.fetchProxyEndpoint('/estados', parseStateResponse);
  }

  async listCities(stateCode: string): Promise<readonly MixMateusApiCity[]> {
    validateNonBlank(stateCode, 'stateCode');
    return this.fetchProxyEndpoint(
      `/estados/${encodeEndpointPathSegment(stateCode.trim().toLowerCase())}/cidades`,
      parseCityResponse,
    );
  }

  async listStores(citySlug: string): Promise<readonly MixMateusApiStore[]> {
    validateNonBlank(citySlug, 'citySlug');
    return this.fetchProxyEndpoint(
      `/cidades/${encodeEndpointPathSegment(citySlug.trim())}/lojas`,
      parseStoreResponse,
    );
  }

  async listLeaflets(query: MixMateusLeafletQuery): Promise<readonly MixMateusApiLeaflet[]> {
    validateLeafletQuery(query);
    return this.fetchProxyEndpoint(
      `/encartes/${encodeEndpointPathSegment(query.stateCode.trim().toLowerCase())}/${encodeEndpointPathSegment(query.citySlug.trim())}/${encodeEndpointPathSegment(query.storeSlug.trim())}?marca=${encodeEndpointQueryValue(query.brandCode.trim())}`,
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
    parseResponse: (response: JsonObject) => TParsed,
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
  const parsed = JSON.parse(text) as JsonValue;

  if (!isJsonObject(parsed) || typeof parsed['status'] !== 'string') {
    throw new Error('Invalid Mix Mateus API response envelope.');
  }

  const data = parsed['data'];

  if (!isJsonArray(data) || !data.every(isJsonObject)) {
    throw new Error('Invalid Mix Mateus API response envelope.');
  }

  const count = parsed['count'];

  if (count !== undefined && count !== null && typeof count !== 'number') {
    throw new Error('Invalid Mix Mateus API response envelope.');
  }

  return {
    status: parsed['status'],
    data,
    count: count ?? null,
  };
}

export function parseStateResponse(response: JsonObject): MixMateusApiState {
  const stateCode = readRequiredString(response, 'sigla', 'Invalid Mix Mateus state response.');
  const name = readRequiredString(response, 'descricao', 'Invalid Mix Mateus state response.');

  return {
    stateCode: stateCode.toUpperCase(),
    name,
  };
}

export function parseCityResponse(response: JsonObject): MixMateusApiCity {
  const citySlug = readRequiredString(response, 'idcidade', 'Invalid Mix Mateus city response.');
  const stateCode = readRequiredString(response, 'estado', 'Invalid Mix Mateus city response.');
  const name = readRequiredString(response, 'descricao', 'Invalid Mix Mateus city response.');

  return {
    citySlug,
    stateCode: stateCode.toUpperCase(),
    name,
  };
}

export function parseStoreResponse(response: JsonObject): MixMateusApiStore {
  const storeSlug = readRequiredString(response, 'idloja', 'Invalid Mix Mateus store response.');
  const citySlug = readRequiredString(response, 'cidade', 'Invalid Mix Mateus store response.');
  const displayName = readRequiredString(
    response,
    'nome_exibicao',
    'Invalid Mix Mateus store response.',
  );
  const brandCode = readRequiredString(response, 'marca', 'Invalid Mix Mateus store response.');

  return {
    storeSlug,
    citySlug,
    displayName,
    address: readOptionalString(response, 'endereco', 'Invalid Mix Mateus store response.'),
    mapReference: readOptionalString(response, 'mapa', 'Invalid Mix Mateus store response.'),
    brandCode,
  };
}

export function parseLeafletResponse(response: JsonObject): MixMateusApiLeaflet {
  const leafletId = readRequiredNumber(
    response,
    'id_encarte',
    'Invalid Mix Mateus leaflet response.',
  );
  const title = readRequiredString(response, 'descricao', 'Invalid Mix Mateus leaflet response.');
  const filePath = readRequiredString(response, 'arquivo', 'Invalid Mix Mateus leaflet response.');
  const brandCode = readRequiredString(response, 'marca', 'Invalid Mix Mateus leaflet response.');
  const validUntilIso = readRequiredString(
    response,
    'validade',
    'Invalid Mix Mateus leaflet response.',
  );
  const validUntilText = readRequiredString(
    response,
    'valido',
    'Invalid Mix Mateus leaflet response.',
  );
  const startsAtIso = readRequiredString(
    response,
    'inicio',
    'Invalid Mix Mateus leaflet response.',
  );
  const startsAtText = readRequiredString(
    response,
    'inicial',
    'Invalid Mix Mateus leaflet response.',
  );

  return {
    leafletId,
    title,
    filePath,
    brandCode,
    validUntilIso,
    validUntilText,
    startsAtIso,
    startsAtText,
  };
}

function validateLeafletQuery(query: MixMateusLeafletQuery): void {
  validateNonBlank(query.stateCode, 'stateCode');
  validateNonBlank(query.citySlug, 'citySlug');
  validateNonBlank(query.storeSlug, 'storeSlug');
  validateNonBlank(query.brandCode, 'brandCode');
}

function parseBaseUrl(value: string, fieldName: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${fieldName} must be absolute and valid.`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(
      `${fieldName} must be an absolute http(s) URL without credentials, query, or fragment.`,
    );
  }

  return url.toString().replace(/\/+$/, '');
}

function validateNonBlank(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be blank.`);
  }
}

function encodeEndpointPathSegment(value: string): string {
  return encodeURIComponent(value);
}

function encodeEndpointQueryValue(value: string): string {
  return encodeURIComponent(value);
}

function readRequiredString(response: JsonObject, fieldName: string, errorMessage: string): string {
  const value = response[fieldName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(errorMessage);
  }

  return value.trim();
}

function readOptionalString(response: JsonObject, fieldName: string, errorMessage: string): string {
  const value = response[fieldName];

  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value !== 'string') {
    throw new Error(errorMessage);
  }

  return value.trim();
}

function readRequiredNumber(response: JsonObject, fieldName: string, errorMessage: string): number {
  const value = response[fieldName];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(errorMessage);
  }

  return value;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}
