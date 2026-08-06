import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface AssaiStoreUrlCacheConfig {
  readonly cacheRootDirectory: string;
}

export interface AssaiCachedStoreUrl {
  readonly storeSlug: string;
  readonly resolvedOfferUrl: string;
  readonly resolvedAtIso: string;
}

export interface AssaiStoreUrlSnapshot {
  readonly version: number;
  readonly entries: readonly AssaiCachedStoreUrl[];
}

export class AssaiStoreUrlCacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssaiStoreUrlCacheError';
  }
}

export class AssaiStoreUrlCache {
  private readonly cacheRootDirectory: string;

  constructor(config: AssaiStoreUrlCacheConfig) {
    this.cacheRootDirectory = config.cacheRootDirectory;
  }

  async get(storeSlug: string): Promise<string | null> {
    validateStoreSlug(storeSlug);
    const snapshot = await this.load();
    const entry = snapshot.entries.find((cachedEntry) => cachedEntry.storeSlug === storeSlug);

    return entry?.resolvedOfferUrl ?? null;
  }

  async set(input: AssaiCachedStoreUrl): Promise<string> {
    validateEntry(input);
    const snapshot = await this.load();
    const entries = snapshot.entries.filter((entry) => entry.storeSlug !== input.storeSlug);
    const updatedSnapshot: AssaiStoreUrlSnapshot = {
      version: 1,
      entries: [...entries, input].sort((left, right) =>
        left.storeSlug.localeCompare(right.storeSlug),
      ),
    };
    const snapshotPath = this.getSnapshotPath();

    await mkdir(this.getSnapshotDirectory(), { recursive: true });
    await writeFile(snapshotPath, `${JSON.stringify(updatedSnapshot, null, 2)}\n`);

    return snapshotPath;
  }

  async load(): Promise<AssaiStoreUrlSnapshot> {
    try {
      const content = await readFile(this.getSnapshotPath(), 'utf8');

      return parseSnapshot(content);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return {
          version: 1,
          entries: [],
        };
      }

      throw error;
    }
  }

  private getSnapshotDirectory(): string {
    const trimmed = this.cacheRootDirectory.trim();

    if (trimmed.length === 0) {
      throw new AssaiStoreUrlCacheError('cacheRootDirectory cannot be blank.');
    }

    return join(trimmed, 'assai');
  }

  private getSnapshotPath(): string {
    return join(this.getSnapshotDirectory(), 'store-url-cache.json');
  }
}

function parseSnapshot(content: string): AssaiStoreUrlSnapshot {
  const parsed = JSON.parse(content) as AssaiStoreUrlSnapshot | object | null;

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AssaiStoreUrlCacheError('Assai store URL cache must be a JSON object.');
  }

  const snapshot = parsed as AssaiStoreUrlSnapshot;

  if (snapshot.version !== 1 || !Array.isArray(snapshot.entries)) {
    throw new AssaiStoreUrlCacheError('Assai store URL cache has an invalid format.');
  }

  snapshot.entries.forEach(validateEntry);

  return snapshot;
}

function validateEntry(input: AssaiCachedStoreUrl): void {
  validateStoreSlug(input.storeSlug);
  validateUrl(input.resolvedOfferUrl);

  if (!Number.isFinite(Date.parse(input.resolvedAtIso))) {
    throw new AssaiStoreUrlCacheError('resolvedAtIso must be a valid ISO date.');
  }
}

function validateStoreSlug(value: string): void {
  if (value.trim().length === 0) {
    throw new AssaiStoreUrlCacheError('storeSlug cannot be blank.');
  }
}

function validateUrl(value: string): void {
  if (!value.startsWith('https://www.assai.com.br/ofertas/')) {
    throw new AssaiStoreUrlCacheError('resolvedOfferUrl must be an Assai offers URL.');
  }
}
