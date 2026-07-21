import type { ExtractCarnaubaLeafletsInput } from './carnauba-leaflet-extractor';
import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type { ExtractedLeaflet } from '../../../domain/leaflet/extracted-leaflet';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type {
  CarnaubaStore,
  CarnaubaStoreCatalogProvider,
  CarnaubaStoreSnapshot,
} from './carnauba-api-types';

export interface CarnaubaPlaywrightExtractedStore {
  readonly store: CarnaubaStore;
  readonly sourceUrl: string;
  readonly leaflets: readonly ExtractedLeaflet[];
  readonly attempts: number;
}

export interface CarnaubaPlaywrightFailedStore {
  readonly store: CarnaubaStore;
  readonly sourceUrl: string;
  readonly attempts: number;
  readonly errorMessage: string;
}

export interface CarnaubaPlaywrightExtractionResult {
  readonly brandId: number;
  readonly source: 'carnauba-playwright';
  readonly extractedAtIso: string;
  readonly stores: readonly CarnaubaPlaywrightExtractedStore[];
  readonly failedStores: readonly CarnaubaPlaywrightFailedStore[];
}

export interface CarnaubaPlaywrightExtractionInput {
  readonly brandId: number;
  readonly storeCacheTtlMs: number;
  readonly siteBaseUrl: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly storeTimeoutMs: number;
  readonly maxStoreAttempts: number;
  readonly settleDelayMs: number;
  readonly visualDataset?: CarnaubaPlaywrightVisualDatasetInput;
}

export interface CarnaubaPlaywrightVisualDatasetInput {
  readonly runId: string;
  readonly split: DatasetSplit;
}

export interface SingleStoreCarnaubaLeafletExtractor {
  extract(input: ExtractCarnaubaLeafletsInput): Promise<{
    readonly leaflets: readonly ExtractedLeaflet[];
  }>;
}

export interface CarnaubaStoreSnapshotCache {
  load(): Promise<CarnaubaStoreSnapshot | null>;
  save(snapshot: CarnaubaStoreSnapshot): Promise<string>;
  isFresh(snapshot: CarnaubaStoreSnapshot, ttlMs: number, nowMs: number): boolean;
}

export class CarnaubaPlaywrightExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CarnaubaPlaywrightExtractionError';
  }
}

export class CarnaubaPlaywrightExtractionService {
  private readonly storeCatalogProvider: CarnaubaStoreCatalogProvider;

  private readonly storeSnapshotCache: CarnaubaStoreSnapshotCache;

  private readonly leafletExtractor: SingleStoreCarnaubaLeafletExtractor;

  private readonly clock: Clock;

  private readonly logger: Logger;

  constructor(
    storeCatalogProvider: CarnaubaStoreCatalogProvider,
    storeSnapshotCache: CarnaubaStoreSnapshotCache,
    leafletExtractor: SingleStoreCarnaubaLeafletExtractor,
    clock: Clock,
    logger: Logger,
  ) {
    this.storeCatalogProvider = storeCatalogProvider;
    this.storeSnapshotCache = storeSnapshotCache;
    this.leafletExtractor = leafletExtractor;
    this.clock = clock;
    this.logger = logger;
  }

  async extract(
    input: CarnaubaPlaywrightExtractionInput,
  ): Promise<CarnaubaPlaywrightExtractionResult> {
    validateInput(input);

    const stores = await this.resolveStores(input);
    const extractedStores: CarnaubaPlaywrightExtractedStore[] = [];
    const failedStores: CarnaubaPlaywrightFailedStore[] = [];

    for (const store of stores) {
      const homeUrl = buildStoreHomeUrl(input.siteBaseUrl, store.storeId);
      const sourceUrl = buildStoreLeafletsUrl(input.siteBaseUrl, store.storeId);
      this.logger.info('Starting Carnauba Playwright store extraction.', {
        storeId: store.storeId,
        homeUrl,
        sourceUrl,
      });

      const result = await this.extractStoreWithRetry(input, store, homeUrl, sourceUrl);

      if (result.status === 'failed') {
        this.logger.error('Carnauba Playwright store extraction failed.', {
          storeId: store.storeId,
          attempts: result.attempts,
        });
        failedStores.push({
          store,
          sourceUrl,
          attempts: result.attempts,
          errorMessage: result.errorMessage,
        });
        continue;
      }

      this.logger.info('Finished Carnauba Playwright store extraction.', {
        storeId: store.storeId,
        leaflets: result.leaflets.length,
        attempts: result.attempts,
      });

      extractedStores.push({
        store,
        sourceUrl,
        leaflets: result.leaflets,
        attempts: result.attempts,
      });
    }

    return {
      brandId: input.brandId,
      source: 'carnauba-playwright',
      extractedAtIso: this.clock.nowIso(),
      stores: extractedStores,
      failedStores,
    };
  }

