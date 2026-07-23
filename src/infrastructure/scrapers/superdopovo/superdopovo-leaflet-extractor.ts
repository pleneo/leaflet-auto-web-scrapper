import type {
  CaptureVisualDatasetSampleInput,
  VisualDatasetCaptureService,
} from '../../../application/services/visual-dataset-capture-service';
import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type {
  ExtractedLeaflet,
  ExtractedLeafletImage,
  LeafletExtractionResult,
} from '../../../domain/leaflet/extracted-leaflet';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type { SuperDoPovoBooklet, SuperDoPovoShop } from './superdopovo-api-types';
import type {
  OpenedSuperDoPovoLeaflet,
  SuperDoPovoLeafletCard,
  SuperDoPovoLeafletPageFactory,
} from './superdopovo-leaflet-page';

export interface ExtractSuperDoPovoLeafletsInput {
  readonly homeUrl: string;
  readonly sourceUrl: string;
  readonly shop: SuperDoPovoShop;
  readonly expectedBooklets: readonly SuperDoPovoBooklet[];
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly settleDelayMs: number;
  readonly visualDataset?: ExtractSuperDoPovoVisualDatasetInput;
}

export interface ExtractSuperDoPovoVisualDatasetInput {
  readonly runId: string;
  readonly split: DatasetSplit;
}

interface SuperDoPovoVisualDatasetCaptureService {
  captureBeforeAction(
    input: CaptureVisualDatasetSampleInput,
  ): ReturnType<VisualDatasetCaptureService['captureBeforeAction']>;
}

export class SuperDoPovoLeafletExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuperDoPovoLeafletExtractionError';
  }
}

export class SuperDoPovoLeafletExtractor {
  private readonly pageFactory: SuperDoPovoLeafletPageFactory;

  private readonly clock: Clock;

  private readonly logger: Logger;

  private readonly visualDatasetCaptureService: SuperDoPovoVisualDatasetCaptureService | undefined;

  constructor(
    pageFactory: SuperDoPovoLeafletPageFactory,
    clock: Clock,
    logger: Logger,
    visualDatasetCaptureService?: SuperDoPovoVisualDatasetCaptureService,
  ) {
    this.pageFactory = pageFactory;
    this.clock = clock;
    this.logger = logger;
    this.visualDatasetCaptureService = visualDatasetCaptureService;
  }

  async extract(input: ExtractSuperDoPovoLeafletsInput): Promise<LeafletExtractionResult> {
    validateInput(input);

    const page = await this.pageFactory.openPage({
      viewport: input.viewport,
      timeoutMs: input.timeoutMs,
    });

    try {
      await page.goto(input.homeUrl);
      await page.waitForTimeout(input.settleDelayMs);
      await page.dismissCookieBanner();
      await this.captureSectionsMenuVisualDatasetSampleIfEnabled(page, input);
      await page.openSectionsMenu();
      await page.waitForTimeout(input.settleDelayMs);
      await this.captureLeafletsLinkVisualDatasetSampleIfEnabled(page, input);
      await page.openLeafletsPage(input.sourceUrl);
      await page.waitForTimeout(input.settleDelayMs);

      const cards = await page.discoverCards();
      this.logger.info('Discovered Super do Povo leaflet cards.', {
        shopId: input.shop.shopId,
        shopName: input.shop.name,
        count: cards.length,
      });

      const leaflets: ExtractedLeaflet[] = [];

      for (const [cardIndex, card] of cards.entries()) {
        const expectedBooklet = input.expectedBooklets[cardIndex];

        if (expectedBooklet === undefined) {
          this.logger.warn('Skipping Super do Povo card without matching API booklet.', {
            shopId: input.shop.shopId,
            cardIndex,
          });
          continue;
        }

        await this.captureCardVisualDatasetSampleIfEnabled(page, input, expectedBooklet, cardIndex);
        const openedLeaflet = await page.openLeafletAt(cardIndex);
        const imageUrls = resolveImageUrls(expectedBooklet, openedLeaflet);
        const title = resolveLeafletTitle(card, expectedBooklet, openedLeaflet);

        if (imageUrls.length === 0) {
          throw new SuperDoPovoLeafletExtractionError(
            `Super do Povo booklet ${String(expectedBooklet.bookletId)} did not expose image URLs.`,
          );
        }

        for (const [imageIndex, imageUrl] of imageUrls.entries()) {
          await this.captureModalImageVisualDatasetSampleIfEnabled(
            page,
            input,
            expectedBooklet,
            title,
            cardIndex,
            imageIndex,
            imageUrl,
          );
        }

        leaflets.push(createExtractedLeaflet(expectedBooklet, title, cardIndex, imageUrls));
        await this.captureModalCloseVisualDatasetSampleIfEnabled(
          page,
          input,
          expectedBooklet,
          title,
          cardIndex,
        );
        await page.closeLeafletModal();
      }

      return {
        supermarketId: 'superdopovo',
        sourceUrl: input.sourceUrl,
        extractedAtIso: this.clock.nowIso(),
        leaflets,
      };
    } finally {
      await page.close();
    }
  }

