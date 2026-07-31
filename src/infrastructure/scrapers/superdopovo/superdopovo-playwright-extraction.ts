import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { ExtractedLeaflet } from '../../../domain/leaflet/extracted-leaflet';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type {
  SuperDoPovoBooklet,
  SuperDoPovoBookletProvider,
  SuperDoPovoShop,
  SuperDoPovoShopCatalogProvider,
} from './superdopovo-api-types';
import type { ExtractSuperDoPovoLeafletsInput } from './superdopovo-leaflet-extractor';

export interface SuperDoPovoPlaywrightExtractedShop {
  readonly shop: SuperDoPovoShop;
  readonly sourceUrl: string;
  readonly leaflets: readonly ExtractedLeaflet[];
  readonly attempts: number;
}

export interface SuperDoPovoPlaywrightFailedShop {
  readonly shop: SuperDoPovoShop;
  readonly sourceUrl: string;
  readonly attempts: number;
  readonly errorMessage: string;
}

export interface SuperDoPovoPlaywrightExtractionResult {
  readonly source: 'superdopovo-playwright';
  readonly extractedAtIso: string;
  readonly shops: readonly SuperDoPovoPlaywrightExtractedShop[];
  readonly failedShops: readonly SuperDoPovoPlaywrightFailedShop[];
}

export interface SuperDoPovoPlaywrightExtractionInput {
  readonly siteBaseUrl: string;
  readonly defaultShopId: number;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly shopTimeoutMs: number;
  readonly maxShopAttempts: number;
  readonly settleDelayMs: number;
  readonly visualDataset?: SuperDoPovoPlaywrightVisualDatasetInput;
}

export interface SuperDoPovoPlaywrightVisualDatasetInput {
  readonly runId: string;
  readonly split: DatasetSplit;
}

export interface SingleShopSuperDoPovoLeafletExtractor {
  extract(input: ExtractSuperDoPovoLeafletsInput): Promise<{
    readonly leaflets: readonly ExtractedLeaflet[];
  }>;
}

export class SuperDoPovoPlaywrightExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuperDoPovoPlaywrightExtractionError';
  }
}

export class SuperDoPovoPlaywrightExtractionService {
  private readonly shopCatalogProvider: SuperDoPovoShopCatalogProvider;

  private readonly bookletProvider: SuperDoPovoBookletProvider;

  private readonly leafletExtractor: SingleShopSuperDoPovoLeafletExtractor;

  private readonly clock: Clock;

  private readonly logger: Logger;

  constructor(
    shopCatalogProvider: SuperDoPovoShopCatalogProvider,
    bookletProvider: SuperDoPovoBookletProvider,
    leafletExtractor: SingleShopSuperDoPovoLeafletExtractor,
    clock: Clock,
    logger: Logger,
  ) {
    this.shopCatalogProvider = shopCatalogProvider;
    this.bookletProvider = bookletProvider;
    this.leafletExtractor = leafletExtractor;
    this.clock = clock;
    this.logger = logger;
  }

  async extract(
    input: SuperDoPovoPlaywrightExtractionInput,
  ): Promise<SuperDoPovoPlaywrightExtractionResult> {
    validateInput(input);

    const sourceUrl = buildLeafletsUrl(input.siteBaseUrl);
    const shops = await this.shopCatalogProvider.listShops();
    const defaultShop = findDefaultShop(shops, input.defaultShopId);
    const extractedShops: SuperDoPovoPlaywrightExtractedShop[] = [];
    const failedShops: SuperDoPovoPlaywrightFailedShop[] = [];
    const bookletsByShop = new Map<number, readonly SuperDoPovoBooklet[]>();

    for (const shop of shops) {
      this.logger.info('Starting Super do Povo shop booklet discovery.', {
        shopId: shop.shopId,
        shopName: shop.name,
        sourceUrl,
      });

      const result = await this.listBookletsWithRetry(input, shop, sourceUrl);

      if (result.status === 'failed') {
        failedShops.push({
          shop,
          sourceUrl,
          attempts: result.attempts,
          errorMessage: result.errorMessage,
        });
        continue;
      }

      if (result.booklets.length === 0) {
        this.logger.info('No Super do Povo leaflets found for shop.', {
          shopId: shop.shopId,
          shopName: shop.name,
          sourceUrl,
          attempts: result.attempts,
        });
      }

      bookletsByShop.set(shop.shopId, result.booklets);
    }

    const visualDefaultBooklets = bookletsByShop.get(defaultShop.shopId) ?? [];
    const visualResult = await this.leafletExtractor.extract(
      createVisualExtractionInput(input, defaultShop, sourceUrl, visualDefaultBooklets),
    );
    extractedShops.push({
      shop: defaultShop,
      sourceUrl,
      leaflets: visualResult.leaflets,
      attempts: 1,
    });

    for (const shop of shops) {
      if (shop.shopId === defaultShop.shopId) {
        continue;
      }

      const booklets = bookletsByShop.get(shop.shopId);

      if (booklets === undefined) {
        continue;
      }

      extractedShops.push({
        shop,
        sourceUrl,
        leaflets: booklets.map(createExtractedLeafletFromApi),
        attempts: 1,
      });
    }

    return {
      source: 'superdopovo-playwright',
      extractedAtIso: this.clock.nowIso(),
      shops: extractedShops,
      failedShops,
    };
  }

