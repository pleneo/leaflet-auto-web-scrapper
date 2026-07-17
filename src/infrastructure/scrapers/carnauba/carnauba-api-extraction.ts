import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  CarnaubaFlipbook,
  CarnaubaFlipbookProvider,
  CarnaubaStore,
  CarnaubaStoreCatalogProvider,
} from './carnauba-api-types';
import type { StoreSnapshotCache } from './store-snapshot-cache';
import { createLeafletId } from './leaflet-id';

export interface CarnaubaApiExtractedImage {
  readonly order: number;
  readonly imageUrl: string;
}

export interface CarnaubaApiExtractedLeaflet {
  readonly leafletId: string;
  readonly flipbookId: number;
  readonly title: string;
  readonly images: readonly CarnaubaApiExtractedImage[];
}

export interface CarnaubaApiExtractedStore {
  readonly store: CarnaubaStore;
  readonly leaflets: readonly CarnaubaApiExtractedLeaflet[];
}

export interface CarnaubaApiExtractionResult {
  readonly brandId: number;
  readonly source: 'mercadapp-api';
  readonly extractedAtIso: string;
  readonly stores: readonly CarnaubaApiExtractedStore[];
}

export interface CarnaubaApiExtractionInput {
  readonly brandId: number;
  readonly storeCacheTtlMs: number;
}

export class CarnaubaApiExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CarnaubaApiExtractionError';
  }
}

export class CarnaubaApiExtractionService {
  private readonly storeCatalogProvider: CarnaubaStoreCatalogProvider;

  private readonly flipbookProvider: CarnaubaFlipbookProvider;

  private readonly storeSnapshotCache: StoreSnapshotCache;

  private readonly clock: Clock;

  private readonly logger: Logger;

  constructor(
    storeCatalogProvider: CarnaubaStoreCatalogProvider,
    flipbookProvider: CarnaubaFlipbookProvider,
    storeSnapshotCache: StoreSnapshotCache,
    clock: Clock,
    logger: Logger,
  ) {
    this.storeCatalogProvider = storeCatalogProvider;
    this.flipbookProvider = flipbookProvider;
    this.storeSnapshotCache = storeSnapshotCache;
    this.clock = clock;
    this.logger = logger;
  }

  async extract(input: CarnaubaApiExtractionInput): Promise<CarnaubaApiExtractionResult> {
    validateInput(input);

    const stores = await this.resolveStores(input);
    const extractedStores: CarnaubaApiExtractedStore[] = [];

    for (const store of stores) {
      const flipbooks = await this.flipbookProvider.listFlipbooks(store.storeId);
      this.logger.info('Fetched Carnauba store flipbooks.', {
        storeId: store.storeId,
        flipbooks: flipbooks.length,
      });

      extractedStores.push({
        store,
        leaflets: flipbooks.map(mapFlipbookToLeaflet),
      });
    }

    return {
      brandId: input.brandId,
      source: 'mercadapp-api',
      extractedAtIso: this.clock.nowIso(),
      stores: extractedStores,
    };
  }

  private async resolveStores(
    input: CarnaubaApiExtractionInput,
  ): Promise<readonly CarnaubaStore[]> {
    const nowMs = Date.parse(this.clock.nowIso());

    if (!Number.isFinite(nowMs)) {
      throw new CarnaubaApiExtractionError('Clock returned an invalid ISO date.');
    }

    const cachedSnapshot = await this.storeSnapshotCache.load();

    if (
      cachedSnapshot !== null &&
      cachedSnapshot.brandId === input.brandId &&
      this.storeSnapshotCache.isFresh(cachedSnapshot, input.storeCacheTtlMs, nowMs)
    ) {
      this.logger.info('Using fresh Carnauba store snapshot.', {
        stores: cachedSnapshot.stores.length,
      });
      return cachedSnapshot.stores;
    }

    try {
      const stores = await this.storeCatalogProvider.listStores();
      await this.storeSnapshotCache.save({
        brandId: input.brandId,
        fetchedAtIso: this.clock.nowIso(),
        stores,
      });
      this.logger.info('Fetched and cached Carnauba store catalog.', {
        stores: stores.length,
      });
      return stores;
    } catch (error) {
      if (cachedSnapshot !== null && cachedSnapshot.brandId === input.brandId) {
        this.logger.warn('Using stale Carnauba store snapshot after API failure.', {
          stores: cachedSnapshot.stores.length,
        });
        return cachedSnapshot.stores;
      }

      throw error;
    }
  }
}

function validateInput(input: CarnaubaApiExtractionInput): void {
  if (!Number.isInteger(input.brandId) || input.brandId <= 0) {
    throw new CarnaubaApiExtractionError('brandId must be a positive integer.');
  }

  if (!Number.isInteger(input.storeCacheTtlMs) || input.storeCacheTtlMs < 0) {
    throw new CarnaubaApiExtractionError('storeCacheTtlMs must be a non-negative integer.');
  }
}

function mapFlipbookToLeaflet(
  flipbook: CarnaubaFlipbook,
  index: number,
): CarnaubaApiExtractedLeaflet {
  return {
    leafletId: `${String(flipbook.flipbookId)}-${createLeafletId(flipbook.name, index)}`,
    flipbookId: flipbook.flipbookId,
    title: flipbook.name,
    images: flipbook.images,
  };
}
