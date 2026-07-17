import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { LogContext, Logger } from '../../../application/ports/logger';
import type {
  CarnaubaFlipbook,
  CarnaubaFlipbookProvider,
  CarnaubaStore,
  CarnaubaStoreCatalogProvider,
} from './carnauba-api-types';
import {
  CarnaubaApiExtractionError,
  CarnaubaApiExtractionService,
} from './carnauba-api-extraction';
import { StoreSnapshotCache } from './store-snapshot-cache';

describe('CarnaubaApiExtractionService', () => {
  let cacheRootDirectory: string;

  beforeEach(async () => {
    cacheRootDirectory = await mkdtemp(join(tmpdir(), 'carnauba-api-extraction-'));
  });

  afterEach(async () => {
    await rm(cacheRootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('fetches stores from API, caches them, and extracts flipbooks for every store', async () => {
    const storeProvider = new FakeStoreCatalogProvider([createStore(79, 'Maestro')]);
    const flipbookProvider = new FakeFlipbookProvider([
      {
        storeId: 79,
        flipbooks: [
          {
            flipbookId: 69362,
            name: 'São joão',
            images: [
              {
                order: 1,
                imageUrl: 'https://cdn.example.com/1.png',
              },
            ],
          },
        ],
      },
    ]);
    const service = createService(storeProvider, flipbookProvider, cacheRootDirectory);

    const result = await service.extract({
      brandId: 27,
      storeCacheTtlMs: 86_400_000,
    });

    expect(storeProvider.calls).toBe(1);
    expect(flipbookProvider.storeIds).toEqual([79]);
    expect(result).toEqual({
      brandId: 27,
      source: 'mercadapp-api',
      extractedAtIso: '2026-07-17T10:00:00.000Z',
      stores: [
        {
          store: createStore(79, 'Maestro'),
          leaflets: [
            {
              leafletId: '69362-1-sao-joao',
              flipbookId: 69362,
              title: 'São joão',
              images: [
                {
                  order: 1,
                  imageUrl: 'https://cdn.example.com/1.png',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('uses a fresh store snapshot without calling the store API', async () => {
    const cache = new StoreSnapshotCache({
      cacheRootDirectory,
    });
    await cache.save({
      brandId: 27,
      fetchedAtIso: '2026-07-17T09:59:00.000Z',
      stores: [createStore(70, 'Messejana')],
    });
    const storeProvider = new FakeStoreCatalogProvider([createStore(79, 'Maestro')]);
    const service = createService(
      storeProvider,
      new FakeFlipbookProvider([
        {
          storeId: 70,
          flipbooks: [],
        },
      ]),
      cacheRootDirectory,
    );

    const result = await service.extract({
      brandId: 27,
      storeCacheTtlMs: 86_400_000,
    });

    expect(storeProvider.calls).toBe(0);
    expect(result.stores[0]?.store.storeId).toBe(70);
  });

  it('uses a stale snapshot when the store API fails', async () => {
    const cache = new StoreSnapshotCache({
      cacheRootDirectory,
    });
    await cache.save({
      brandId: 27,
      fetchedAtIso: '2026-07-16T09:59:00.000Z',
      stores: [createStore(65, 'Aldeota')],
    });
    const service = createService(
      new FailingStoreCatalogProvider(),
      new FakeFlipbookProvider([
        {
          storeId: 65,
          flipbooks: [],
        },
      ]),
      cacheRootDirectory,
    );

    const result = await service.extract({
      brandId: 27,
      storeCacheTtlMs: 1,
    });

    expect(result.stores[0]?.store.storeId).toBe(65);
  });

  it('rejects invalid input and store API failure without fallback', async () => {
    const service = createService(
      new FailingStoreCatalogProvider(),
      new FakeFlipbookProvider([]),
      cacheRootDirectory,
    );

    await expect(
      service.extract({
        brandId: 0,
        storeCacheTtlMs: 1,
      }),
    ).rejects.toThrow(CarnaubaApiExtractionError);

    await expect(
      service.extract({
        brandId: 27,
        storeCacheTtlMs: -1,
      }),
    ).rejects.toThrow(CarnaubaApiExtractionError);

    await expect(
      service.extract({
        brandId: 27,
        storeCacheTtlMs: 1,
      }),
    ).rejects.toThrow(Error);
  });

  it('rejects invalid clock values', async () => {
    const service = new CarnaubaApiExtractionService(
      new FakeStoreCatalogProvider([]),
      new FakeFlipbookProvider([]),
      new StoreSnapshotCache({
        cacheRootDirectory,
      }),
      new InvalidClock(),
      new MemoryLogger(),
    );

    await expect(
      service.extract({
        brandId: 27,
        storeCacheTtlMs: 1,
      }),
    ).rejects.toThrow(CarnaubaApiExtractionError);
  });
});

function createService(
  storeProvider: CarnaubaStoreCatalogProvider,
  flipbookProvider: CarnaubaFlipbookProvider,
  cacheRootDirectory: string,
): CarnaubaApiExtractionService {
  return new CarnaubaApiExtractionService(
    storeProvider,
    flipbookProvider,
    new StoreSnapshotCache({
      cacheRootDirectory,
    }),
    new FixedClock(),
    new MemoryLogger(),
  );
}

function createStore(storeId: number, name: string): CarnaubaStore {
  return {
    storeId,
    name,
    cnpj: '',
    corporateName: '',
  };
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
  listStores(): Promise<readonly CarnaubaStore[]> {
    return Promise.reject(new Error('Store API failed.'));
  }
}

interface FakeStoreFlipbooks {
  readonly storeId: number;
  readonly flipbooks: readonly CarnaubaFlipbook[];
}

class FakeFlipbookProvider implements CarnaubaFlipbookProvider {
  readonly storeIds: number[] = [];

  private readonly stores: readonly FakeStoreFlipbooks[];

  constructor(stores: readonly FakeStoreFlipbooks[]) {
    this.stores = stores;
  }

  listFlipbooks(storeId: number): Promise<readonly CarnaubaFlipbook[]> {
    this.storeIds.push(storeId);
    return Promise.resolve(this.stores.find((store) => store.storeId === storeId)?.flipbooks ?? []);
  }
}

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-07-17T10:00:00.000Z';
  }
}

class InvalidClock implements Clock {
  nowIso(): string {
    return 'invalid-date';
  }
}

class MemoryLogger implements Logger {
  readonly entries: string[] = [];

  debug(message: string, context?: LogContext): void {
    this.write(message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write(message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write(message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write(message, context);
  }

  private write(message: string, context?: LogContext): void {
    this.entries.push(`${message}:${context === undefined ? 'no-context' : 'with-context'}`);
  }
}