  private async listBookletsWithRetry(
    input: SuperDoPovoPlaywrightExtractionInput,
    shop: SuperDoPovoShop,
    sourceUrl: string,
  ): Promise<
    | {
        readonly status: 'succeeded';
        readonly attempts: number;
        readonly booklets: readonly SuperDoPovoBooklet[];
      }
    | {
        readonly status: 'failed';
        readonly attempts: number;
        readonly errorMessage: string;
      }
  > {
    let lastErrorMessage = 'Unknown Super do Povo booklet discovery failure.';

    for (let attempt = 1; attempt <= input.maxShopAttempts; attempt += 1) {
      try {
        const booklets = await withTimeout(
          this.bookletProvider.listBooklets(shop.shopId),
          input.shopTimeoutMs,
          `Super do Povo shop ${String(shop.shopId)} booklet discovery timed out.`,
        );

        this.logger.info('Finished Super do Povo shop booklet discovery.', {
          shopId: shop.shopId,
          shopName: shop.name,
          leaflets: booklets.length,
          images: booklets.reduce((total, booklet) => total + booklet.imageUrls.length, 0),
          attempts: attempt,
        });

        return {
          status: 'succeeded',
          attempts: attempt,
          booklets,
        };
      } catch (error) {
        if (error instanceof Error) {
          lastErrorMessage = error.message;
        } else {
          lastErrorMessage = 'Unexpected Super do Povo booklet discovery failure.';
        }
        this.logger.warn('Super do Povo shop booklet discovery attempt failed.', {
          shopId: shop.shopId,
          shopName: shop.name,
          sourceUrl,
          attempt,
        });
      }
    }

    return {
      status: 'failed',
      attempts: input.maxShopAttempts,
      errorMessage: lastErrorMessage,
    };
  }
}

function createVisualExtractionInput(
  input: SuperDoPovoPlaywrightExtractionInput,
  shop: SuperDoPovoShop,
  sourceUrl: string,
  expectedBooklets: readonly SuperDoPovoBooklet[],
): ExtractSuperDoPovoLeafletsInput {
  const baseInput = {
    homeUrl: input.siteBaseUrl,
    sourceUrl,
    shop,
    expectedBooklets,
    viewport: input.viewport,
    timeoutMs: input.timeoutMs,
    settleDelayMs: input.settleDelayMs,
  };

  if (input.visualDataset === undefined) {
    return baseInput;
  }

  return {
    ...baseInput,
    visualDataset: input.visualDataset,
  };
}

function createExtractedLeafletFromApi(
  booklet: SuperDoPovoBooklet,
  index: number,
): ExtractedLeaflet {
  return {
    leafletId: `superdopovo-${String(booklet.bookletId)}`,
    title: booklet.name,
    cardIndex: index,
    coverImageUrl: booklet.coverImageUrl,
    images: booklet.imageUrls.map((imageUrl, imageIndex) => {
      return {
        order: imageIndex + 1,
        imageUrl,
      };
    }),
  };
}

function findDefaultShop(
  shops: readonly SuperDoPovoShop[],
  defaultShopId: number,
): SuperDoPovoShop {
  const defaultShop = shops.find((shop) => shop.shopId === defaultShopId);

  if (defaultShop === undefined) {
    throw new SuperDoPovoPlaywrightExtractionError(
      `Super do Povo default shop ${String(defaultShopId)} was not found in the shop catalog.`,
    );
  }

  return defaultShop;
}

function buildLeafletsUrl(siteBaseUrl: string): string {
  return `${siteBaseUrl.replace(/\/+$/, '')}/booklets`;
}

function validateInput(input: SuperDoPovoPlaywrightExtractionInput): void {
  validateUrl(input.siteBaseUrl);
  validatePositiveInteger(input.defaultShopId, 'defaultShopId');
  validatePositiveInteger(input.timeoutMs, 'timeoutMs');
  validatePositiveInteger(input.shopTimeoutMs, 'shopTimeoutMs');
  validatePositiveInteger(input.maxShopAttempts, 'maxShopAttempts');

  if (!Number.isInteger(input.settleDelayMs) || input.settleDelayMs < 0) {
    throw new SuperDoPovoPlaywrightExtractionError('settleDelayMs must be a non-negative integer.');
  }
}

function validateUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new SuperDoPovoPlaywrightExtractionError('siteBaseUrl must be absolute and valid.');
  }
}

function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SuperDoPovoPlaywrightExtractionError(`${fieldName} must be a positive integer.`);
  }
}

function withTimeout<TValue>(
  promise: Promise<TValue>,
  timeoutMs: number,
  message: string,
): Promise<TValue> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new SuperDoPovoPlaywrightExtractionError(message));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timeout);
      });
  });
}