  private async captureSectionsMenuVisualDatasetSampleIfEnabled(
    page: Awaited<ReturnType<SuperDoPovoLeafletPageFactory['openPage']>>,
    input: ExtractSuperDoPovoLeafletsInput,
  ): Promise<void> {
    await this.captureIfEnabled({
      input,
      sampleId: `${input.visualDataset?.runId ?? ''}-sections-menu`,
      stateName: 'ANCHOR_PAGE',
      label: 'open_leaflets_page_button',
      subject: {
        subjectKind: 'superdopovo-sections-menu',
      },
      visualTarget: await page.getSectionsMenuVisualTarget(),
    });
  }

  private async captureLeafletsLinkVisualDatasetSampleIfEnabled(
    page: Awaited<ReturnType<SuperDoPovoLeafletPageFactory['openPage']>>,
    input: ExtractSuperDoPovoLeafletsInput,
  ): Promise<void> {
    await this.captureIfEnabled({
      input,
      sampleId: `${input.visualDataset?.runId ?? ''}-leaflets-link`,
      stateName: 'ANCHOR_PAGE',
      label: 'open_leaflets_page_button',
      subject: {
        subjectKind: 'superdopovo-leaflets-link',
      },
      visualTarget: await page.getLeafletsLinkVisualTarget(),
    });
  }

  private async captureCardVisualDatasetSampleIfEnabled(
    page: Awaited<ReturnType<SuperDoPovoLeafletPageFactory['openPage']>>,
    input: ExtractSuperDoPovoLeafletsInput,
    booklet: SuperDoPovoBooklet,
    cardIndex: number,
  ): Promise<void> {
    await this.captureIfEnabled({
      input,
      sampleId: createCardSampleId(input.visualDataset?.runId ?? '', booklet, cardIndex),
      stateName: 'LEAFLETS_PAGE',
      label: 'open_leaflet_modal_button',
      subject: {
        subjectKind: 'superdopovo-leaflet-card',
        shopId: input.shop.shopId,
        shopName: input.shop.name,
        cardIndex,
        bookletId: booklet.bookletId,
        bookletTitle: booklet.name,
      },
      visualTarget: await page.getLeafletCardVisualTarget(cardIndex),
    });
  }

  private async captureModalImageVisualDatasetSampleIfEnabled(
    page: Awaited<ReturnType<SuperDoPovoLeafletPageFactory['openPage']>>,
    input: ExtractSuperDoPovoLeafletsInput,
    booklet: SuperDoPovoBooklet,
    title: string,
    cardIndex: number,
    imageIndex: number,
    imageUrl: string,
  ): Promise<void> {
    await this.captureIfEnabled({
      input,
      sampleId: `${createCardSampleId(
        input.visualDataset?.runId ?? '',
        booklet,
        cardIndex,
      )}-image-${String(imageIndex + 1)}`,
      stateName: 'LEAFLET_MODAL',
      label: 'extract_leaflet_image',
      subject: {
        subjectKind: 'superdopovo-leaflet-image',
        shopId: input.shop.shopId,
        shopName: input.shop.name,
        cardIndex,
        bookletId: booklet.bookletId,
        bookletTitle: title,
        imageIndex,
        imageUrl,
      },
      visualTarget: await page.getLeafletModalImageVisualTarget(imageIndex),
    });
  }

