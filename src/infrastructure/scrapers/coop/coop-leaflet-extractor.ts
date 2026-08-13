import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  CaptureVisualDatasetSampleInput,
  VisualDatasetCaptureService,
} from '../../../application/services/visual-dataset-capture-service';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { VisualViewport } from '../../../domain/visual/viewport';
import {
  type CoopExtractedUnit,
  type CoopFailedUnit,
  type ExtractedCoopImageGalleryLeaflet,
} from './coop-image-gallery-leaflet';
import type {
  CoopLeafletMagazinePage,
  CoopLeafletPage,
  CoopLeafletPageFactory,
  CoopLeafletVisualTarget,
} from './coop-leaflet-page';
import {
  COOP_HOME_URL,
  COOP_OFFERS_URL,
  type CoopMonitoredStore,
  listCoopMonitoredStores,
} from './coop-targets';

export type CoopStartUrlMode = 'store-page' | 'home';

export interface ExtractCoopLeafletsInput {
  readonly startUrlMode: CoopStartUrlMode;
  readonly homeUrl?: string;
  readonly offersUrl?: string;
  readonly monitoredStores: readonly CoopMonitoredStore[];
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly settleDelayMs: number;
  readonly visualDataset?: ExtractCoopVisualDatasetInput;
}

export interface ExtractCoopVisualDatasetInput {
  readonly runId: string;
  readonly split: DatasetSplit;
}

export interface CoopLeafletExtractionResult {
  readonly source: 'coop-playwright-direct';
  readonly extractedAtIso: string;
  readonly units: readonly CoopExtractedUnit[];
  readonly failedUnits: readonly CoopFailedUnit[];
}

interface CoopVisualDatasetCaptureService {
  captureBeforeAction(
    input: CaptureVisualDatasetSampleInput,
  ): ReturnType<VisualDatasetCaptureService['captureBeforeAction']>;
}

export class CoopLeafletExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoopLeafletExtractionError';
  }
}

export class CoopLeafletExtractor {
  private readonly pageFactory: CoopLeafletPageFactory;

  private readonly clock: Clock;

  private readonly logger: Logger;

  private readonly visualDatasetCaptureService: CoopVisualDatasetCaptureService | undefined;

  constructor(
    pageFactory: CoopLeafletPageFactory,
    clock: Clock,
    logger: Logger,
    visualDatasetCaptureService?: CoopVisualDatasetCaptureService,
  ) {
    this.pageFactory = pageFactory;
    this.clock = clock;
    this.logger = logger;
    this.visualDatasetCaptureService = visualDatasetCaptureService;
  }

  async extract(input: ExtractCoopLeafletsInput): Promise<CoopLeafletExtractionResult> {
    validateInput(input);

    const page = await this.pageFactory.openPage({
      viewport: input.viewport,
      timeoutMs: input.timeoutMs,
    });
    const units: CoopExtractedUnit[] = [];
    const failedUnits: CoopFailedUnit[] = [];

    try {
      for (const store of input.monitoredStores) {
        try {
          units.push(await this.extractStore(page, input, store));
        } catch (error) {
          const errorMessage = (error as Error).message;
          this.logger.warn('Coop Playwright store extraction failed.', {
            storeSlug: store.storeSlug,
            storeName: store.storeName,
            errorMessage,
          });
          failedUnits.push({
            unitId: store.storeSlug,
            unitName: store.storeName,
            sourceUrl: store.finalPageUrl,
            errorMessage,
          });
        }
      }

      return {
        source: 'coop-playwright-direct',
        extractedAtIso: this.clock.nowIso(),
        units,
        failedUnits,
      };
    } finally {
      await page.close();
    }
  }

