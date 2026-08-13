import type { TaustePublication } from './tauste-pdf-leaflet';
import {
  TAUSTE_FLIPSNACK_ACCOUNT_ID,
  TAUSTE_FLIPSNACK_API_BASE_URL,
  TAUSTE_FLIPSNACK_PROFILE_URL,
  normalizeTaustePublicationUrl,
} from './tauste-targets';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

export interface TaustePublicationDiscoveryProvider {
  listPublications(input: TaustePublicationDiscoveryInput): Promise<readonly TaustePublication[]>;
}

export interface TaustePublicationPageFetcher {
  fetchHtml(url: string): Promise<string>;
}

export interface TaustePublicationDiscoveryInput {
  readonly page: number;
  readonly accountId: string;
  readonly profileUrl: string;
  readonly excludeId: number;
  readonly folderHash: string;
  readonly searchAfter: string;
  readonly searchKey: string;
}

export interface TausteApiClientConfig {
  readonly apiBaseUrl?: string;
  readonly fetcher?: typeof fetch;
}

export interface TausteFlipsnackRelatedPublication {
  readonly coverImgSrc: string | null;
  readonly hidePublishDate: boolean;
  readonly datePublished: string | null;
  readonly screenname: string | null;
  readonly profileUrl: string | null;
  readonly name: string;
  readonly directLink: string;
}

export class TausteApiClient implements TaustePublicationDiscoveryProvider {
  private readonly apiBaseUrl: string;

  private readonly fetcher: typeof fetch;

  constructor(config: TausteApiClientConfig = {}) {
    this.apiBaseUrl = parseBaseUrl(
      config.apiBaseUrl ?? TAUSTE_FLIPSNACK_API_BASE_URL,
      'apiBaseUrl',
    );
    this.fetcher = config.fetcher ?? fetch;
  }

  async listPublications(
    input: TaustePublicationDiscoveryInput,
  ): Promise<readonly TaustePublication[]> {
    validateDiscoveryInput(input);
    const url = this.createRelatedPublicationsUrl(input);
    const response = await this.fetcher(url, {
      headers: {
        Accept: 'application/json',
        Referer: input.profileUrl,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Tauste Flipsnack API request failed: ${String(response.status)} ${response.statusText}`,
      );
    }

    return parseTausteRelatedPublications(await response.text(), input.profileUrl);
  }

  async fetchHtml(url: string): Promise<string> {
    const targetUrl = parseSameOriginUrl(url, TAUSTE_FLIPSNACK_PROFILE_URL, 'url');
    const response = await this.fetcher(targetUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        Referer: TAUSTE_FLIPSNACK_PROFILE_URL,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Tauste Flipsnack page request failed: ${String(response.status)} ${response.statusText}`,
      );
    }

    return response.text();
  }

  private createRelatedPublicationsUrl(input: TaustePublicationDiscoveryInput): URL {
    const url = new URL(`${this.apiBaseUrl}/publications/related`);

    url.searchParams.set('p', String(input.page));
    url.searchParams.set('accountId', input.accountId);
    url.searchParams.set('excludeId', String(input.excludeId));
    url.searchParams.set('userUrl', input.profileUrl);
    url.searchParams.set('folderHash', input.folderHash);
    url.searchParams.set('searchAfter', input.searchAfter);
    url.searchParams.set('searchKey', input.searchKey);

    return url;
  }
}

export function createDefaultTaustePublicationDiscoveryInput(): TaustePublicationDiscoveryInput {
  return {
    page: 1,
    accountId: TAUSTE_FLIPSNACK_ACCOUNT_ID,
    profileUrl: TAUSTE_FLIPSNACK_PROFILE_URL,
    excludeId: 0,
    folderHash: '',
    searchAfter: '0',
    searchKey: '',
  };
}

export function parseTausteRelatedPublications(
  text: string,
  profileUrl: string,
): readonly TaustePublication[] {
  validateNonBlank(profileUrl, 'profileUrl');
  const parsed = JSON.parse(text) as JsonValue;

  if (!isJsonArray(parsed)) {
    throw new Error('Invalid Tauste Flipsnack related publications response.');
  }

  return parsed.map((value, index) => {
    if (!isJsonObject(value)) {
      throw new Error('Invalid Tauste Flipsnack related publication.');
    }

    return createPublication(parseRelatedPublication(value), profileUrl, index);
  });
}

export function filterTausteOfferPublications(
  publications: readonly TaustePublication[],
): readonly TaustePublication[] {
  return publications.filter((publication) => isTausteOfferPublication(publication.title));
}

export function createTaustePublicationId(directLink: string, index: number): string {
  const slug = directLink
    .trim()
    .replace(/\.html$/i, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length > 0) {
    return `tauste:${slug}`;
  }

  return `tauste:publication-${String(index + 1)}`;
}

function createPublication(
  relatedPublication: TausteFlipsnackRelatedPublication,
  profileUrl: string,
  index: number,
): TaustePublication {
  const publicationUrl = new URL(relatedPublication.directLink, profileUrl).toString();

  return {
    publicationId: createTaustePublicationId(relatedPublication.directLink, index),
    title: relatedPublication.name,
    directLink: relatedPublication.directLink,
    publicationUrl,
    coverImageUrl: relatedPublication.coverImgSrc,
    publishedAtIso: parseFlipsnackPublishedAtIso(relatedPublication.datePublished),
  };
}

function parseRelatedPublication(response: JsonObject): TausteFlipsnackRelatedPublication {
  return {
    coverImgSrc: readOptionalString(
      response,
      'coverImgSrc',
      'Invalid Tauste Flipsnack related publication.',
    ),
    hidePublishDate: readRequiredBoolean(
      response,
      'hidePublishDate',
      'Invalid Tauste Flipsnack related publication.',
    ),
    datePublished: readOptionalString(
      response,
      'datePublished',
      'Invalid Tauste Flipsnack related publication.',
    ),
    screenname: readOptionalString(
      response,
      'screenname',
      'Invalid Tauste Flipsnack related publication.',
    ),
    profileUrl: readOptionalString(
      response,
      'profileUrl',
      'Invalid Tauste Flipsnack related publication.',
    ),
    name: readRequiredString(response, 'name', 'Invalid Tauste Flipsnack related publication.'),
    directLink: readRequiredString(
      response,
      'directLink',
      'Invalid Tauste Flipsnack related publication.',
    ),
  };
}

function parseFlipsnackPublishedAtIso(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim().replace(' ', 'T');

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    throw new Error(`Invalid Tauste Flipsnack publication date: ${value}`);
  }

