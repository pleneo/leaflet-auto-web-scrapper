import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  SuperDoPovoBooklet,
  SuperDoPovoBookletProvider,
  SuperDoPovoShop,
  SuperDoPovoShopCatalogProvider,
} from './superdopovo-api-types';
import {
  SuperDoPovoApiExtractionError,
  SuperDoPovoApiExtractionService,
} from './superdopovo-api-extraction';

describe('SuperDoPovoApiExtractionService', () => {
  it('extracts API leaflets for every shop', async () => {
    const service = createService({
      shopCatalogProvider: new FakeShopCatalogProvider([createShop(24)]),
      bookletProvider: new FakeBookletProvider([[24, [createBooklet(1609)]]]),
    });

    const result = await service.extract({
      siteBaseUrl: 'https://loja.superdopovo.com.br/',
    });

    expect(result).toEqual({
      source: 'superdopovo-api',
      extractedAtIso: '2026-08-06T10:00:00.000Z',
      shops: [
        {
          shop: createShop(24),
          sourceUrl: 'https://loja.superdopovo.com.br/booklets',
          leaflets: [
            {
              leafletId: 'superdopovo-1609',
              title: 'Booklet 1609',
              cardIndex: 0,
              coverImageUrl: 'https://cdn.example.com/1609-cover.jpeg',
              images: [
                {
                  order: 1,
                  imageUrl: 'https://cdn.example.com/1609-cover.jpeg',
                },
                {
                  order: 2,
                  imageUrl: 'https://cdn.example.com/1609-page-2.jpeg',
                },
              ],
            },
          ],
        },
      ],
      failedShops: [],
    });
  });

  it('keeps extracting other shops when one shop fails', async () => {
    const logger = new RecordingLogger();
    const service = createService({
      shopCatalogProvider: new FakeShopCatalogProvider([createShop(24), createShop(57)]),
      bookletProvider: new FakeBookletProvider([[57, [createBooklet(1700)]]], [24]),
      logger,
    });

    const result = await service.extract({
      siteBaseUrl: 'https://loja.superdopovo.com.br',
    });

    expect(result.shops).toHaveLength(1);
    expect(result.failedShops).toEqual([
      {
        shop: createShop(24),
        sourceUrl: 'https://loja.superdopovo.com.br/booklets',
        errorMessage: 'Booklet request failed.',
      },
    ]);
    expect(logger.warnMessages).toContain('Super do Povo API booklet fetch failed.');
  });

  it('logs unexpected non-error shop failures defensively', async () => {
    const logger = new RecordingLogger();
    const service = createService({
      shopCatalogProvider: new FakeShopCatalogProvider([createShop(24)]),
      bookletProvider: new NonErrorBookletProvider(),
      logger,
    });

    const result = await service.extract({
      siteBaseUrl: 'https://loja.superdopovo.com.br',
    });

    expect(result.failedShops[0]?.errorMessage).toBe('Unexpected Super do Povo API failure.');
  });

  it('rejects invalid input', async () => {
    const service = createService({
      shopCatalogProvider: new FakeShopCatalogProvider([]),
      bookletProvider: new FakeBookletProvider([]),
    });

    await expect(
      service.extract({
        siteBaseUrl: 'not-a-url',
      }),
    ).rejects.toThrow(SuperDoPovoApiExtractionError);
  });
});

function createService(input: {
  readonly shopCatalogProvider: SuperDoPovoShopCatalogProvider;
  readonly bookletProvider: SuperDoPovoBookletProvider;
  readonly logger?: Logger;
}): SuperDoPovoApiExtractionService {
  return new SuperDoPovoApiExtractionService(
    input.shopCatalogProvider,
    input.bookletProvider,
    new FixedClock(),
    input.logger ?? new NullLogger(),
  );
}

function createShop(shopId: number): SuperDoPovoShop {
  return {
    shopId,
    name: `Shop ${String(shopId)}`,
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

function createBooklet(bookletId: number): SuperDoPovoBooklet {
  return {
    bookletId,
    name: `Booklet ${String(bookletId)}`,
    startDateIso: '2026-08-06',
    endDateIso: '2026-08-07',
    coverImageUrl: `https://cdn.example.com/${String(bookletId)}-cover.jpeg`,
    imageUrls: [
      `https://cdn.example.com/${String(bookletId)}-cover.jpeg`,
      `https://cdn.example.com/${String(bookletId)}-page-2.jpeg`,
    ],
    shopId: 24,
  };
}

class FakeShopCatalogProvider implements SuperDoPovoShopCatalogProvider {
  private readonly shops: readonly SuperDoPovoShop[];

  constructor(shops: readonly SuperDoPovoShop[]) {
    this.shops = shops;
  }

  listShops(): Promise<readonly SuperDoPovoShop[]> {
    return Promise.resolve(this.shops);
  }
}

class FakeBookletProvider implements SuperDoPovoBookletProvider {
  private readonly bookletsByShop: ReadonlyMap<number, readonly SuperDoPovoBooklet[]>;

  private readonly failedShopIds: ReadonlySet<number>;

  constructor(
    entries: readonly (readonly [number, readonly SuperDoPovoBooklet[]])[],
    failedShopIds: readonly number[] = [],
  ) {
    this.bookletsByShop = new Map(entries);
    this.failedShopIds = new Set(failedShopIds);
  }

  listBooklets(shopId: number): Promise<readonly SuperDoPovoBooklet[]> {
    if (this.failedShopIds.has(shopId)) {
      return Promise.reject(new Error('Booklet request failed.'));
    }

    return Promise.resolve(this.bookletsByShop.get(shopId) ?? []);
  }
}

class NonErrorBookletProvider implements SuperDoPovoBookletProvider {
  listBooklets(shopId: number): Promise<readonly SuperDoPovoBooklet[]> {
    void shopId;

    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- covers defensive non-Error API rejection.
    return Promise.reject('invalid rejection');
  }
}

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-08-06T10:00:00.000Z';
  }
}

class NullLogger implements Logger {
  debug(message: string): void {
    void message;
  }

  info(message: string): void {
    void message;
  }

  warn(message: string): void {
    void message;
  }

  error(message: string): void {
    void message;
  }
}

class RecordingLogger extends NullLogger {
  readonly warnMessages: string[] = [];

  override warn(message: string): void {
    this.warnMessages.push(message);
  }
}
