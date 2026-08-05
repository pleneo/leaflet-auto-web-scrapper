import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssaiStoreUrlCache, AssaiStoreUrlCacheError } from './assai-store-url-cache';

describe('AssaiStoreUrlCache', () => {
  let cacheRootDirectory: string;

  beforeEach(async () => {
    cacheRootDirectory = await mkdtemp(join(tmpdir(), 'assai-store-url-cache-'));
  });

  afterEach(async () => {
    await rm(cacheRootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('returns null when the store URL has not been cached', async () => {
    const cache = new AssaiStoreUrlCache({ cacheRootDirectory });

    await expect(cache.get('assai-parangaba')).resolves.toBeNull();
  });

  it('saves and updates resolved store URLs', async () => {
    const cache = new AssaiStoreUrlCache({ cacheRootDirectory });

    const path = await cache.set({
      storeSlug: 'assai-parangaba',
      resolvedOfferUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
      resolvedAtIso: '2026-08-05T10:00:00.000Z',
    });
    await cache.set({
      storeSlug: 'assai-parangaba',
      resolvedOfferUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba-novo',
      resolvedAtIso: '2026-08-05T11:00:00.000Z',
    });

    expect(path).toBe(join(cacheRootDirectory, 'assai/store-url-cache.json'));
    await expect(cache.get('assai-parangaba')).resolves.toBe(
      'https://www.assai.com.br/ofertas/ceara/assai-parangaba-novo',
    );
    await expect(cache.load()).resolves.toEqual({
      version: 1,
      entries: [
        {
          storeSlug: 'assai-parangaba',
          resolvedOfferUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba-novo',
          resolvedAtIso: '2026-08-05T11:00:00.000Z',
        },
      ],
    });
  });

  it('rejects invalid entries and malformed cache files', async () => {
    const cache = new AssaiStoreUrlCache({ cacheRootDirectory });

    await expect(
      cache.set({
        storeSlug: ' ',
        resolvedOfferUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
        resolvedAtIso: '2026-08-05T10:00:00.000Z',
      }),
    ).rejects.toThrow(AssaiStoreUrlCacheError);
    await expect(
      cache.set({
        storeSlug: 'assai-parangaba',
        resolvedOfferUrl: 'https://www.assai.com.br/loja/assai-parangaba',
        resolvedAtIso: '2026-08-05T10:00:00.000Z',
      }),
    ).rejects.toThrow(AssaiStoreUrlCacheError);

    await mkdir(join(cacheRootDirectory, 'assai'), { recursive: true });
    await writeFile(join(cacheRootDirectory, 'assai/store-url-cache.json'), '[]');

    await expect(cache.load()).rejects.toThrow(AssaiStoreUrlCacheError);
  });
});