  private async extractStore(
    page: CoopLeafletPage,
    input: ExtractCoopLeafletsInput,
    store: CoopMonitoredStore,
  ): Promise<CoopExtractedUnit> {
    await this.navigateToStore(page, input, store);
    const cards = await page.listLeafletCards();

    if (cards.length === 0) {
      throw new CoopLeafletExtractionError(
        `Coop store page did not expose leaflet cards: ${store.finalPageUrl}`,
      );
    }

    const leaflets: ExtractedCoopImageGalleryLeaflet[] = [];

    for (const card of cards) {
      await this.captureLeafletCardTarget(
        page,
        input,
        store,
        card.cardIndex,
        card.leafletId,
        card.title,
      );
      const magazinePage = await page.openLeafletCardInNewPage(card.cardIndex);

      try {
        await magazinePage.waitForImageGallery();
        await page.waitForTimeout(input.settleDelayMs);
        this.logger.info('Coop FSM state entered.', {
          stateName: 'IMAGE_GALLERY',
          storeSlug: store.storeSlug,
          leafletId: card.leafletId,
        });
        const imageUrls = await magazinePage.listLeafletImageUrls();

        if (imageUrls.length === 0) {
          throw new CoopLeafletExtractionError(
            `Coop leaflet page did not expose images: ${card.href}`,
          );
        }

        for (const [imageIndex, imageUrl] of imageUrls.entries()) {
          await this.captureLeafletImageTarget(
            magazinePage,
            input,
            store,
            card.leafletId,
            card.title,
            imageIndex,
            imageUrl,
          );
        }

        const coverImageUrl = imageUrls[0];

        /* v8 ignore next 5 */
        if (coverImageUrl === undefined) {
          throw new CoopLeafletExtractionError(
            `Coop leaflet page did not expose images: ${card.href}`,
          );
        }

        leaflets.push({
          leafletId: card.leafletId,
          title: card.title,
          sourcePageUrl: await magazinePage.getCurrentUrl(),
          coverImageUrl,
          imageUrls,
          validUntilIso: card.validUntilIso,
        });
      } finally {
        await magazinePage.close();
      }
    }

    return {
      unitId: store.storeSlug,
      unitName: store.storeName,
      sourceUrl: store.finalPageUrl,
      leaflets,
    };
  }

  private async navigateToStore(
    page: CoopLeafletPage,
    input: ExtractCoopLeafletsInput,
    store: CoopMonitoredStore,
  ): Promise<void> {
    if (input.startUrlMode === 'home') {
      await this.navigateHomeToStore(page, input, store);
      return;
    }

    this.logger.info('Coop FSM state entered.', {
      stateName: 'STORE_SELECTION',
      storeSlug: store.storeSlug,
      sourceUrl: store.finalPageUrl,
    });
    await page.goto(store.finalPageUrl);
    await page.waitForStoreOffersPage(store);
    await page.waitForTimeout(input.settleDelayMs);
  }

  private async navigateHomeToStore(
    page: CoopLeafletPage,
    input: ExtractCoopLeafletsInput,
    store: CoopMonitoredStore,
  ): Promise<void> {
    const homeUrl = input.homeUrl ?? COOP_HOME_URL;

    this.logger.info('Coop FSM state entered.', {
      stateName: 'ANCHOR_PAGE',
      sourceUrl: homeUrl,
    });
    await page.goto(homeUrl);
    await page.waitForHomePage();
    await page.waitForTimeout(input.settleDelayMs);
    await this.captureHomeOffersTarget(page, input);
    await page.openHomeOffersPage();

    this.logger.info('Coop FSM state entered.', {
      stateName: 'LEAFLETS_PAGE',
      sourceUrl: input.offersUrl ?? COOP_OFFERS_URL,
    });
    await page.waitForOffersPage();
    await page.waitForTimeout(input.settleDelayMs);
    await this.captureStoreLinkTarget(page, input, store);
    await page.openStore(store);
    await page.waitForStoreOffersPage(store);
    await page.waitForTimeout(input.settleDelayMs);
  }

  private async captureHomeOffersTarget(
    page: CoopLeafletPage,
    input: ExtractCoopLeafletsInput,
  ): Promise<void> {
    const visualTarget = await page.getHomeOffersVisualTarget();
    await this.captureBeforeAction(input, visualTarget, {
      sampleId: createSampleId(input.visualDataset?.runId ?? 'coop', 'home-offers-link'),
      stateName: 'ANCHOR_PAGE',
      label: 'open_leaflets_page_button',
      subject: {
        subjectKind: 'coop-home-offers-link',
      },
    });
  }

