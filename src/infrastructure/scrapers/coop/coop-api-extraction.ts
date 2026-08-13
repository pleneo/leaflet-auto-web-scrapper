import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import {
  parseCoopLeafletCards,
  parseCoopLeafletImageUrls,
  parseCoopPageTitle,
  parseCoopStorePageLinks,
  type CoopPageFetcher,
} from './coop-api-client';
import {
  type CoopExtractedUnit,
  type CoopFailedUnit,
  type ExtractedCoopImageGalleryLeaflet,
} from './coop-image-gallery-leaflet';
import { type CoopMonitoredStore, listCoopMonitoredStores } from './coop-targets';

export interface CoopApiExtractionInput {
  readonly offersUrl: string;
  readonly monitoredStores?: readonly CoopMonitoredStore[];
}

export interface CoopApiExtractionResult {
  readonly source: 'coop-api';
  readonly extractedAtIso: string;
  readonly units: readonly CoopExtractedUnit[];
  readonly failedUnits: readonly CoopFailedUnit[];
}

export class CoopApiExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoopApiExtractionError';
  }
}

export class CoopApiExtractionService {
  private readonly pageFetcher: CoopPageFetcher;

  private readonly clock: Clock;

  private readonly logger: Logger;

  constructor(pageFetcher: CoopPageFetcher, clock: Clock, logger: Logger) {
    this.pageFetcher = pageFetcher;
    this.clock = clock;
    this.logger = logger;
  }

  async extract(input: CoopApiExtractionInput): Promise<CoopApiExtractionResult> {
    validateInput(input);

    const monitoredStores = input.monitoredStores ?? listCoopMonitoredStores();
    const extractedAtIso = this.clock.nowIso();
    const units: CoopExtractedUnit[] = [];
    const failedUnits: CoopFailedUnit[] = [];

    let offersHtml: string;

    try {
      offersHtml = await this.pageFetcher.fetchHtml(input.offersUrl);
    } catch (error) {
      const errorMessage = (error as Error).message;

      return {
        source: 'coop-api',
        extractedAtIso,
        units: [],
        failedUnits: monitoredStores.map((store) =>
          createFailedUnit(store, input.offersUrl, errorMessage),
        ),
      };
    }

    const storeLinks = parseCoopStorePageLinks(input.offersUrl, offersHtml, monitoredStores);

    for (const store of monitoredStores) {
      try {
        const storeLink = storeLinks.find((candidate) => candidate.storeSlug === store.storeSlug);

        if (storeLink === undefined) {
          throw new CoopApiExtractionError(
            `Coop offers page did not expose monitored store: ${store.storeSlug}.`,
          );
        }

        const storeHtml = await this.pageFetcher.fetchHtml(storeLink.href);
        const cards = parseCoopLeafletCards(storeLink.href, storeHtml);

        if (cards.length === 0) {
          throw new CoopApiExtractionError(
            `Coop store page did not expose leaflet cards: ${storeLink.href}`,
          );
        }

        const leaflets: ExtractedCoopImageGalleryLeaflet[] = [];

        for (const card of cards) {
          const leafletHtml = await this.pageFetcher.fetchHtml(card.href);
          const imageUrls = parseCoopLeafletImageUrls(card.href, leafletHtml);

          if (imageUrls.length === 0) {
            throw new CoopApiExtractionError(
              `Coop leaflet page did not expose images: ${card.href}`,
            );
          }

          const coverImageUrl = imageUrls[0];

          /* v8 ignore next 5 */
          if (coverImageUrl === undefined) {
            throw new CoopApiExtractionError(
              `Coop leaflet page did not expose images: ${card.href}`,
            );
          }

          this.logger.info('Fetched Coop image leaflet through API path.', {
            storeSlug: store.storeSlug,
            leafletId: card.leafletId,
            imageCount: imageUrls.length,
          });

          leaflets.push({
            leafletId: card.leafletId,
            title: parseCoopPageTitle(leafletHtml, card.href),
            sourcePageUrl: card.href,
            coverImageUrl,
            imageUrls,
            validUntilIso: card.validUntilIso,
          });
        }

        units.push({
          unitId: store.storeSlug,
          unitName: store.storeName,
          sourceUrl: storeLink.href,
          leaflets,
        });
      } catch (error) {
        const errorMessage = (error as Error).message;
        this.logger.warn('Coop API store extraction failed.', {
          storeSlug: store.storeSlug,
          storeName: store.storeName,
          errorMessage,
        });
        failedUnits.push(createFailedUnit(store, store.finalPageUrl, errorMessage));
      }
    }

    return {
      source: 'coop-api',
      extractedAtIso,
      units,
      failedUnits,
    };
  }
}

function createFailedUnit(
  store: CoopMonitoredStore,
  sourceUrl: string,
  errorMessage: string,
): CoopFailedUnit {
  return {
    unitId: store.storeSlug,
    unitName: store.storeName,
    sourceUrl,
    errorMessage,
  };
}

function validateInput(input: CoopApiExtractionInput): void {
  if (input.offersUrl.trim().length === 0) {
    throw new CoopApiExtractionError('offersUrl cannot be blank.');
  }
}
