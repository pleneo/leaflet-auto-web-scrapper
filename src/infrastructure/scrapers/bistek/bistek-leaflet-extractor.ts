import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  CaptureVisualDatasetSampleInput,
  VisualDatasetCaptureService,
} from '../../../application/services/visual-dataset-capture-service';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type {
  BistekExtractedStore,
  BistekFailedStore,
  BistekLeafletCard,
  BistekMonitoredStore,
  ExtractedBistekImageGalleryLeaflet,
} from './bistek-image-gallery-leaflet';
import type {
  BistekLeafletPage,
  BistekLeafletPageFactory,
  BistekLeafletVisualTarget,
} from './bistek-leaflet-page';
import { BISTEK_OFFERS_URL, BISTEK_SUPERMARKET_NAME } from './bistek-targets';
import { createUnitId, createUnitName } from './bistek-api-extraction';

export interface ExtractBistekLeafletsInput {
  readonly offersUrl: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly storeTimeoutMs: number;
  readonly maxStoreAttempts: number;
  readonly settleDelayMs: number;
  readonly storeIds: readonly string[];
  readonly cityIds: readonly string[];
  readonly visualDataset?: ExtractBistekVisualDatasetInput;
}

export interface ExtractBistekVisualDatasetInput {
  readonly runId: string;
  readonly split: DatasetSplit;
}

export interface BistekLeafletExtractionResult {
  readonly source: 'bistek-playwright';
  readonly extractedAtIso: string;
  readonly stores: readonly BistekExtractedStore[];
  readonly failedStores: readonly BistekFailedStore[];
}

interface BistekVisualDatasetCaptureService {
  captureBeforeAction(
    input: CaptureVisualDatasetSampleInput,
  ): ReturnType<VisualDatasetCaptureService['captureBeforeAction']>;
}

export class BistekLeafletExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BistekLeafletExtractionError';
  }
}

export class BistekLeafletExtractor {
  private readonly pageFactory: BistekLeafletPageFactory;

  private readonly clock: Clock;

  private readonly logger: Logger;

  private readonly visualDatasetCaptureService: BistekVisualDatasetCaptureService | undefined;

  constructor(
    pageFactory: BistekLeafletPageFactory,
    clock: Clock,
    logger: Logger,
    visualDatasetCaptureService?: BistekVisualDatasetCaptureService,
  ) {
    this.pageFactory = pageFactory;
    this.clock = clock;
    this.logger = logger;
    this.visualDatasetCaptureService = visualDatasetCaptureService;
  }

  async extract(input: ExtractBistekLeafletsInput): Promise<BistekLeafletExtractionResult> {
    validateInput(input);
    const discoveredStores = await this.discoverStores(input);
    const stores = filterStores(discoveredStores, input);
    const extractedStores: BistekExtractedStore[] = [];
    const failedStores: BistekFailedStore[] = [];

    for (const store of stores) {
      const result = await this.extractStoreWithRetry(input, store);

      if (result.status === 'failed') {
        failedStores.push({
          unitId: createUnitId(store),
          unitName: createUnitName(store),
          sourceUrl: input.offersUrl,
          errorMessage: result.errorMessage,
        });
        continue;
      }

      extractedStores.push({
        unitId: createUnitId(store),
        unitName: createUnitName(store),
        sourceUrl: input.offersUrl,
        store,
        leaflets: result.leaflets,
      });
    }

    return {
      source: 'bistek-playwright',
      extractedAtIso: this.clock.nowIso(),
      stores: extractedStores,
      failedStores,
    };
  }

  private async discoverStores(
    input: ExtractBistekLeafletsInput,
  ): Promise<readonly BistekMonitoredStore[]> {
    const page = await this.pageFactory.openPage({
      viewport: input.viewport,
      timeoutMs: input.timeoutMs,
    });

    try {
      await page.goto(input.offersUrl);
      await page.waitForTimeout(input.settleDelayMs);

      return await page.discoverStores();
    } finally {
      await page.close();
    }
  }

  private async extractStoreWithRetry(
    input: ExtractBistekLeafletsInput,
    store: BistekMonitoredStore,
  ): Promise<
    | {
        readonly status: 'succeeded';
        readonly leaflets: readonly ExtractedBistekImageGalleryLeaflet[];
      }
    | {
        readonly status: 'failed';
        readonly errorMessage: string;
      }
  > {
    let lastErrorMessage = 'Unknown Bistek store extraction failure.';

    for (let attempt = 1; attempt <= input.maxStoreAttempts; attempt += 1) {
      try {
        const leaflets = await withTimeout(
          this.extractStore(input, store),
          input.storeTimeoutMs,
          `Bistek store ${store.storeId} extraction timed out.`,
        );

        return {
          status: 'succeeded',
          leaflets,
        };
      } catch (error) {
        lastErrorMessage =
          error instanceof Error ? error.message : 'Unexpected Bistek Playwright failure.';
        this.logger.warn('Bistek Playwright store extraction attempt failed.', {
          storeId: store.storeId,
          storeName: store.storeName,
          attempt,
        });
      }
    }

    return {
      status: 'failed',
      errorMessage: lastErrorMessage,
    };
  }