  private async captureStoreLinkTarget(
    page: CoopLeafletPage,
    input: ExtractCoopLeafletsInput,
    store: CoopMonitoredStore,
  ): Promise<void> {
    const visualTarget = await page.getStoreLinkVisualTarget(store);
    await this.captureBeforeAction(input, visualTarget, {
      sampleId: createSampleId(
        input.visualDataset?.runId ?? 'coop',
        `${store.storeSlug}-store-link`,
      ),
      stateName: 'LEAFLETS_PAGE',
      label: 'select_store_button',
      subject: {
        subjectKind: 'coop-store-link',
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        storeUrl: store.finalPageUrl,
      },
    });
  }

  private async captureLeafletCardTarget(
    page: CoopLeafletPage,
    input: ExtractCoopLeafletsInput,
    store: CoopMonitoredStore,
    cardIndex: number,
    leafletId: string,
    leafletTitle: string,
  ): Promise<void> {
    const visualTarget = await page.getLeafletCardVisualTarget(cardIndex);
    await this.captureBeforeAction(input, visualTarget, {
      sampleId: createSampleId(
        input.visualDataset?.runId ?? 'coop',
        `${store.storeSlug}-card-${String(cardIndex + 1)}`,
      ),
      stateName: 'LEAFLETS_PAGE',
      label: 'open_leaflet_modal_button',
      subject: {
        subjectKind: 'coop-leaflet-card',
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        cardIndex,
        leafletId,
        leafletTitle,
      },
    });
  }

  private async captureLeafletImageTarget(
    page: CoopLeafletMagazinePage,
    input: ExtractCoopLeafletsInput,
    store: CoopMonitoredStore,
    leafletId: string,
    leafletTitle: string,
    imageIndex: number,
    imageUrl: string,
  ): Promise<void> {
    const visualTarget = await page.getLeafletImageVisualTarget(imageIndex);
    await this.captureBeforeAction(input, visualTarget, {
      sampleId: createSampleId(
        input.visualDataset?.runId ?? 'coop',
        `${store.storeSlug}-${leafletId}-image-${String(imageIndex + 1)}`,
      ),
      stateName: 'IMAGE_GALLERY',
      label: 'extract_leaflet_image',
      subject: {
        subjectKind: 'coop-leaflet-image',
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        leafletId,
        leafletTitle,
        imageIndex,
        imageUrl,
      },
    });
  }

  private async captureBeforeAction(
    input: ExtractCoopLeafletsInput,
    visualTarget: CoopLeafletVisualTarget,
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
      supermarketId: 'coop',
      split: input.visualDataset.split,
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }
}

export function createDefaultCoopLeafletExtractionInput(
  viewport: VisualViewport,
  timeoutMs: number,
  settleDelayMs: number,
): ExtractCoopLeafletsInput {
  return {
    startUrlMode: 'store-page',
    homeUrl: COOP_HOME_URL,
    offersUrl: COOP_OFFERS_URL,
    monitoredStores: listCoopMonitoredStores(),
    viewport,
    timeoutMs,
    settleDelayMs,
  };
}

function validateInput(input: ExtractCoopLeafletsInput): void {
  if (input.monitoredStores.length === 0) {
    throw new CoopLeafletExtractionError('monitoredStores cannot be empty.');
  }

  if (input.timeoutMs <= 0) {
    throw new CoopLeafletExtractionError('timeoutMs must be positive.');
  }

  if (input.startUrlMode === 'home' && input.homeUrl?.trim().length === 0) {
    throw new CoopLeafletExtractionError('homeUrl cannot be blank.');
  }

  if (input.startUrlMode === 'home' && input.offersUrl?.trim().length === 0) {
    throw new CoopLeafletExtractionError('offersUrl cannot be blank.');
  }
}

function createSampleId(runId: string, value: string): string {
  return `${runId}-coop-${value}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
