import { describe, expect, it, vi } from 'vitest';
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
  it('uses Playwright for the default shop and API booklet data for the remaining shops', async () => {
    const defaultShop = createShop(24, 'Serrinha');
    const otherShop = createShop(57, 'Cambeba');
    const defaultBooklet = createBooklet(1609, 24, ['https://img.test/default-1.jpg']);
    const otherBooklet = createBooklet(1700, 57, [
      'https://img.test/other-1.jpg',
      'https://img.test/other-2.jpg',
    ]);
    const extractor: SingleShopSuperDoPovoLeafletExtractor = {
      extract: vi.fn().mockResolvedValue({
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
      }),
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

    expect(extractor.extract).toHaveBeenCalledWith(
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
        listBooklets: vi.fn(async (shopId: number) => {
          if (shopId === 57) {
            throw new Error('Request failed.');
          }

          return [createBooklet(1609, 24, ['https://img.test/default-1.jpg'])];
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
});

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
    listBooklets: vi.fn(async (shopId: number) => bookletsByShop.get(shopId) ?? []),
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
