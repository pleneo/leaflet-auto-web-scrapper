import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CarnaubaStoreSnapshot } from './carnauba-api-types';

export interface StoreSnapshotCacheConfig {
  readonly cacheRootDirectory: string;
}

export class StoreSnapshotCacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreSnapshotCacheError';
  }
}

export class StoreSnapshotCache {
  private readonly cacheRootDirectory: string;

  constructor(config: StoreSnapshotCacheConfig) {
    this.cacheRootDirectory = config.cacheRootDirectory;
  }

  async load(): Promise<CarnaubaStoreSnapshot | null> {
    try {
      const content = await readFile(this.getSnapshotPath(), 'utf8');
      return parseSnapshot(content);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }

  async save(snapshot: CarnaubaStoreSnapshot): Promise<string> {
    const snapshotPath = this.getSnapshotPath();
    await mkdir(this.getSnapshotDirectory(), {
      recursive: true,
    });
    await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    return snapshotPath;
  }

  isFresh(snapshot: CarnaubaStoreSnapshot, ttlMs: number, nowMs: number): boolean {
    if (!Number.isInteger(ttlMs) || ttlMs < 0) {
      throw new StoreSnapshotCacheError('ttlMs must be a non-negative integer.');
    }

    const fetchedAtMs = Date.parse(snapshot.fetchedAtIso);

    if (!Number.isFinite(fetchedAtMs)) {
      throw new StoreSnapshotCacheError('snapshot fetchedAtIso must be a valid ISO date.');
    }

    return nowMs - fetchedAtMs <= ttlMs;
  }

  private getSnapshotDirectory(): string {
    const trimmed = this.cacheRootDirectory.trim();

    if (trimmed.length === 0) {
      throw new StoreSnapshotCacheError('cacheRootDirectory cannot be blank.');
    }

    return join(trimmed, 'carnauba');
  }

  private getSnapshotPath(): string {
    return join(this.getSnapshotDirectory(), 'stores.snapshot.json');
  }
}

function parseSnapshot(content: string): CarnaubaStoreSnapshot {
  const parsed = JSON.parse(content) as CarnaubaStoreSnapshot | object | null;

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StoreSnapshotCacheError('Store snapshot must be a JSON object.');
  }

  const snapshot = parsed as CarnaubaStoreSnapshot;

  if (!Array.isArray(snapshot.stores)) {
    throw new StoreSnapshotCacheError('Store snapshot stores must be an array.');
  }

  return snapshot;
}
