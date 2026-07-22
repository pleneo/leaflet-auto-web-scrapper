import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type { CarnaubaStore, CarnaubaStoreCatalogProvider } from './carnauba-api-types';
import {
  buildStoreHomeUrl,
  buildStoreLeafletsUrl,
  CarnaubaPlaywrightExtractionError,
  CarnaubaPlaywrightExtractionService,
  type SingleStoreCarnaubaLeafletExtractor,
} from './carnauba-playwright-extraction';

describe('CarnaubaPlaywrightExtractionService', () => {
  it('extracts leaflets from every discovered store URL', async () => {
    const storeCatalogProvider = new FakeStoreCatalogProvider(createStores());
    const storeSnapshotCache = new FakeStoreSnapshotCache(null);
    const leafletExtractor = new FakeSingleStoreExtractor();
    const service = new CarnaubaPlaywrightExtractionService(
      storeCatalogProvider,
      storeSnapshotCache,
      leafletExtractor,
      new FixedClock('2026-07-20T15:59:00.000Z'),
      new FakeLogger(),
    );

    const result = await service.extract({
      brandId: 27,
      storeCacheTtlMs: 86_400_000,
      siteBaseUrl: 'https://carnaubasupermercados.com.br',
      viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
      timeoutMs: 30_000,
      storeTimeoutMs: 60_000,
      maxStoreAttempts: 2,
      settleDelayMs: 5_000,
    });

    expect(storeCatalogProvider.calls).toBe(1);
    expect(storeSnapshotCache.saved?.stores).toHaveLength(2);
    expect(leafletExtractor.sourceUrls).toEqual([
      'https://carnaubasupermercados.com.br/loja/79/encartes',
      'https://carnaubasupermercados.com.br/loja/70/encartes',
    ]);
    expect(leafletExtractor.homeUrls).toEqual([
      'https://carnaubasupermercados.com.br/loja/79',
      'https://carnaubasupermercados.com.br/loja/70',
    ]);
    expect(result).toMatchObject({
      brandId: 27,
      source: 'carnauba-playwright',
      extractedAtIso: '2026-07-20T15:59:00.000Z',
    });
    expect(result.stores[0]?.leaflets[0]?.leafletId).toBe('leaflet-79');
    expect(result.stores[1]?.leaflets[0]?.leafletId).toBe('leaflet-70');
    expect(result.failedStores).toEqual([]);
  });

  it('passes visual dataset context to each store extraction', async () => {
    const leafletExtractor = new FakeSingleStoreExtractor();
    const service = new CarnaubaPlaywrightExtractionService(
      new FakeStoreCatalogProvider(createStores()),
      new FakeStoreSnapshotCache(null),
      leafletExtractor,
      new FixedClock('2026-07-20T15:59:00.000Z'),
      new FakeLogger(),
    );

    await service.extract({
      brandId: 27,
      storeCacheTtlMs: 86_400_000,
      siteBaseUrl: 'https://carnaubasupermercados.com.br',
      viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
      timeoutMs: 30_000,
      storeTimeoutMs: 60_000,
      maxStoreAttempts: 2,
      settleDelayMs: 5_000,
      visualDataset: {
        runId: 'run-1',
        split: 'unassigned',
      },
    });

    expect(leafletExtractor.receivedInputs.map((input) => input.visualDataset)).toEqual([
      {
        runId: 'run-1',
        storeId: 79,
        storeName: 'Maestro',
        split: 'unassigned',
      },
      {
        runId: 'run-1',
        storeId: 70,
        storeName: 'Messejana',
        split: 'unassigned',
      },
    ]);
  });

  it('uses a fresh cached store snapshot', async () => {
    const storeCatalogProvider = new FakeStoreCatalogProvider([]);
    const storeSnapshotCache = new FakeStoreSnapshotCache({
      brandId: 27,
      fetchedAtIso: '2026-07-20T15:00:00.000Z',
      stores: createStores(),
    });
    const service = new CarnaubaPlaywrightExtractionService(
      storeCatalogProvider,
      storeSnapshotCache,
      new FakeSingleStoreExtractor(),
      new FixedClock('2026-07-20T15:59:00.000Z'),
      new FakeLogger(),
    );

    const result = await service.extract({
      brandId: 27,
      storeCacheTtlMs: 86_400_000,
      siteBaseUrl: 'https://carnaubasupermercados.com.br',
      viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
      timeoutMs: 30_000,
      storeTimeoutMs: 60_000,
      maxStoreAttempts: 2,
      settleDelayMs: 5_000,
    });

    expect(storeCatalogProvider.calls).toBe(0);
    expect(result.stores).toHaveLength(2);
  });

  it('keeps extracting stores after one store fails all attempts', async () => {
    const leafletExtractor = new FakeSingleStoreExtractor({
      failingStoreIds: [79],
    });
    const logger = new FakeLogger();
    const service = new CarnaubaPlaywrightExtractionService(
      new FakeStoreCatalogProvider(createStores()),
      new FakeStoreSnapshotCache(null),
      leafletExtractor,
      new FixedClock('2026-07-20T15:59:00.000Z'),
      logger,
    );

    const result = await service.extract({
      brandId: 27,
      storeCacheTtlMs: 86_400_000,
      siteBaseUrl: 'https://carnaubasupermercados.com.br',
      viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
      timeoutMs: 30_000,
      storeTimeoutMs: 60_000,
      maxStoreAttempts: 2,
      settleDelayMs: 5_000,
    });

    expect(result.stores.map((store) => store.store.storeId)).toEqual([70]);
    expect(result.failedStores).toEqual([
      {
        store: createStores()[0],
        sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
        attempts: 2,
        errorMessage: 'Store 79 unavailable.',
      },
    ]);
    expect(leafletExtractor.sourceUrls).toEqual([
      'https://carnaubasupermercados.com.br/loja/79/encartes',
      'https://carnaubasupermercados.com.br/loja/79/encartes',
      'https://carnaubasupermercados.com.br/loja/70/encartes',
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('retries a store and records the successful attempt count', async () => {
    const leafletExtractor = new FakeSingleStoreExtractor({
      transientFailuresByStoreId: [
        {
          storeId: 79,
          failures: 1,
        },
      ],
    });
    const service = new CarnaubaPlaywrightExtractionService(
      new FakeStoreCatalogProvider(createStores().slice(0, 1)),
      new FakeStoreSnapshotCache(null),
      leafletExtractor,
      new FixedClock('2026-07-20T15:59:00.000Z'),
      new FakeLogger(),
    );

    const result = await service.extract({
      brandId: 27,
      storeCacheTtlMs: 86_400_000,
      siteBaseUrl: 'https://carnaubasupermercados.com.br',
      viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
      timeoutMs: 30_000,
      storeTimeoutMs: 60_000,
      maxStoreAttempts: 2,
      settleDelayMs: 5_000,
    });

    expect(result.stores[0]?.attempts).toBe(2);
    expect(result.failedStores).toEqual([]);
  });

  it('logs when a store has no leaflets available', async () => {
    const logger = new FakeLogger();
    const service = new CarnaubaPlaywrightExtractionService(
      new FakeStoreCatalogProvider(createStores().slice(0, 1)),
      new FakeStoreSnapshotCache(null),
      new FakeSingleStoreExtractor({
        emptyStoreIds: [79],
      }),
      new FixedClock('2026-07-20T15:59:00.000Z'),
      logger,
    );

    const result = await service.extract({
      brandId: 27,
      storeCacheTtlMs: 86_400_000,
      siteBaseUrl: 'https://carnaubasupermercados.com.br',
      viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
      timeoutMs: 30_000,
      storeTimeoutMs: 60_000,
      maxStoreAttempts: 2,
      settleDelayMs: 5_000,
    });

    expect(result.stores[0]?.leaflets).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith('No Carnauba leaflets found for store.', {
      storeId: 79,
      storeName: 'Maestro',
      sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
      attempts: 1,
    });
  });

  it('fails a store when the store timeout is reached', async () => {
    const service = new CarnaubaPlaywrightExtractionService(
      new FakeStoreCatalogProvider(createStores().slice(0, 1)),
      new FakeStoreSnapshotCache(null),
      new FakeSingleStoreExtractor({
        hangingStoreIds: [79],
      }),
      new FixedClock('2026-07-20T15:59:00.000Z'),
      new FakeLogger(),
    );

    const result = await service.extract({
      brandId: 27,
      storeCacheTtlMs: 86_400_000,
      siteBaseUrl: 'https://carnaubasupermercados.com.br',
      viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
      timeoutMs: 30_000,
      storeTimeoutMs: 1,
      maxStoreAttempts: 1,
      settleDelayMs: 5_000,
    });

    expect(result.stores).toEqual([]);
    expect(result.failedStores[0]?.errorMessage).toBe('Carnauba store 79 extraction timed out.');
  });

  it('rejects invalid input and store URLs', async () => {
    const service = new CarnaubaPlaywrightExtractionService(
      new FakeStoreCatalogProvider([]),
      new FakeStoreSnapshotCache(null),
      new FakeSingleStoreExtractor(),
      new FixedClock('2026-07-20T15:59:00.000Z'),
      new FakeLogger(),
    );

    await expect(
      service.extract({
        brandId: 0,
        storeCacheTtlMs: 86_400_000,
        siteBaseUrl: 'https://carnaubasupermercados.com.br',
        viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
        timeoutMs: 30_000,
        storeTimeoutMs: 60_000,
        maxStoreAttempts: 2,
        settleDelayMs: 5_000,
      }),
    ).rejects.toThrow(CarnaubaPlaywrightExtractionError);
    expect(() => buildStoreLeafletsUrl('https://carnaubasupermercados.com.br', 0)).toThrow(
      CarnaubaPlaywrightExtractionError,
    );
    expect(() => buildStoreHomeUrl('https://carnaubasupermercados.com.br', 0)).toThrow(
      CarnaubaPlaywrightExtractionError,
    );
  });

  it('uses a stale cached store snapshot after catalog failure', async () => {
    const storeCatalogProvider = new FailingStoreCatalogProvider();
    const service = new CarnaubaPlaywrightExtractionService(
      storeCatalogProvider,
      new FakeStoreSnapshotCache({
        brandId: 27,
        fetchedAtIso: '2026-07-18T15:00:00.000Z',
        stores: createStores(),
      }),
      new FakeSingleStoreExtractor(),
      new FixedClock('2026-07-20T15:59:00.000Z'),
      new FakeLogger(),
    );

    const result = await service.extract({
      brandId: 27,
      storeCacheTtlMs: 1,
      siteBaseUrl: 'https://carnaubasupermercados.com.br',
      viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
      timeoutMs: 30_000,
      storeTimeoutMs: 60_000,
      maxStoreAttempts: 2,
      settleDelayMs: 5_000,
    });

    expect(storeCatalogProvider.calls).toBe(1);
    expect(result.stores).toHaveLength(2);
  });

  it('throws catalog failure when no compatible snapshot exists', async () => {
    const service = new CarnaubaPlaywrightExtractionService(
      new FailingStoreCatalogProvider(),
      new FakeStoreSnapshotCache(null),
      new FakeSingleStoreExtractor(),
      new FixedClock('2026-07-20T15:59:00.000Z'),
      new FakeLogger(),
    );

    await expect(
      service.extract({
        brandId: 27,
        storeCacheTtlMs: 1,
        siteBaseUrl: 'https://carnaubasupermercados.com.br',
        viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
        timeoutMs: 30_000,
        storeTimeoutMs: 60_000,
        maxStoreAttempts: 2,
        settleDelayMs: 5_000,
      }),
    ).rejects.toThrow('Catalog unavailable.');
  });

  it('rejects every invalid scalar input', async () => {
    const service = new CarnaubaPlaywrightExtractionService(
      new FakeStoreCatalogProvider([]),
      new FakeStoreSnapshotCache(null),
      new FakeSingleStoreExtractor(),
      new FixedClock('2026-07-20T15:59:00.000Z'),
      new FakeLogger(),
    );
    const validInput = {
      brandId: 27,
      storeCacheTtlMs: 86_400_000,
      siteBaseUrl: 'https://carnaubasupermercados.com.br',
      viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
      timeoutMs: 30_000,
      storeTimeoutMs: 60_000,
      maxStoreAttempts: 2,
      settleDelayMs: 5_000,
    };

    await expect(service.extract({ ...validInput, storeCacheTtlMs: -1 })).rejects.toThrow(
      CarnaubaPlaywrightExtractionError,
    );
    await expect(service.extract({ ...validInput, siteBaseUrl: 'invalid' })).rejects.toThrow(
      CarnaubaPlaywrightExtractionError,
    );
    await expect(service.extract({ ...validInput, timeoutMs: 0 })).rejects.toThrow(
      CarnaubaPlaywrightExtractionError,
    );
    await expect(service.extract({ ...validInput, storeTimeoutMs: 0 })).rejects.toThrow(
      CarnaubaPlaywrightExtractionError,
    );
    await expect(service.extract({ ...validInput, maxStoreAttempts: 0 })).rejects.toThrow(
      CarnaubaPlaywrightExtractionError,
    );
    await expect(service.extract({ ...validInput, settleDelayMs: -1 })).rejects.toThrow(
      CarnaubaPlaywrightExtractionError,
    );
  });

  it('rejects an invalid clock value', async () => {
    const service = new CarnaubaPlaywrightExtractionService(
      new FakeStoreCatalogProvider([]),
      new FakeStoreSnapshotCache(null),
      new FakeSingleStoreExtractor(),
      new FixedClock('invalid-date'),
      new FakeLogger(),
    );

    await expect(
      service.extract({
        brandId: 27,
        storeCacheTtlMs: 86_400_000,
        siteBaseUrl: 'https://carnaubasupermercados.com.br',
        viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
        timeoutMs: 30_000,
        storeTimeoutMs: 60_000,
        maxStoreAttempts: 2,
        settleDelayMs: 5_000,
      }),
    ).rejects.toThrow(CarnaubaPlaywrightExtractionError);
  });
});

function createStores(): readonly CarnaubaStore[] {
  return [
    {
      storeId: 79,
      name: 'Maestro',
      cnpj: '',
      corporateName: '',
    },
    {
      storeId: 70,
      name: 'Messejana',
      cnpj: '',
      corporateName: '',
    },
  ];
}

class FakeStoreCatalogProvider implements CarnaubaStoreCatalogProvider {
  calls = 0;

  private readonly stores: readonly CarnaubaStore[];

  constructor(stores: readonly CarnaubaStore[]) {
    this.stores = stores;
  }

  listStores(): Promise<readonly CarnaubaStore[]> {
    this.calls += 1;
    return Promise.resolve(this.stores);
  }
}

class FailingStoreCatalogProvider implements CarnaubaStoreCatalogProvider {
  calls = 0;

  listStores(): Promise<readonly CarnaubaStore[]> {
    this.calls += 1;
    return Promise.reject(new Error('Catalog unavailable.'));
  }
}

interface FakeSingleStoreExtractorConfig {
  readonly emptyStoreIds?: readonly number[];
  readonly failingStoreIds?: readonly number[];
  readonly hangingStoreIds?: readonly number[];
  readonly transientFailuresByStoreId?: readonly {
    readonly storeId: number;
    readonly failures: number;
  }[];
}

class FakeSingleStoreExtractor implements SingleStoreCarnaubaLeafletExtractor {
  readonly homeUrls: string[] = [];

  readonly sourceUrls: string[] = [];

  readonly receivedInputs: Parameters<SingleStoreCarnaubaLeafletExtractor['extract']>[0][] = [];

  private readonly failingStoreIds: readonly number[];

  private readonly emptyStoreIds: readonly number[];

  private readonly hangingStoreIds: readonly number[];

  private readonly remainingTransientFailures = new Map<number, number>();

  constructor(config: FakeSingleStoreExtractorConfig = {}) {
    this.emptyStoreIds = config.emptyStoreIds ?? [];
    this.failingStoreIds = config.failingStoreIds ?? [];
    this.hangingStoreIds = config.hangingStoreIds ?? [];

    for (const transientFailure of config.transientFailuresByStoreId ?? []) {
      this.remainingTransientFailures.set(transientFailure.storeId, transientFailure.failures);
    }
  }

  extract(
    input: Parameters<SingleStoreCarnaubaLeafletExtractor['extract']>[0],
  ): ReturnType<SingleStoreCarnaubaLeafletExtractor['extract']> {
    this.receivedInputs.push(input);
    this.homeUrls.push(input.homeUrl);
    this.sourceUrls.push(input.sourceUrl);
    const storeId = input.sourceUrl.includes('/79/') ? 79 : 70;

    if (this.failingStoreIds.includes(storeId)) {
      return Promise.reject(new Error(`Store ${String(storeId)} unavailable.`));
    }

    if (this.hangingStoreIds.includes(storeId)) {
      return new Promise(() => undefined);
    }

    const remainingTransientFailures = this.remainingTransientFailures.get(storeId) ?? 0;

    if (remainingTransientFailures > 0) {
      this.remainingTransientFailures.set(storeId, remainingTransientFailures - 1);
      return Promise.reject(new Error(`Store ${String(storeId)} transient failure.`));
    }

    if (this.emptyStoreIds.includes(storeId)) {
      return Promise.resolve({
        leaflets: [],
      });
    }

    return Promise.resolve({
      leaflets: [
        {
          leafletId: `leaflet-${String(storeId)}`,
          title: `Leaflet ${String(storeId)}`,
          cardIndex: 0,
          coverImageUrl: `https://cdn.example.com/${String(storeId)}/cover.png`,
          images: [
            {
              order: 1,
              imageUrl: `https://cdn.example.com/${String(storeId)}/1.png`,
            },
          ],
        },
      ],
    });
  }
}

class FakeStoreSnapshotCache {
  private readonly snapshot: {
    readonly brandId: number;
    readonly fetchedAtIso: string;
    readonly stores: readonly CarnaubaStore[];
  } | null;

  saved: {
    readonly brandId: number;
    readonly fetchedAtIso: string;
    readonly stores: readonly CarnaubaStore[];
  } | null = null;

  constructor(
    snapshot: {
      readonly brandId: number;
      readonly fetchedAtIso: string;
      readonly stores: readonly CarnaubaStore[];
    } | null,
  ) {
    this.snapshot = snapshot;
  }

  load(): Promise<{
    readonly brandId: number;
    readonly fetchedAtIso: string;
    readonly stores: readonly CarnaubaStore[];
  } | null> {
    return Promise.resolve(this.snapshot);
  }

  save(snapshot: {
    readonly brandId: number;
    readonly fetchedAtIso: string;
    readonly stores: readonly CarnaubaStore[];
  }): Promise<string> {
    this.saved = snapshot;
    return Promise.resolve('/tmp/stores.snapshot.json');
  }

  isFresh(snapshot: { readonly fetchedAtIso: string }, ttlMs: number, nowMs: number): boolean {
    return nowMs - Date.parse(snapshot.fetchedAtIso) <= ttlMs;
  }
}

class FixedClock implements Clock {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  nowIso(): string {
    return this.value;
  }
}

class FakeLogger implements Logger {
  debug = vi.fn();

  info = vi.fn();

  warn = vi.fn();

  error = vi.fn();
}
