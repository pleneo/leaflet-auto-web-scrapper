import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  CaptureVisualDatasetSampleInput,
  VisualDatasetCaptureService,
} from '../../../application/services/visual-dataset-capture-service';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { VisualViewport } from '../../../domain/visual/viewport';
import {
  type ComboAtacadistaExtractedUnit,
  type ComboAtacadistaFailedUnit,
  type ExtractedComboAtacadistaImageGalleryLeaflet,
} from './combo-atacadista-image-gallery-leaflet';
import type {
  ComboAtacadistaLeafletPage,
  ComboAtacadistaLeafletPageFactory,
  ComboAtacadistaLeafletVisualTarget,
} from './combo-atacadista-leaflet-page';
import { COMBO_ATACADISTA_UNIT } from './combo-atacadista-targets';

export type ComboAtacadistaStartUrlMode = 'home' | 'offers-page';

export interface ExtractComboAtacadistaLeafletsInput {
  readonly homeUrl: string;
  readonly offersUrl: string;
  readonly startUrlMode: ComboAtacadistaStartUrlMode;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly settleDelayMs: number;
  readonly visualDataset?: ExtractComboAtacadistaVisualDatasetInput;
}

export interface ExtractComboAtacadistaVisualDatasetInput {
  readonly runId: string;
  readonly split: DatasetSplit;
}

export interface ComboAtacadistaLeafletExtractionResult {
  readonly source: 'comboatacadista-playwright';
  readonly extractedAtIso: string;
  readonly units: readonly ComboAtacadistaExtractedUnit[];
  readonly failedUnits: readonly ComboAtacadistaFailedUnit[];
}

interface ComboAtacadistaVisualDatasetCaptureService {
  captureBeforeAction(
    input: CaptureVisualDatasetSampleInput,
  ): ReturnType<VisualDatasetCaptureService['captureBeforeAction']>;
}

export class ComboAtacadistaLeafletExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComboAtacadistaLeafletExtractionError';
  }
}

export class ComboAtacadistaLeafletExtractor {
  private readonly pageFactory: ComboAtacadistaLeafletPageFactory;

  private readonly clock: Clock;

  private readonly logger: Logger;

  private readonly visualDatasetCaptureService:
    ComboAtacadistaVisualDatasetCaptureService | undefined;

  constructor(
    pageFactory: ComboAtacadistaLeafletPageFactory,
    clock: Clock,
    logger: Logger,
    visualDatasetCaptureService?: ComboAtacadistaVisualDatasetCaptureService,
  ) {
    this.pageFactory = pageFactory;
    this.clock = clock;
    this.logger = logger;
    this.visualDatasetCaptureService = visualDatasetCaptureService;
  }