  private async captureModalCloseVisualDatasetSampleIfEnabled(
    page: Awaited<ReturnType<SuperDoPovoLeafletPageFactory['openPage']>>,
    input: ExtractSuperDoPovoLeafletsInput,
    booklet: SuperDoPovoBooklet,
    title: string,
    cardIndex: number,
  ): Promise<void> {
    await this.captureIfEnabled({
      input,
      sampleId: `${createCardSampleId(input.visualDataset?.runId ?? '', booklet, cardIndex)}-close`,
      stateName: 'LEAFLET_MODAL',
      label: 'close_modal_button',
      subject: {
        subjectKind: 'superdopovo-leaflet-modal-close',
        shopId: input.shop.shopId,
        shopName: input.shop.name,
        cardIndex,
        bookletId: booklet.bookletId,
        bookletTitle: title,
      },
      visualTarget: await page.getLeafletModalCloseVisualTarget(),
    });
  }

  private async captureIfEnabled(input: CaptureIfEnabledInput): Promise<void> {
    if (
      input.input.visualDataset === undefined ||
      this.visualDatasetCaptureService === undefined
    ) {
      return;
    }

    await this.visualDatasetCaptureService.captureBeforeAction({
      sampleId: input.sampleId,
      runId: input.input.visualDataset.runId,
      supermarketId: 'superdopovo',
      stateName: input.stateName,
      label: input.label,
      subject: input.subject,
      split: input.input.visualDataset.split,
      page: input.visualTarget.page,
      target: input.visualTarget.target,
    });
  }
}

interface CaptureIfEnabledInput {
  readonly input: ExtractSuperDoPovoLeafletsInput;
  readonly sampleId: string;
  readonly stateName: CaptureVisualDatasetSampleInput['stateName'];
  readonly label: CaptureVisualDatasetSampleInput['label'];
  readonly subject: CaptureVisualDatasetSampleInput['subject'];
  readonly visualTarget: {
    readonly page: CaptureVisualDatasetSampleInput['page'];
    readonly target: CaptureVisualDatasetSampleInput['target'];
  };
}

function validateInput(input: ExtractSuperDoPovoLeafletsInput): void {
  validateUrl(input.homeUrl, 'homeUrl');
  validateUrl(input.sourceUrl, 'sourceUrl');
  validatePositiveInteger(input.timeoutMs, 'timeoutMs');

  if (!Number.isInteger(input.settleDelayMs) || input.settleDelayMs < 0) {
    throw new SuperDoPovoLeafletExtractionError('settleDelayMs must be a non-negative integer.');
  }
}

function validateUrl(url: string, fieldName: string): void {
  try {
    new URL(url);
  } catch {
    throw new SuperDoPovoLeafletExtractionError(`${fieldName} must be absolute and valid.`);
  }
}

function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SuperDoPovoLeafletExtractionError(`${fieldName} must be a positive integer.`);
  }
}

function resolveImageUrls(
  booklet: SuperDoPovoBooklet,
  openedLeaflet: OpenedSuperDoPovoLeaflet,
): readonly string[] {
  return [...new Set([...booklet.imageUrls, ...openedLeaflet.imageUrls].map((url) => url.trim()))]
    .filter((url) => url.length > 0);
}

function resolveLeafletTitle(
  card: SuperDoPovoLeafletCard,
  booklet: SuperDoPovoBooklet,
  openedLeaflet: OpenedSuperDoPovoLeaflet,
): string {
  const modalTitle = openedLeaflet.title.trim();

  if (modalTitle.length > 0) {
    return modalTitle;
  }

  const bookletTitle = booklet.name.trim();

  return bookletTitle.length > 0 ? bookletTitle : card.title;
}

function createExtractedLeaflet(
  booklet: SuperDoPovoBooklet,
  title: string,
  cardIndex: number,
  imageUrls: readonly string[],
): ExtractedLeaflet {
  return {
    leafletId: `superdopovo-${String(booklet.bookletId)}`,
    title,
    cardIndex,
    coverImageUrl: booklet.coverImageUrl,
    images: imageUrls.map((imageUrl, index): ExtractedLeafletImage => {
      return {
        order: index + 1,
        imageUrl,
      };
    }),
  };
}

function createCardSampleId(runId: string, booklet: SuperDoPovoBooklet, cardIndex: number): string {
  return `${runId}-shop-${String(booklet.shopId)}-card-${String(cardIndex + 1)}-booklet-${String(
    booklet.bookletId,
  )}`;
}
