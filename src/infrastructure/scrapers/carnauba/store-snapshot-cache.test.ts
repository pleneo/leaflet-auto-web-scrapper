import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CarnaubaStoreSnapshot } from './carnauba-api-types';
import { StoreSnapshotCache, StoreSnapshotCacheError } from './store-snapshot-cache';

describe('StoreSnapshotCache', () => {
  let cacheRootDirectory: string;

  beforeEach(async () => {
    cacheRootDirectory = await mkdtemp(join(tmpdir(), 'carnauba-cache-'));
  });

  afterEach(async () => {
    await rm(cacheRootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('returns null when no snapshot exists', async () => {
    const cache = new StoreSnapshotCache({
      cacheRootDirectory,
    });

    await expect(cache.load()).resolves.toBeNull();
  });

  it('saves and loads a store snapshot', async () => {
    const cache = new StoreSnapshotCache({
      cacheRootDirectory,
    });
    const snapshot = createSnapshot('2026-07-17T10:00:00.000Z');

    const snapshotPath = await cache.save(snapshot);
    const loaded = await cache.load();

    expect(snapshotPath).toBe(join(cacheRootDirectory, 'carnauba/stores.snapshot.json'));
    expect(loaded).toEqual(snapshot);
  });

  it('detects fresh snapshots', () => {
    const cache = new StoreSnapshotCache({
      cacheRootDirectory,
    });

    expect(
      cache.isFresh(
        createSnapshot('2026-07-17T10:00:00.000Z'),
        60_000,
        Date.parse('2026-07-17T10:00:30.000Z'),
      ),
    ).toBe(true);
    expect(
      cache.isFresh(
        createSnapshot('2026-07-17T10:00:00.000Z'),
        60_000,
        Date.parse('2026-07-17T10:02:00.000Z'),
      ),
    ).toBe(false);
  });

  it('rejects invalid cache configuration and TTL values', async () => {
    await expect(
      new StoreSnapshotCache({
        cacheRootDirectory: ' ',
      }).save(createSnapshot('2026-07-17T10:00:00.000Z')),
    ).rejects.toThrow(StoreSnapshotCacheError);

    expect(() =>
      new StoreSnapshotCache({
        cacheRootDirectory,
      }).isFresh(createSnapshot('2026-07-17T10:00:00.000Z'), -1, Date.now()),
    ).toThrow(StoreSnapshotCacheError);

    expect(() =>
      new StoreSnapshotCache({
        cacheRootDirectory,
      }).isFresh(createSnapshot('invalid-date'), 60_000, Date.now()),
    ).toThrow(StoreSnapshotCacheError);
  });

  it('rejects malformed snapshot files', async () => {
    await mkdir(join(cacheRootDirectory, 'carnauba'), {
      recursive: true,
    });
    await writeFile(join(cacheRootDirectory, 'carnauba/stores.snapshot.json'), '[]');

    await expect(
      new StoreSnapshotCache({
        cacheRootDirectory,
      }).load(),
    ).rejects.toThrow(StoreSnapshotCacheError);

    await writeFile(
      join(cacheRootDirectory, 'carnauba/stores.snapshot.json'),
      JSON.stringify({
        brandId: 27,
        fetchedAtIso: '2026-07-17T10:00:00.000Z',
        stores: null,
      }),
    );

    await expect(
      new StoreSnapshotCache({
        cacheRootDirectory,
      }).load(),
    ).rejects.toThrow(StoreSnapshotCacheError);
  });
});

function createSnapshot(fetchedAtIso: string): CarnaubaStoreSnapshot {
  return {
    brandId: 27,
    fetchedAtIso,
    stores: [
      {
        storeId: 79,
        name: 'Carnauba Maestro',
        cnpj: '05599698000127',
        corporateName: '',
      },
    ],
  };
}