  async extract(
    input: ExtractComboAtacadistaLeafletsInput,
  ): Promise<ComboAtacadistaLeafletExtractionResult> {
    validateInput(input);

    const page = await this.pageFactory.openPage({
      viewport: input.viewport,
      timeoutMs: input.timeoutMs,
    });

    try {
      const leaflets = await this.extractLeaflets(page, input);

      return {
        source: 'comboatacadista-playwright',
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
          : /* v8 ignore next 1 */ 'Unexpected Combo Atacadista Playwright failure.';
      this.logger.warn('Combo Atacadista Playwright extraction failed.', {
        sourceUrl: input.offersUrl,
        errorMessage,
      });

      return {
        source: 'comboatacadista-playwright',
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
      /* v8 ignore next 3 */
    } finally {
      await page.close();
    }
  }

  private async extractLeaflets(
    page: ComboAtacadistaLeafletPage,
    input: ExtractComboAtacadistaLeafletsInput,
  ): Promise<readonly ExtractedComboAtacadistaImageGalleryLeaflet[]> {
    if (input.startUrlMode === 'home') {
      this.logger.info('Combo Atacadista FSM state entered.', {
        stateName: 'ANCHOR_PAGE',
        sourceUrl: input.homeUrl,
      });
      await page.goto(input.homeUrl);
      await page.waitForTimeout(input.settleDelayMs);
      await this.captureHomeOffersTarget(page, input);
      await page.openHomeOffersPage();
    } else {
      await page.goto(input.offersUrl);
    }

    this.logger.info('Combo Atacadista FSM state entered.', {
      stateName: 'LEAFLETS_PAGE',
      sourceUrl: input.offersUrl,
    });
    await page.waitForOffersPage();
    await page.waitForTimeout(input.settleDelayMs);
    const cards = await page.listLeafletCards();

    if (cards.length === 0) {
      throw new ComboAtacadistaLeafletExtractionError(
        'Combo Atacadista offers page did not expose leaflet cards.',
      );
    }

    const leaflets: ExtractedComboAtacadistaImageGalleryLeaflet[] = [];

    for (const card of cards) {
      await this.captureLeafletCardTarget(page, input, card.cardIndex, card.leafletId, card.title);
      await page.openLeafletCard(card.cardIndex);
      await page.waitForImageGallery();
      await page.waitForTimeout(input.settleDelayMs);
      this.logger.info('Combo Atacadista FSM state entered.', {
        stateName: 'IMAGE_GALLERY',
        leafletId: card.leafletId,
      });
      const imageUrls = await page.listLeafletImageUrls();

      if (imageUrls.length === 0) {
        throw new ComboAtacadistaLeafletExtractionError(
          `Combo Atacadista leaflet page did not expose images: ${card.href}`,
        );
      }

      for (const [imageIndex, imageUrl] of imageUrls.entries()) {
        await this.captureLeafletImageTarget(
          page,
          input,
          card.leafletId,
          card.title,
          imageIndex,
          imageUrl,
        );
      }

      const coverImageUrl = imageUrls[0];

      /* v8 ignore next 5 */
      if (coverImageUrl === undefined) {
        throw new ComboAtacadistaLeafletExtractionError(
          `Combo Atacadista leaflet page did not expose images: ${card.href}`,
        );
      }

      leaflets.push({
        leafletId: card.leafletId,
        title: card.title,
        sourcePageUrl: await page.getCurrentUrl(),
        coverImageUrl,
        imageUrls,
        validUntilIso: card.validUntilIso,
      });

      await page.goto(input.offersUrl);
      await page.waitForOffersPage();
    }

    return leaflets;
  }

  private async captureHomeOffersTarget(
    page: ComboAtacadistaLeafletPage,
    input: ExtractComboAtacadistaLeafletsInput,
  ): Promise<void> {
    const visualTarget = await page.getHomeOffersVisualTarget();
    await this.captureBeforeAction(input, visualTarget, {
      sampleId: createSampleId(input.visualDataset?.runId ?? 'combo', 'home-offers-link'),
      stateName: 'ANCHOR_PAGE',
      label: 'open_leaflets_page_button',
      subject: {
        subjectKind: 'comboatacadista-home-offers-link',
      },
    });
  }

  private async captureLeafletCardTarget(
    page: ComboAtacadistaLeafletPage,
    input: ExtractComboAtacadistaLeafletsInput,
    cardIndex: number,
    leafletId: string,
    leafletTitle: string,
  ): Promise<void> {
    const visualTarget = await page.getLeafletCardVisualTarget(cardIndex);
    await this.captureBeforeAction(input, visualTarget, {
      sampleId: createSampleId(
        input.visualDataset?.runId ?? 'combo',
        `card-${String(cardIndex + 1)}`,
      ),
      stateName: 'LEAFLETS_PAGE',
      label: 'open_leaflet_modal_button',
      subject: {
        subjectKind: 'comboatacadista-leaflet-card',
        cardIndex,
        leafletId,
        leafletTitle,
      },
    });
  }

  private async captureLeafletImageTarget(
    page: ComboAtacadistaLeafletPage,
    input: ExtractComboAtacadistaLeafletsInput,
    leafletId: string,
    leafletTitle: string,
    imageIndex: number,
    imageUrl: string,
  ): Promise<void> {
    const visualTarget = await page.getLeafletImageVisualTarget(imageIndex);
    await this.captureBeforeAction(input, visualTarget, {
      sampleId: createSampleId(
        input.visualDataset?.runId ?? 'combo',
        `${leafletId}-image-${String(imageIndex + 1)}`,
      ),
      stateName: 'IMAGE_GALLERY',
      label: 'extract_leaflet_image',
      subject: {
        subjectKind: 'comboatacadista-leaflet-image',
        leafletId,
        leafletTitle,
        imageIndex,
        imageUrl,
      },
    });
  }

  private async captureBeforeAction(
    input: ExtractComboAtacadistaLeafletsInput,
    visualTarget: ComboAtacadistaLeafletVisualTarget,
    capture: Omit<
      CaptureVisualDatasetSampleInput,
      'runId' | 'supermarketId' | 'split' | 'page' | 'target'
    >,
  ): Promise<void> {
    if (this.visualDatasetCaptureService === undefined || input.visualDataset === undefined) {
      return;
    }

    await this.visualDatasetCaptureService.captureBeforeAction({
      ...capture,
      runId: input.visualDataset.runId,
      supermarketId: 'comboatacadista',
      split: input.visualDataset.split,
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }
}

function validateInput(input: ExtractComboAtacadistaLeafletsInput): void {
  if (input.homeUrl.trim().length === 0) {
    throw new ComboAtacadistaLeafletExtractionError('homeUrl cannot be blank.');
  }

  if (input.offersUrl.trim().length === 0) {
    throw new ComboAtacadistaLeafletExtractionError('offersUrl cannot be blank.');
  }

  if (input.timeoutMs <= 0) {
    throw new ComboAtacadistaLeafletExtractionError('timeoutMs must be positive.');
  }
}

function createSampleId(runId: string, value: string): string {
  return `${runId}-comboatacadista-${value}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
