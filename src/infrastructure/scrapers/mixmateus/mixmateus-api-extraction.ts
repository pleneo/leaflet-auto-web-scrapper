import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  MixMateusApiCity,
  MixMateusApiLeaflet,
  MixMateusApiStore,
  MixMateusCityCatalogProvider,
  MixMateusLeafletProvider,
  MixMateusLeafletQuery,
  MixMateusStoreCatalogProvider,
} from './mixmateus-api-types';
import type {
  ExtractedMixMateusPdfLeaflet,
  MixMateusExtractedStore,
  MixMateusFailedStore,
} from './mixmateus-pdf-leaflet';
import type { MixMateusMonitoredStore } from './mixmateus-targets';

export interface MixMateusApiExtractionInput {
  readonly stores: readonly MixMateusMonitoredStore[];
}

export interface MixMateusApiExtractionResult {
  readonly source: 'mixmateus-api';
  readonly extractedAtIso: string;
  readonly stores: readonly MixMateusExtractedStore[];
  readonly failedStores: readonly MixMateusFailedStore[];
}

export class MixMateusApiExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MixMateusApiExtractionError';
  }
}

export class MixMateusApiExtractionService {
  private readonly cityCatalogProvider: MixMateusCityCatalogProvider;

  private readonly storeCatalogProvider: MixMateusStoreCatalogProvider;

  private readonly leafletProvider: MixMateusLeafletProvider;

  private readonly clock: Clock;

  private readonly logger: Logger;

  constructor(
    cityCatalogProvider: MixMateusCityCatalogProvider,
    storeCatalogProvider: MixMateusStoreCatalogProvider,
    leafletProvider: MixMateusLeafletProvider,
    clock: Clock,
    logger: Logger,
  ) {
    this.cityCatalogProvider = cityCatalogProvider;
    this.storeCatalogProvider = storeCatalogProvider;
    this.leafletProvider = leafletProvider;
    this.clock = clock;
    this.logger = logger;
  }