  private async extractStore(
    input: ExtractBistekLeafletsInput,
    store: BistekMonitoredStore,
  ): Promise<readonly ExtractedBistekImageGalleryLeaflet[]> {
    const page = await this.pageFactory.openPage({
      viewport: input.viewport,
      timeoutMs: input.timeoutMs,
    });

    try {
      this.logger.info('Bistek FSM state entered.', {
        stateName: 'ANCHOR_PAGE',
        storeId: store.storeId,
      });
      await page.goto(input.offersUrl);
      await page.waitForTimeout(input.settleDelayMs);
      await page.ensureStoreSelectionModalOpen();

      this.logger.info('Bistek FSM state entered.', {
        stateName: 'CITY_SELECTION',
        storeId: store.storeId,
      });
      await this.captureCitySelectionIfEnabled(page, input, store);
      await page.selectCity(store);
      await page.waitForTimeout(input.settleDelayMs);

      this.logger.info('Bistek FSM state entered.', {
        stateName: 'STORE_SELECTION',
        storeId: store.storeId,
      });
      await this.captureStoreSelectionIfEnabled(page, input, store);
      await page.selectStore(store);
      await page.waitForStoreLeaflets(store);
      await page.waitForTimeout(input.settleDelayMs);

      const cards = await page.discoverCards(store);

      if (cards.length === 0) {
        throw new BistekLeafletExtractionError(
          'Bistek store page did not expose leaflet image galleries.',
        );
      }

      const leaflets: ExtractedBistekImageGalleryLeaflet[] = [];

      for (const card of cards) {
        await this.captureLeafletCardIfEnabled(page, input, store, card);
        await page.openLeafletAt(card.cardIndex);
        await page.waitForTimeout(input.settleDelayMs);
        await this.captureImageDownloadIfEnabled(page, input, store, card);
        const activeImageUrl = await page.resolveActiveDownloadImageUrl();

        if (!card.imageUrls.includes(activeImageUrl)) {
          this.logger.warn('Bistek Fancybox active image differs from parsed gallery.', {
            storeId: store.storeId,
            leafletId: card.leafletId,
            activeImageUrl,
          });
        }

        leaflets.push({
          leafletId: card.leafletId,
          title: card.title,
          sourcePageUrl: input.offersUrl,
          coverImageUrl: card.coverImageUrl,
          imageUrls: card.imageUrls,
          validityStartDateIso: card.validityStartDateIso,
          validityEndDateIso: card.validityEndDateIso,
        });
        await this.captureModalCloseIfEnabled(page, input, store, card);
        await page.closeLeafletModal();
      }

      return leaflets;
    } finally {
      await page.close();
    }
  }

  private async captureCitySelectionIfEnabled(
    page: BistekLeafletPage,
    input: ExtractBistekLeafletsInput,
    store: BistekMonitoredStore,
  ): Promise<void> {
    if (!this.isVisualDatasetCaptureEnabled(input)) {
      return;
    }

    await this.captureBeforeAction(input, await page.getCitySelectionVisualTarget(store), {
      sampleId: `${input.visualDataset?.runId ?? 'bistek'}-${store.storeSlug}-select-city`,
      stateName: 'CITY_SELECTION',
      label: 'select_city_button',
      subject: {
        subjectKind: 'bistek-city-selection',
        stateCode: store.stateCode,
        cityId: store.cityId,
        cityName: store.cityName,
      },
    });
  }

  private async captureStoreSelectionIfEnabled(
    page: BistekLeafletPage,
    input: ExtractBistekLeafletsInput,
    store: BistekMonitoredStore,
  ): Promise<void> {
    if (!this.isVisualDatasetCaptureEnabled(input)) {
      return;
    }

    await this.captureBeforeAction(input, await page.getStoreSelectionVisualTarget(store), {
      sampleId: `${input.visualDataset?.runId ?? 'bistek'}-${store.storeSlug}-select-store`,
      stateName: 'STORE_SELECTION',
      label: 'select_store_button',
      subject: {
        subjectKind: 'bistek-store-selection',
        stateCode: store.stateCode,
        cityId: store.cityId,
        cityName: store.cityName,
        storeId: store.storeId,
        storeName: store.storeName,
      },
    });
  }

  private async captureLeafletCardIfEnabled(
    page: BistekLeafletPage,
    input: ExtractBistekLeafletsInput,
    store: BistekMonitoredStore,
    card: BistekLeafletCard,
  ): Promise<void> {
    if (!this.isVisualDatasetCaptureEnabled(input)) {
      return;
    }

    await this.captureBeforeAction(input, await page.getLeafletCardVisualTarget(card.cardIndex), {
      sampleId: `${input.visualDataset?.runId ?? 'bistek'}-${card.leafletId}-open-card`,
      stateName: 'LEAFLETS_PAGE',
      label: 'open_leaflet_modal_button',
      subject: {
        subjectKind: 'bistek-leaflet-card',
        stateCode: store.stateCode,
        cityId: store.cityId,
        cityName: store.cityName,
        storeId: store.storeId,
        storeName: store.storeName,
        cardIndex: card.cardIndex,
        leafletTitle: card.title,
      },
    });
  }

