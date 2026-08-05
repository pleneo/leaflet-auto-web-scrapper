import type { AssaiMonitoredStore } from './assai-targets';

export interface AssaiCatalogStore {
  readonly lojaId: number;
  readonly tid: number;
  readonly nid: number;
  readonly name: string;
  readonly offerUrlPath: string;
  readonly storeSlug: string;
}

export interface AssaiCatalogLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly startDateIso: string | null;
  readonly endDateIso: string | null;
  readonly imageUrls: readonly string[];
}

export interface AssaiOfferCatalog {
  readonly stores: readonly AssaiCatalogStore[];
  readonly leaflets: readonly AssaiCatalogLeafletAssignment[];
}

export interface AssaiCatalogLeafletAssignment extends AssaiCatalogLeaflet {
  readonly lojaIds: readonly number[];
  readonly tids: readonly number[];
  readonly nids: readonly number[];
}

export interface AssaiOfferCatalogClientConfig {
  readonly catalogUrl: string;
}

interface AssaiCatalogResponse {
  readonly lojas?: readonly AssaiCatalogStoreResponse[];
  readonly ofertas?: readonly AssaiCatalogLeafletResponse[];
}

interface AssaiCatalogStoreResponse {
  readonly tid?: number;
  readonly name?: string;
  readonly nid?: number;
  readonly loja_id?: number;
  readonly url?: string;
}

interface AssaiCatalogLeafletResponse {
  readonly id?: string | number;
  readonly id_oferta?: string | number;
  readonly title?: string;
  readonly start_date?: string | null;
  readonly end_date?: string | null;
  readonly lojas?: readonly AssaiCatalogLeafletStoreResponse[];
  readonly images?: readonly AssaiCatalogLeafletImageResponse[];
}

interface AssaiCatalogLeafletStoreResponse {
  readonly loja_id?: number;
  readonly tid?: number;
  readonly nid?: number;
}

interface AssaiCatalogLeafletImageResponse {
  readonly url?: string;
}

export class AssaiOfferCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssaiOfferCatalogError';
  }
}

export class FetchAssaiOfferCatalogClient {
  private readonly catalogUrl: string;

  constructor(config: AssaiOfferCatalogClientConfig) {
    this.catalogUrl = config.catalogUrl;
  }

  async fetchCatalog(): Promise<AssaiOfferCatalog> {
    const response = await fetch(this.catalogUrl, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://www.assai.com.br/ofertas',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new AssaiOfferCatalogError(
        `Assai offer catalog request failed: ${String(response.status)} ${response.statusText}`,
      );
    }

    return parseAssaiOfferCatalogResponse((await response.json()) as AssaiCatalogResponse);
  }
}

export function parseAssaiOfferCatalogResponse(response: AssaiCatalogResponse): AssaiOfferCatalog {
  if (response.lojas === undefined || response.ofertas === undefined) {
    throw new AssaiOfferCatalogError(
      'Assai offer catalog response must include lojas and ofertas.',
    );
  }

  return {
    stores: response.lojas.map(parseCatalogStore).filter((store) => store.lojaId > 0),
    leaflets: response.ofertas.map(parseCatalogLeaflet),
  };
}

export function findAssaiCatalogStore(
  catalog: AssaiOfferCatalog,
  target: AssaiMonitoredStore,
): AssaiCatalogStore | null {
  const bySlug = catalog.stores.find((store) => store.storeSlug === target.storeSlug);

  if (bySlug !== undefined) {
    return bySlug;
  }

  const normalizedTargetName = normalizeComparableValue(target.storeName);

  return (
    catalog.stores.find((store) => normalizeComparableValue(store.name) === normalizedTargetName) ??
    null
  );
}

export function listAssaiLeafletsForStore(
  catalog: AssaiOfferCatalog,
  store: AssaiCatalogStore,
): readonly AssaiCatalogLeaflet[] {
  return catalog.leaflets
    .filter((leaflet) => isLeafletAssignedToStore(leaflet, store))
    .map((leaflet) => ({
      leafletId: leaflet.leafletId,
      title: leaflet.title,
      startDateIso: leaflet.startDateIso,
      endDateIso: leaflet.endDateIso,
      imageUrls: leaflet.imageUrls,
    }));
}

function parseCatalogStore(response: AssaiCatalogStoreResponse): AssaiCatalogStore {
  if (
    response.loja_id === undefined ||
    response.tid === undefined ||
    response.nid === undefined ||
    response.name === undefined ||
    response.url === undefined
  ) {
    throw new AssaiOfferCatalogError('Invalid Assai catalog store response.');
  }

  return {
    lojaId: response.loja_id,
    tid: response.tid,
    nid: response.nid,
    name: response.name,
    offerUrlPath: response.url,
    storeSlug: extractStoreSlug(response.url),
  };
}

function parseCatalogLeaflet(response: AssaiCatalogLeafletResponse): AssaiCatalogLeafletAssignment {
  if (response.lojas === undefined || response.images === undefined) {
    throw new AssaiOfferCatalogError('Invalid Assai catalog leaflet response.');
  }

  const imageUrls = response.images.map((image) => image.url).filter(isNonBlankString);

  if (imageUrls.length === 0) {
    throw new AssaiOfferCatalogError(`Assai catalog leaflet ${String(response.id)} has no images.`);
  }

  return {
    leafletId: String(
      response.id_oferta ?? response.id ?? slugify(response.title ?? 'jornal-de-ofertas'),
    ),
    title:
      response.title !== undefined && response.title.trim().length > 0
        ? response.title.trim()
        : 'Jornal de Ofertas',
    startDateIso: response.start_date ?? null,
    endDateIso: response.end_date ?? null,
    lojaIds: response.lojas.map((store) => store.loja_id).filter(isNumber),
    tids: response.lojas.map((store) => store.tid).filter(isNumber),
    nids: response.lojas.map((store) => store.nid).filter(isNumber),
    imageUrls: [...new Set(imageUrls)],
  };
}

function isLeafletAssignedToStore(
  leaflet: AssaiCatalogLeafletAssignment,
  store: AssaiCatalogStore,
): boolean {
  return (
    leaflet.lojaIds.includes(store.lojaId) ||
    leaflet.tids.includes(store.tid) ||
    leaflet.nids.includes(store.nid)
  );
}

function extractStoreSlug(urlPath: string): string {
  const normalizedUrl = urlPath.trim().replace(/\/+$/, '');

  return normalizedUrl.substring(normalizedUrl.lastIndexOf('/') + 1);
}

function isNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonBlankString(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function normalizeComparableValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : 'jornal-de-ofertas';
}
