import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  CaptureVisualDatasetSampleInput,
  VisualDatasetCaptureService,
} from '../../../application/services/visual-dataset-capture-service';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type {
  ExtractedLeaflet,
  ExtractedLeafletImage,
  LeafletExtractionResult,
} from '../../../domain/leaflet/extracted-leaflet';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type { CarnaubaLeafletCard, CarnaubaLeafletPageFactory } from './carnauba-leaflet-page';
import { createLeafletId } from './leaflet-id';

export interface ExtractCarnaubaLeafletsInput {
  readonly sourceUrl: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly settleDelayMs: number;
  readonly visualDataset?: ExtractCarnaubaVisualDatasetInput;
}

export interface ExtractCarnaubaVisualDatasetInput {
  readonly runId: string;
  readonly storeId: number;
  readonly storeName: string;
  readonly split: DatasetSplit;
}

interface CarnaubaVisualDatasetCaptureService {
  captureBeforeAction(
    input: CaptureVisualDatasetSampleInput,
  ): ReturnType<VisualDatasetCaptureService['captureBeforeAction']>;
}

export class CarnaubaLeafletExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CarnaubaLeafletExtractionError';
  }
}

export class CarnaubaLeafletExtractor {
  private readonly pageFactory: CarnaubaLeafletPageFactory;

  private readonly clock: Clock;

  private readonly logger: Logger;

  private readonly visualDatasetCaptureService: CarnaubaVisualDatasetCaptureService | undefined;

  constructor(
    pageFactory: CarnaubaLeafletPageFactory,
    clock: Clock,
    logger: Logger,
    visualDatasetCaptureService?: CarnaubaVisualDatasetCaptureService,
  ) {
    this.pageFactory = pageFactory;
    this.clock = clock;
    this.logger = logger;
    this.visualDatasetCaptureService = visualDatasetCaptureService;
  }

  async extract(input: ExtractCarnaubaLeafletsInput): Promise<LeafletExtractionResult> {
    validateInput(input);

    const page = await this.pageFactory.openPage({
      viewport: input.viewport,
      timeoutMs: input.timeoutMs,
    });

    try {
      await page.goto(input.sourceUrl);
      await page.waitForTimeout(input.settleDelayMs);

      const cards = await page.discoverCards();
      this.logger.info('Discovered Carnauba leaflet cards.', {
        count: cards.length,
      });

      const leaflets: ExtractedLeaflet[] = [];

      for (const [cardIndex, card] of cards.entries()) {
        await this.captureVisualDatasetSampleIfEnabled(page, input, card, cardIndex);
        const openedLeaflet = await page.openLeafletAt(cardIndex);
        const imageUrls = deduplicateImageUrls(openedLeaflet.imageUrls);

        if (imageUrls.length === 0) {
          throw new CarnaubaLeafletExtractionError(
            `Leaflet card ${String(cardIndex)} did not expose any modal image URL.`,
          );
        }

        leaflets.push(createExtractedLeaflet(card, openedLeaflet.title, cardIndex, imageUrls));
        await page.closeLeafletModal();
      }

      return {
        supermarketId: 'carnauba',
        sourceUrl: input.sourceUrl,
        extractedAtIso: this.clock.nowIso(),
        leaflets,
      };
    } finally {
      await page.close();
    }
  }

  private async captureVisualDatasetSampleIfEnabled(
    page: Awaited<ReturnType<CarnaubaLeafletPageFactory['openPage']>>,
    input: ExtractCarnaubaLeafletsInput,
    card: CarnaubaLeafletCard,
    cardIndex: number,
  ): Promise<void> {
    if (input.visualDataset === undefined || this.visualDatasetCaptureService === undefined) {
      return;
    }

    const visualTarget = await page.getLeafletCardVisualTarget(cardIndex);

    await this.visualDatasetCaptureService.captureBeforeAction({
      sampleId: createVisualDatasetSampleId(
        input.visualDataset.runId,
        input.visualDataset.storeId,
        card.title,
        cardIndex,
      ),
      runId: input.visualDataset.runId,
      supermarketId: 'carnauba',
      stateName: 'LEAFLETS_PAGE',
      label: 'open_leaflet_modal_button',
      subject: {
        subjectKind: 'carnauba-leaflet-card',
        storeId: input.visualDataset.storeId,
        storeName: input.visualDataset.storeName,
        cardIndex,
        leafletTitle: card.title,
      },
      split: input.visualDataset.split,
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }
}

function validateInput(input: ExtractCarnaubaLeafletsInput): void {
  validateUrl(input.sourceUrl);
  validatePositiveInteger(input.timeoutMs, 'timeoutMs');

  if (!Number.isInteger(input.settleDelayMs) || input.settleDelayMs < 0) {
    throw new CarnaubaLeafletExtractionError('settleDelayMs must be a non-negative integer.');
  }
}

function validateUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new CarnaubaLeafletExtractionError('sourceUrl must be absolute and valid.');
  }
}

function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CarnaubaLeafletExtractionError(`${fieldName} must be a positive integer.`);
  }
}

function createExtractedLeaflet(
  card: CarnaubaLeafletCard,
  openedTitle: string,
  cardIndex: number,
  imageUrls: readonly string[],
): ExtractedLeaflet {
  const title = openedTitle.trim().length > 0 ? openedTitle.trim() : card.title;

  return {
    leafletId: createLeafletId(title, cardIndex),
    title,
    cardIndex,
    coverImageUrl: card.coverImageUrl,
    images: imageUrls.map((imageUrl, index): ExtractedLeafletImage => {
      return {
        order: index + 1,
        imageUrl,
      };
    }),
  };
}

function deduplicateImageUrls(imageUrls: readonly string[]): readonly string[] {
  return [...new Set(imageUrls.map((imageUrl) => imageUrl.trim()).filter(Boolean))];
}

function createVisualDatasetSampleId(
  runId: string,
  storeId: number,
  title: string,
  cardIndex: number,
): string {
  return `${runId}-store-${String(storeId)}-card-${createLeafletId(title, cardIndex)}`;
}