  private async captureImageDownloadIfEnabled(
    page: BistekLeafletPage,
    input: ExtractBistekLeafletsInput,
    store: BistekMonitoredStore,
    card: BistekLeafletCard,
  ): Promise<void> {
    if (!this.isVisualDatasetCaptureEnabled(input)) {
      return;
    }

    await this.captureBeforeAction(input, await page.getImageDownloadVisualTarget(), {
      sampleId: `${input.visualDataset?.runId ?? 'bistek'}-${card.leafletId}-download-image`,
      stateName: 'IMAGE_GALLERY',
      label: 'download_image_button',
      subject: {
        subjectKind: 'bistek-image-download',
        stateCode: store.stateCode,
        cityId: store.cityId,
        cityName: store.cityName,
        storeId: store.storeId,
        storeName: store.storeName,
        cardIndex: card.cardIndex,
        imageIndex: 0,
        leafletTitle: card.title,
        imageUrl: card.coverImageUrl,
      },
    });
  }

  private async captureModalCloseIfEnabled(
    page: BistekLeafletPage,
    input: ExtractBistekLeafletsInput,
    store: BistekMonitoredStore,
    card: BistekLeafletCard,
  ): Promise<void> {
    if (!this.isVisualDatasetCaptureEnabled(input)) {
      return;
    }

    await this.captureBeforeAction(input, await page.getModalCloseVisualTarget(), {
      sampleId: `${input.visualDataset?.runId ?? 'bistek'}-${card.leafletId}-close-modal`,
      stateName: 'IMAGE_GALLERY',
      label: 'close_modal_button',
      subject: {
        subjectKind: 'bistek-modal-close',
        stateCode: store.stateCode,
        cityId: store.cityId,
        cityName: store.cityName,
        storeId: store.storeId,
        storeName: store.storeName,
        cardIndex: card.cardIndex,
        leafletTitle: card.title,
      },
    });
  }

  private async captureBeforeAction(
    input: ExtractBistekLeafletsInput,
    visualTarget: BistekLeafletVisualTarget,
    capture: Omit<
      CaptureVisualDatasetSampleInput,
      'runId' | 'supermarketId' | 'split' | 'page' | 'target'
    >,
  ): Promise<void> {
    if (input.visualDataset === undefined || this.visualDatasetCaptureService === undefined) {
      return;
    }

    await this.visualDatasetCaptureService.captureBeforeAction({
      ...capture,
      runId: input.visualDataset.runId,
      supermarketId: 'bistek',
      split: input.visualDataset.split,
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }

  private isVisualDatasetCaptureEnabled(input: ExtractBistekLeafletsInput): boolean {
    return input.visualDataset !== undefined && this.visualDatasetCaptureService !== undefined;
  }
}

function filterStores(
  stores: readonly BistekMonitoredStore[],
  input: ExtractBistekLeafletsInput,
): readonly BistekMonitoredStore[] {
  return stores.filter(
    (store) =>
      (input.storeIds.length === 0 || input.storeIds.includes(store.storeId)) &&
      (input.cityIds.length === 0 || input.cityIds.includes(store.cityId)),
  );
}

function validateInput(input: ExtractBistekLeafletsInput): void {
  validateUrl(input.offersUrl);
  validatePositiveInteger(input.timeoutMs, 'timeoutMs');
  validatePositiveInteger(input.storeTimeoutMs, 'storeTimeoutMs');
  validatePositiveInteger(input.maxStoreAttempts, 'maxStoreAttempts');

  if (!Number.isInteger(input.settleDelayMs) || input.settleDelayMs < 0) {
    throw new BistekLeafletExtractionError('settleDelayMs must be a non-negative integer.');
  }
}

function validateUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new BistekLeafletExtractionError('offersUrl must be absolute and valid.');
  }
}

function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BistekLeafletExtractionError(`${fieldName} must be a positive integer.`);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      rejectPromise(new BistekLeafletExtractionError(message));
    }, timeoutMs);

    promise
      .then(resolvePromise)
      .catch(rejectPromise)
      .finally(() => {
        clearTimeout(timeout);
      });
  });
}

export function createDefaultBistekLeafletsInput(
  viewport: VisualViewport,
): ExtractBistekLeafletsInput {
  return {
    offersUrl: BISTEK_OFFERS_URL,
    viewport,
    timeoutMs: 30_000,
    storeTimeoutMs: 60_000,
    maxStoreAttempts: 2,
    settleDelayMs: 3_000,
    storeIds: [],
    cityIds: [],
  };
}

export const BISTEK_DEFAULT_UNIT_NAME = BISTEK_SUPERMARKET_NAME;
