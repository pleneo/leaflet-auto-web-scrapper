import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type {
  SuperDoPovoBooklet,
  SuperDoPovoBookletProvider,
  SuperDoPovoShop,
  SuperDoPovoShopCatalogProvider,
} from './superdopovo-api-types';
import type { SingleShopSuperDoPovoLeafletExtractor } from './superdopovo-playwright-extraction';
import { SuperDoPovoPlaywrightExtractionService } from './superdopovo-playwright-extraction';

describe('SuperDoPovoPlaywrightExtractionService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses Playwright for the default shop and API booklet data for the remaining shops', async () => {
    const defaultShop = createShop(24, 'Serrinha');
    const otherShop = createShop(57, 'Cambeba');
    const defaultBooklet = createBooklet(1609, 24, ['https://img.test/default-1.jpg']);
    const otherBooklet = createBooklet(1700, 57, [
      'https://img.test/other-1.jpg',
      'https://img.test/other-2.jpg',
    ]);
    const extract = vi.fn<SingleShopSuperDoPovoLeafletExtractor['extract']>().mockResolvedValue({
      leaflets: [
        {
          leafletId: 'superdopovo-1609',
          title: 'Visual Serrinha',
          cardIndex: 0,
          coverImageUrl: defaultBooklet.coverImageUrl,
          images: [
            {
              order: 1,
              imageUrl: 'https://img.test/default-1.jpg',
            },
          ],
        },
      ],
    });
    const extractor: SingleShopSuperDoPovoLeafletExtractor = {
      extract,
    };
    const service = new SuperDoPovoPlaywrightExtractionService(
      createShopCatalogProvider([defaultShop, otherShop]),
      createBookletProvider(
        new Map([
          [24, [defaultBooklet]],
          [57, [otherBooklet]],
        ]),
      ),
      extractor,
      {
        nowIso: () => '2026-07-23T10:00:00.000Z',
      },
      createLogger(),
    );

    const result = await service.extract({
      siteBaseUrl: 'https://loja.superdopovo.com.br',
      defaultShopId: 24,
      viewport: createVisualViewport({
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      }),
      timeoutMs: 30_000,
      shopTimeoutMs: 5_000,
      maxShopAttempts: 1,
      settleDelayMs: 0,
      visualDataset: {
        runId: 'run-1',
        split: 'unassigned',
      },
    });

    expect(extract).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://loja.superdopovo.com.br/booklets',
        shop: defaultShop,
        expectedBooklets: [defaultBooklet],
        visualDataset: {
          runId: 'run-1',
          split: 'unassigned',
        },
      }),
    );
    expect(result.shops).toHaveLength(2);
    expect(result.shops[0]?.leaflets[0]?.title).toBe('Visual Serrinha');
    expect(result.shops[1]?.leaflets[0]?.images).toEqual([
      {
        order: 1,
        imageUrl: 'https://img.test/other-1.jpg',
      },
      {
        order: 2,
        imageUrl: 'https://img.test/other-2.jpg',
      },
    ]);
    expect(result.failedShops).toEqual([]);
  });

  it('records failed shops without stopping the full extraction', async () => {
    const defaultShop = createShop(24, 'Serrinha');
    const failedShop = createShop(57, 'Cambeba');
    const service = new SuperDoPovoPlaywrightExtractionService(
      createShopCatalogProvider([defaultShop, failedShop]),
      {
        listBooklets: vi.fn((shopId: number) => {
          if (shopId === 57) {
            return Promise.reject(new Error('Request failed.'));
          }

          return Promise.resolve([createBooklet(1609, 24, ['https://img.test/default-1.jpg'])]);
        }),
      },
      {
        extract: vi.fn().mockResolvedValue({
          leaflets: [],
        }),
      },
      {
        nowIso: () => '2026-07-23T10:00:00.000Z',
      },
      createLogger(),
    );

    const result = await service.extract({
      siteBaseUrl: 'https://loja.superdopovo.com.br',
      defaultShopId: 24,
      viewport: createVisualViewport({
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      }),
      timeoutMs: 30_000,
      shopTimeoutMs: 5_000,
      maxShopAttempts: 1,
      settleDelayMs: 0,
    });

    expect(result.shops).toHaveLength(1);
    expect(result.failedShops).toEqual([
      expect.objectContaining({
        shop: failedShop,
        attempts: 1,
        errorMessage: 'Request failed.',
      }),
    ]);
  });

  it('rejects invalid extraction input values', async () => {
    const service = createService({
      shops: [createShop(24, 'Serrinha')],
      bookletsByShop: new Map([[24, []]]),
    });

    await expect(
      service.extract({
        ...createExtractionInput(),
        siteBaseUrl: 'invalid',
      }),
    ).rejects.toThrow('siteBaseUrl must be absolute and valid.');
    await expect(
      service.extract({
        ...createExtractionInput(),
        defaultShopId: 0,
      }),
    ).rejects.toThrow('defaultShopId must be a positive integer.');
    await expect(
      service.extract({
        ...createExtractionInput(),
        timeoutMs: 0,
      }),
    ).rejects.toThrow('timeoutMs must be a positive integer.');
    await expect(
      service.extract({
        ...createExtractionInput(),
        shopTimeoutMs: 0,
      }),
    ).rejects.toThrow('shopTimeoutMs must be a positive integer.');
    await expect(
      service.extract({
        ...createExtractionInput(),
        maxShopAttempts: 0,
      }),
    ).rejects.toThrow('maxShopAttempts must be a positive integer.');
    await expect(
      service.extract({
        ...createExtractionInput(),
        settleDelayMs: -1,
      }),
    ).rejects.toThrow('settleDelayMs must be a non-negative integer.');
  });

  it('fails when the default shop is missing from the catalog', async () => {
    const service = createService({
      shops: [createShop(57, 'Cambeba')],
      bookletsByShop: new Map([[57, []]]),
    });

    await expect(service.extract(createExtractionInput())).rejects.toThrow(
      'Super do Povo default shop 24 was not found in the shop catalog.',
    );
  });

  it('records timed out shop booklet discovery attempts', async () => {
    vi.useFakeTimers();
    const defaultShop = createShop(24, 'Serrinha');
    const timedOutShop = createShop(57, 'Cambeba');
    const service = new SuperDoPovoPlaywrightExtractionService(
      createShopCatalogProvider([defaultShop, timedOutShop]),
      {
        listBooklets: vi.fn((shopId: number) => {
          if (shopId === 57) {
            return new Promise<readonly SuperDoPovoBooklet[]>(() => undefined);
          }

          return Promise.resolve([]);
        }),
      },
      {
        extract: vi.fn().mockResolvedValue({
          leaflets: [],
        }),
      },
      {
        nowIso: () => '2026-07-23T10:00:00.000Z',
      },
      createLogger(),
    );

    const resultPromise = service.extract({
      ...createExtractionInput(),
      shopTimeoutMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(resultPromise).resolves.toMatchObject({
      failedShops: [
        {
          shop: timedOutShop,
          attempts: 1,
          errorMessage: 'Super do Povo shop 57 booklet discovery timed out.',
        },
      ],
    });
  });

  it('records unexpected non-error booklet discovery failures', async () => {
    const defaultShop = createShop(24, 'Serrinha');
    const failedShop = createShop(57, 'Cambeba');
    const service = new SuperDoPovoPlaywrightExtractionService(
      createShopCatalogProvider([defaultShop, failedShop]),
      {
        listBooklets: vi.fn((shopId: number) => {
          if (shopId === 57) {
            // This intentionally covers defensive handling for non-Error promise rejections.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            return Promise.reject('Request failed.');
          }

          return Promise.resolve([]);
        }),
      },
      {
        extract: vi.fn().mockResolvedValue({
          leaflets: [],
        }),
      },
      {
        nowIso: () => '2026-07-23T10:00:00.000Z',
      },
      createLogger(),
    );

    await expect(service.extract(createExtractionInput())).resolves.toMatchObject({
      failedShops: [
        {
          shop: failedShop,
          attempts: 1,
          errorMessage: 'Unexpected Super do Povo booklet discovery failure.',
        },
      ],
    });
  });

  it('runs the visual extractor with no expected booklets when default discovery fails', async () => {
    const defaultShop = createShop(24, 'Serrinha');
    const extract = vi.fn<SingleShopSuperDoPovoLeafletExtractor['extract']>().mockResolvedValue({
      leaflets: [],
    });
    const service = new SuperDoPovoPlaywrightExtractionService(
      createShopCatalogProvider([defaultShop]),
      {
        listBooklets: vi.fn(() => Promise.reject(new Error('Request failed.'))),
      },
      {
        extract,
      },
      {
        nowIso: () => '2026-07-23T10:00:00.000Z',
      },
      createLogger(),
    );

    await service.extract(createExtractionInput());

    expect(extract).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedBooklets: [],
      }),
    );
  });
});

