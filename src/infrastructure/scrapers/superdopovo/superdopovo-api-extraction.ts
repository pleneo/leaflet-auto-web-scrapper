import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type { ExtractedLeaflet } from '../../../domain/leaflet/extracted-leaflet';
import type {
  SuperDoPovoBooklet,
  SuperDoPovoBookletProvider,
  SuperDoPovoShop,
  SuperDoPovoShopCatalogProvider,
} from './superdopovo-api-types';

export interface SuperDoPovoApiExtractedShop {
  readonly shop: SuperDoPovoShop;
  readonly sourceUrl: string;
  readonly leaflets: readonly ExtractedLeaflet[];
}

export interface SuperDoPovoApiFailedShop {
  readonly shop: SuperDoPovoShop;
  readonly sourceUrl: string;
  readonly errorMessage: string;
}

export interface SuperDoPovoApiExtractionResult {
  readonly source: 'superdopovo-api';
  readonly extractedAtIso: string;
  readonly shops: readonly SuperDoPovoApiExtractedShop[];
  readonly failedShops: readonly SuperDoPovoApiFailedShop[];
}

export interface SuperDoPovoApiExtractionInput {
  readonly siteBaseUrl: string;
}

export class SuperDoPovoApiExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuperDoPovoApiExtractionError';
  }
}

export class SuperDoPovoApiExtractionService {
  private readonly shopCatalogProvider: SuperDoPovoShopCatalogProvider;

  private readonly bookletProvider: SuperDoPovoBookletProvider;

  private readonly clock: Clock;

  private readonly logger: Logger;

  constructor(
    shopCatalogProvider: SuperDoPovoShopCatalogProvider,
    bookletProvider: SuperDoPovoBookletProvider,
    clock: Clock,
    logger: Logger,
  ) {
    this.shopCatalogProvider = shopCatalogProvider;
    this.bookletProvider = bookletProvider;
    this.clock = clock;
    this.logger = logger;
  }

  async extract(input: SuperDoPovoApiExtractionInput): Promise<SuperDoPovoApiExtractionResult> {
    validateInput(input);

    const sourceUrl = buildLeafletsUrl(input.siteBaseUrl);
    const shops = await this.shopCatalogProvider.listShops();
    const extractedShops: SuperDoPovoApiExtractedShop[] = [];
    const failedShops: SuperDoPovoApiFailedShop[] = [];

    for (const shop of shops) {
      try {
        const booklets = await this.bookletProvider.listBooklets(shop.shopId);
        this.logger.info('Fetched Super do Povo API booklets.', {
          shopId: shop.shopId,
          shopName: shop.name,
          leaflets: booklets.length,
        });
        extractedShops.push({
          shop,
          sourceUrl,
          leaflets: booklets.map(createExtractedLeafletFromApi),
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unexpected Super do Povo API failure.';
        this.logger.warn('Super do Povo API booklet fetch failed.', {
          shopId: shop.shopId,
          shopName: shop.name,
          errorMessage,
        });
        failedShops.push({
          shop,
          sourceUrl,
          errorMessage,
        });
      }
    }

    return {
      source: 'superdopovo-api',
      extractedAtIso: this.clock.nowIso(),
      shops: extractedShops,
      failedShops,
    };
  }
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

function buildLeafletsUrl(siteBaseUrl: string): string {
  return `${siteBaseUrl.replace(/\/+$/, '')}/booklets`;
}

function validateInput(input: SuperDoPovoApiExtractionInput): void {
  try {
    new URL(input.siteBaseUrl);
  } catch {
    throw new SuperDoPovoApiExtractionError('siteBaseUrl must be absolute and valid.');
  }
}