  private async extractStoreWithRetry(
    input: CarnaubaPlaywrightExtractionInput,
    store: CarnaubaStore,
    homeUrl: string,
    sourceUrl: string,
  ): Promise<
    | {
        readonly status: 'succeeded';
        readonly attempts: number;
        readonly leaflets: readonly ExtractedLeaflet[];
      }
    | {
        readonly status: 'failed';
        readonly attempts: number;
        readonly errorMessage: string;
      }
  > {
    let lastErrorMessage = 'Unknown store extraction failure.';

    for (let attempt = 1; attempt <= input.maxStoreAttempts; attempt += 1) {
      try {
        const result = await withTimeout(
          this.leafletExtractor.extract(
            createStoreExtractionInput(input, store, homeUrl, sourceUrl),
          ),
          input.storeTimeoutMs,
          `Carnauba store ${String(store.storeId)} extraction timed out.`,
        );

        return {
          status: 'succeeded',
          attempts: attempt,
          leaflets: result.leaflets,
        };
      } catch (error) {
        lastErrorMessage =
          error instanceof Error ? error.message : 'Unexpected extraction failure.';
        this.logger.warn('Carnauba Playwright store extraction attempt failed.', {
          storeId: store.storeId,
          attempt,
        });
      }
    }

    return {
      status: 'failed',
      attempts: input.maxStoreAttempts,
      errorMessage: lastErrorMessage,
    };
  }

  private async resolveStores(
    input: CarnaubaPlaywrightExtractionInput,
  ): Promise<readonly CarnaubaStore[]> {
    const nowMs = Date.parse(this.clock.nowIso());

    if (!Number.isFinite(nowMs)) {
      throw new CarnaubaPlaywrightExtractionError('Clock returned an invalid ISO date.');
    }

    const cachedSnapshot = await this.storeSnapshotCache.load();

    if (
      cachedSnapshot !== null &&
      cachedSnapshot.brandId === input.brandId &&
      this.storeSnapshotCache.isFresh(cachedSnapshot, input.storeCacheTtlMs, nowMs)
    ) {
      this.logger.info('Using fresh Carnauba store snapshot for Playwright extraction.', {
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
      this.logger.info('Fetched and cached Carnauba store catalog for Playwright extraction.', {
        stores: stores.length,
      });
      return stores;
    } catch (error) {
      if (cachedSnapshot !== null && cachedSnapshot.brandId === input.brandId) {
        this.logger.warn(
          'Using stale Carnauba store snapshot for Playwright extraction after API failure.',
          {
            stores: cachedSnapshot.stores.length,
          },
        );
        return cachedSnapshot.stores;
      }

      throw error;
    }
  }
}

function createStoreExtractionInput(
  input: CarnaubaPlaywrightExtractionInput,
  store: CarnaubaStore,
  homeUrl: string,
  sourceUrl: string,
): ExtractCarnaubaLeafletsInput {
  const baseInput = {
    homeUrl,
    sourceUrl,
    viewport: input.viewport,
    timeoutMs: input.timeoutMs,
    settleDelayMs: input.settleDelayMs,
  };

  if (input.visualDataset === undefined) {
    return baseInput;
  }

  return {
    ...baseInput,
    visualDataset: {
      runId: input.visualDataset.runId,
      storeId: store.storeId,
      storeName: store.name,
      split: input.visualDataset.split,
    },
  };
}

function validateInput(input: CarnaubaPlaywrightExtractionInput): void {
  if (!Number.isInteger(input.brandId) || input.brandId <= 0) {
    throw new CarnaubaPlaywrightExtractionError('brandId must be a positive integer.');
  }

  if (!Number.isInteger(input.storeCacheTtlMs) || input.storeCacheTtlMs < 0) {
    throw new CarnaubaPlaywrightExtractionError('storeCacheTtlMs must be a non-negative integer.');
  }

  validateAbsoluteUrl(input.siteBaseUrl, 'siteBaseUrl');
  validatePositiveInteger(input.timeoutMs, 'timeoutMs');
  validatePositiveInteger(input.storeTimeoutMs, 'storeTimeoutMs');
  validatePositiveInteger(input.maxStoreAttempts, 'maxStoreAttempts');

  if (!Number.isInteger(input.settleDelayMs) || input.settleDelayMs < 0) {
    throw new CarnaubaPlaywrightExtractionError('settleDelayMs must be a non-negative integer.');
  }
}

function withTimeout<TValue>(
  promise: Promise<TValue>,
  timeoutMs: number,
  message: string,
): Promise<TValue> {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_resolvePromise, rejectPromise) => {
    timeout = setTimeout(() => {
      rejectPromise(new CarnaubaPlaywrightExtractionError(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}

function validateAbsoluteUrl(url: string, fieldName: string): void {
  try {
    new URL(url);
  } catch {
    throw new CarnaubaPlaywrightExtractionError(`${fieldName} must be absolute and valid.`);
  }
}

function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CarnaubaPlaywrightExtractionError(`${fieldName} must be a positive integer.`);
  }
}

export function buildStoreLeafletsUrl(siteBaseUrl: string, storeId: number): string {
  if (!Number.isInteger(storeId) || storeId <= 0) {
    throw new CarnaubaPlaywrightExtractionError('storeId must be a positive integer.');
  }

  const baseUrl = new URL(siteBaseUrl);
  baseUrl.pathname = `/loja/${String(storeId)}/encartes`;
  baseUrl.search = '';
  baseUrl.hash = '';

  return baseUrl.toString();
}

export function buildStoreHomeUrl(siteBaseUrl: string, storeId: number): string {
  if (!Number.isInteger(storeId) || storeId <= 0) {
    throw new CarnaubaPlaywrightExtractionError('storeId must be a positive integer.');
  }

  const baseUrl = new URL(siteBaseUrl);
  baseUrl.pathname = `/loja/${String(storeId)}`;
  baseUrl.search = '';
  baseUrl.hash = '';

  return baseUrl.toString();
}