function createService(input: {
  readonly shops: readonly SuperDoPovoShop[];
  readonly bookletsByShop: ReadonlyMap<number, readonly SuperDoPovoBooklet[]>;
}): SuperDoPovoPlaywrightExtractionService {
  return new SuperDoPovoPlaywrightExtractionService(
    createShopCatalogProvider(input.shops),
    createBookletProvider(input.bookletsByShop),
    {
      extract: vi.fn().mockResolvedValue({
        leaflets: [],
      }),
    },
    {
      nowIso: () => '2026-07-23T10:00:00.000Z',
    },
    createLogger(),
  );
}

function createExtractionInput(): Parameters<SuperDoPovoPlaywrightExtractionService['extract']>[0] {
  return {
    siteBaseUrl: 'https://loja.superdopovo.com.br',
    defaultShopId: 24,
    viewport: createVisualViewport({
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
    }),
    timeoutMs: 30_000,
    shopTimeoutMs: 5_000,
    maxShopAttempts: 1,
    settleDelayMs: 0,
  };
}

function createShop(shopId: number, name: string): SuperDoPovoShop {
  return {
    shopId,
    name,
    address: {
      zipcode: '',
      street: '',
      number: '',
      neighborhood: '',
      city: 'Fortaleza',
      state: 'CE',
    },
  };
}

function createBooklet(
  bookletId: number,
  shopId: number,
  imageUrls: readonly string[],
): SuperDoPovoBooklet {
  return {
    bookletId,
    name: `Booklet ${String(bookletId)}`,
    startDateIso: null,
    endDateIso: null,
    coverImageUrl: imageUrls[0] ?? '',
    imageUrls,
    shopId,
  };
}

function createShopCatalogProvider(
  shops: readonly SuperDoPovoShop[],
): SuperDoPovoShopCatalogProvider {
  return {
    listShops: vi.fn().mockResolvedValue(shops),
  };
}

function createBookletProvider(
  bookletsByShop: ReadonlyMap<number, readonly SuperDoPovoBooklet[]>,
): SuperDoPovoBookletProvider {
  return {
    listBooklets: vi.fn((shopId: number) => Promise.resolve(bookletsByShop.get(shopId) ?? [])),
  };
}

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}