  async extract(input: MixMateusApiExtractionInput): Promise<MixMateusApiExtractionResult> {
    validateInput(input);

    const extractedStores: MixMateusExtractedStore[] = [];
    const failedStores: MixMateusFailedStore[] = [];

    for (const store of input.stores) {
      try {
        const leaflets = await this.extractStoreLeaflets(store);

        extractedStores.push({
          store,
          sourceUrl: store.finalPageUrl,
          leaflets,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unexpected Mix Mateus API failure.';
        this.logger.warn('Mix Mateus API store extraction failed.', {
          storeSlug: store.storeSlug,
          storeName: store.storeName,
          errorMessage,
        });
        failedStores.push({
          store,
          sourceUrl: store.finalPageUrl,
          errorMessage,
        });
      }
    }

    return {
      source: 'mixmateus-api',
      extractedAtIso: this.clock.nowIso(),
      stores: extractedStores,
      failedStores,
    };
  }

  private async extractStoreLeaflets(
    store: MixMateusMonitoredStore,
  ): Promise<readonly ExtractedMixMateusPdfLeaflet[]> {
    const directQuery = createDirectLeafletQuery(store);
    const directLeaflets = await this.tryListLeaflets(directQuery);

    if (directLeaflets.length > 0) {
      this.logger.info('Fetched Mix Mateus API leaflets through direct store query.', {
        storeSlug: store.storeSlug,
        leaflets: directLeaflets.length,
      });
      return directLeaflets.map((leaflet, index) => this.createExtractedLeaflet(leaflet, index));
    }

    const resolvedQuery = await this.resolveLeafletQueryFromCatalog(store, directQuery);
    const resolvedLeaflets = await this.leafletProvider.listLeaflets(resolvedQuery);

    this.logger.info('Fetched Mix Mateus API leaflets through resolved store query.', {
      storeSlug: store.storeSlug,
      resolvedStoreSlug: resolvedQuery.storeSlug,
      leaflets: resolvedLeaflets.length,
    });

    return resolvedLeaflets.map((leaflet, index) => this.createExtractedLeaflet(leaflet, index));
  }

  private async tryListLeaflets(
    query: MixMateusLeafletQuery,
  ): Promise<readonly MixMateusApiLeaflet[]> {
    try {
      return await this.leafletProvider.listLeaflets(query);
    } catch (error) {
      this.logger.warn('Mix Mateus direct API leaflet query failed; resolving store catalog.', {
        stateCode: query.stateCode,
        citySlug: query.citySlug,
        storeSlug: query.storeSlug,
        errorMessage:
          error instanceof Error ? error.message : 'Unexpected Mix Mateus direct query failure.',
      });

      return [];
    }
  }

  private async resolveLeafletQueryFromCatalog(
    store: MixMateusMonitoredStore,
    directQuery: MixMateusLeafletQuery,
  ): Promise<MixMateusLeafletQuery> {
    const cities = await this.cityCatalogProvider.listCities(store.stateCode);
    const city = findMatchingCity(cities, store, directQuery.citySlug);

    if (city === null) {
      throw new MixMateusApiExtractionError(`Could not resolve Mix Mateus city ${store.cityName}.`);
    }

    const stores = await this.storeCatalogProvider.listStores(city.citySlug);
    const resolvedStore = findMatchingStore(stores, store);

    if (resolvedStore === null) {
      throw new MixMateusApiExtractionError(
        `Could not resolve Mix Mateus store ${store.storeName}.`,
      );
    }

    return {
      stateCode: city.stateCode,
      citySlug: city.citySlug,
      storeSlug: resolvedStore.storeSlug,
      brandCode: resolvedStore.brandCode,
    };
  }

  private createExtractedLeaflet(
    leaflet: MixMateusApiLeaflet,
    index: number,
  ): ExtractedMixMateusPdfLeaflet {
    return {
      leafletId: `mixmateus-${String(leaflet.leafletId)}`,
      title: leaflet.title,
      cardIndex: index,
      pdfUrl: this.leafletProvider.buildPdfUrl(leaflet.filePath),
    };
  }
}

function createDirectLeafletQuery(store: MixMateusMonitoredStore): MixMateusLeafletQuery {
  return {
    stateCode: store.stateCode,
    citySlug: extractCitySlugFromFinalPageUrl(store.finalPageUrl),
    storeSlug: store.storeSlug,
    brandCode: 'MA',
  };
}

function findMatchingCity(
  cities: readonly MixMateusApiCity[],
  store: MixMateusMonitoredStore,
  fallbackCitySlug: string,
): MixMateusApiCity | null {
  const expectedCityName = normalizeName(store.cityName);
  const expectedCitySlug = normalizeName(fallbackCitySlug);

  return (
    cities.find(
      (city) =>
        normalizeName(city.citySlug) === expectedCitySlug ||
        normalizeName(city.name) === expectedCityName,
    ) ?? null
  );
}

function findMatchingStore(
  stores: readonly MixMateusApiStore[],
  store: MixMateusMonitoredStore,
): MixMateusApiStore | null {
  const expectedStoreSlug = normalizeName(store.storeSlug);
  const expectedStoreName = normalizeName(store.storeName);

  return (
    stores.find(
      (candidateStore) =>
        normalizeName(candidateStore.storeSlug) === expectedStoreSlug ||
        normalizeName(candidateStore.displayName) === expectedStoreName,
    ) ?? null
  );
}

function extractCitySlugFromFinalPageUrl(finalPageUrl: string): string {
  const url = new URL(finalPageUrl);
  const citySlug = url.pathname.split('/').filter((segment) => segment.length > 0)[1];

  if (citySlug === undefined) {
    throw new MixMateusApiExtractionError('Mix Mateus finalPageUrl must include a city slug.');
  }

  return citySlug;
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function validateInput(input: MixMateusApiExtractionInput): void {
  if (input.stores.length === 0) {
    throw new MixMateusApiExtractionError('stores cannot be empty.');
  }
}
