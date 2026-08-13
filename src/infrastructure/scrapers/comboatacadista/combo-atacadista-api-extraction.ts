import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import {
  parseComboAtacadistaLeafletCards,
  parseComboAtacadistaLeafletImageUrls,
  parseComboAtacadistaPageTitle,
  type ComboAtacadistaPageFetcher,
} from './combo-atacadista-api-client';
import {
  type ComboAtacadistaExtractedUnit,
  type ComboAtacadistaFailedUnit,
  type ExtractedComboAtacadistaImageGalleryLeaflet,
} from './combo-atacadista-image-gallery-leaflet';
import { COMBO_ATACADISTA_UNIT } from './combo-atacadista-targets';

export interface ComboAtacadistaApiExtractionInput {
  readonly offersUrl: string;
}

export interface ComboAtacadistaApiExtractionResult {
  readonly source: 'comboatacadista-api';
  readonly extractedAtIso: string;
  readonly units: readonly ComboAtacadistaExtractedUnit[];
  readonly failedUnits: readonly ComboAtacadistaFailedUnit[];
}

export class ComboAtacadistaApiExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComboAtacadistaApiExtractionError';
  }
}

export class ComboAtacadistaApiExtractionService {
  private readonly pageFetcher: ComboAtacadistaPageFetcher;

  private readonly clock: Clock;

  private readonly logger: Logger;

  constructor(pageFetcher: ComboAtacadistaPageFetcher, clock: Clock, logger: Logger) {
    this.pageFetcher = pageFetcher;
    this.clock = clock;
    this.logger = logger;
  }

  async extract(
    input: ComboAtacadistaApiExtractionInput,
  ): Promise<ComboAtacadistaApiExtractionResult> {
    validateInput(input);

    try {
      const offersHtml = await this.pageFetcher.fetchHtml(input.offersUrl);
      const cards = parseComboAtacadistaLeafletCards(input.offersUrl, offersHtml);

      if (cards.length === 0) {
        throw new ComboAtacadistaApiExtractionError(
          'Combo Atacadista offers page did not expose leaflet cards.',
        );
      }

      const leaflets: ExtractedComboAtacadistaImageGalleryLeaflet[] = [];

      for (const card of cards) {
        const leafletHtml = await this.pageFetcher.fetchHtml(card.href);
        const imageUrls = parseComboAtacadistaLeafletImageUrls(card.href, leafletHtml);

        if (imageUrls.length === 0) {
          throw new ComboAtacadistaApiExtractionError(
            `Combo Atacadista leaflet page did not expose images: ${card.href}`,
          );
        }

        this.logger.info('Fetched Combo Atacadista image leaflet through API path.', {
          leafletId: card.leafletId,
          title: card.title,
          imageCount: imageUrls.length,
        });
        const coverImageUrl = imageUrls[0];

        /* v8 ignore next 5 */
        if (coverImageUrl === undefined) {
          throw new ComboAtacadistaApiExtractionError(
            `Combo Atacadista leaflet page did not expose images: ${card.href}`,
          );
        }

        leaflets.push({
          leafletId: card.leafletId,
          title: parseComboAtacadistaPageTitle(leafletHtml, card.href),
          sourcePageUrl: card.href,
          coverImageUrl,
          imageUrls,
          validUntilIso: card.validUntilIso,
        });
      }

      return {
        source: 'comboatacadista-api',
        extractedAtIso: this.clock.nowIso(),
        units: [
          {
            unitId: COMBO_ATACADISTA_UNIT.unitId,
            unitName: COMBO_ATACADISTA_UNIT.unitName,
            sourceUrl: input.offersUrl,
            leaflets,
          },
        ],
        failedUnits: [],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : /* v8 ignore next 1 */ 'Unexpected Combo Atacadista API failure.';
      this.logger.warn('Combo Atacadista API extraction failed.', {
        sourceUrl: input.offersUrl,
        errorMessage,
      });

      return {
        source: 'comboatacadista-api',
        extractedAtIso: this.clock.nowIso(),
        units: [],
        failedUnits: [
          {
            unitId: COMBO_ATACADISTA_UNIT.unitId,
            unitName: COMBO_ATACADISTA_UNIT.unitName,
            sourceUrl: input.offersUrl,
            errorMessage,
          },
        ],
      };
    }
  }
}

function validateInput(input: ComboAtacadistaApiExtractionInput): void {
  if (input.offersUrl.trim().length === 0) {
    throw new ComboAtacadistaApiExtractionError('offersUrl cannot be blank.');
  }
}