  return `${normalized}.000Z`;
}

function isTausteOfferPublication(title: string): boolean {
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return normalized.startsWith('ofertas tauste') || normalized.startsWith('especial festival');
}

function validateDiscoveryInput(input: TaustePublicationDiscoveryInput): void {
  if (!Number.isInteger(input.page) || input.page <= 0) {
    throw new Error('page must be a positive integer.');
  }

  if (!Number.isInteger(input.excludeId) || input.excludeId < 0) {
    throw new Error('excludeId must be a non-negative integer.');
  }

  validateNonBlank(input.accountId, 'accountId');
  validateNonBlank(input.profileUrl, 'profileUrl');
  normalizeTaustePublicationUrl(input.profileUrl);
}

function parseBaseUrl(value: string, fieldName: string): string {
  validateNonBlank(value, fieldName);
  const url = new URL(value);

  if (url.protocol !== 'https:') {
    throw new Error(`${fieldName} must use https.`);
  }

  return url.toString().replace(/\/+$/, '');
}

function parseSameOriginUrl(value: string, baseUrl: string, fieldName: string): URL {
  validateNonBlank(value, fieldName);
  const base = new URL(baseUrl);
  const url = new URL(value, base);

  if (url.origin !== base.origin) {
    throw new Error(`${fieldName} must belong to the configured Tauste Flipsnack origin.`);
  }

  return url;
}

function validateNonBlank(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be blank.`);
  }
}

function readRequiredString(response: JsonObject, fieldName: string, errorMessage: string): string {
  const value = response[fieldName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(errorMessage);
  }

  return value.trim();
}

function readOptionalString(
  response: JsonObject,
  fieldName: string,
  errorMessage: string,
): string | null {
  const value = response[fieldName];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(errorMessage);
  }

  return value.trim();
}

function readRequiredBoolean(
  response: JsonObject,
  fieldName: string,
  errorMessage: string,
): boolean {
  const value = response[fieldName];

  if (typeof value !== 'boolean') {
    throw new Error(errorMessage);
  }

  return value;
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
