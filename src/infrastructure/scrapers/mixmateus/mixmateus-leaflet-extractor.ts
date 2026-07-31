import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  CaptureVisualDatasetSampleInput,
  VisualDatasetCaptureService,
} from '../../../application/services/visual-dataset-capture-service';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type {
  MixMateusLeafletCard,
  MixMateusLeafletPage,
  MixMateusLeafletPageFactory,
} from './mixmateus-leaflet-page';
import type {
  ExtractedMixMateusPdfLeaflet,
  MixMateusExtractedStore,
  MixMateusFailedStore,
} from './mixmateus-pdf-leaflet';
import type { MixMateusMonitoredStore } from './mixmateus-targets';

export interface ExtractMixMateusLeafletsInput {
  readonly homeUrl: string;
  readonly stores: readonly MixMateusMonitoredStore[];
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly storeTimeoutMs: number;
  readonly maxStoreAttempts: number;
  readonly settleDelayMs: number;
  readonly visualDataset?: ExtractMixMateusVisualDatasetInput;
}

export interface ExtractMixMateusVisualDatasetInput {
  readonly runId: string;
  readonly split: DatasetSplit;
}

export interface MixMateusLeafletExtractionResult {
  readonly source: 'mixmateus-playwright';
  readonly extractedAtIso: string;
  readonly stores: readonly MixMateusExtractedStore[];
  readonly failedStores: readonly MixMateusFailedStore[];
}

interface MixMateusVisualDatasetCaptureService {
  captureBeforeAction(
    input: CaptureVisualDatasetSampleInput,
  ): ReturnType<VisualDatasetCaptureService['captureBeforeAction']>;
}

export class MixMateusLeafletExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MixMateusLeafletExtractionError';
  }
}

export class MixMateusLeafletExtractor {
  private readonly pageFactory: MixMateusLeafletPageFactory;

  private readonly clock: Clock;

  private readonly logger: Logger;

  private readonly visualDatasetCaptureService: MixMateusVisualDatasetCaptureService | undefined;

  constructor(
    pageFactory: MixMateusLeafletPageFactory,
    clock: Clock,
    logger: Logger,
    visualDatasetCaptureService?: MixMateusVisualDatasetCaptureService,
  ) {
    this.pageFactory = pageFactory;
    this.clock = clock;
    this.logger = logger;
    this.visualDatasetCaptureService = visualDatasetCaptureService;
  }

  async extract(input: ExtractMixMateusLeafletsInput): Promise<MixMateusLeafletExtractionResult> {
    validateInput(input);

    const extractedStores: MixMateusExtractedStore[] = [];
    const failedStores: MixMateusFailedStore[] = [];

    for (const store of input.stores) {
      this.logger.info('Starting Mix Mateus store PDF leaflet extraction.', {
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        cityName: store.cityName,
        stateCode: store.stateCode,
      });

      const result = await this.extractStoreWithRetry(input, store);

      if (result.status === 'failed') {
        failedStores.push({
          store,
          sourceUrl: input.homeUrl,
          errorMessage: result.errorMessage,
        });
        continue;
      }

      if (result.leaflets.length === 0) {
        this.logger.info('No Mix Mateus leaflets found for store.', {
          storeSlug: store.storeSlug,
          storeName: store.storeName,
          cityName: store.cityName,
          stateCode: store.stateCode,
          attempts: result.attempts,
        });
      }

      extractedStores.push({
        store,
        sourceUrl: result.sourceUrl,
        leaflets: result.leaflets,
      });
    }

    return {
      source: 'mixmateus-playwright',
      extractedAtIso: this.clock.nowIso(),
      stores: extractedStores,
      failedStores,
    };
  }

  private async extractStoreWithRetry(
    input: ExtractMixMateusLeafletsInput,
    store: MixMateusMonitoredStore,
  ): Promise<
    | {
        readonly status: 'succeeded';
        readonly attempts: number;
        readonly sourceUrl: string;
        readonly leaflets: readonly ExtractedMixMateusPdfLeaflet[];
      }
    | {
        readonly status: 'failed';
        readonly errorMessage: string;
      }
  > {
    let lastErrorMessage = 'Unknown Mix Mateus store extraction failure.';

    for (let attempt = 1; attempt <= input.maxStoreAttempts; attempt += 1) {
      try {
        const output = await withTimeout(
          this.extractStore(input, store),
          input.storeTimeoutMs,
          `Mix Mateus store ${store.storeSlug} extraction timed out.`,
        );

        return {
          ...output,
          attempts: attempt,
        };
      } catch (error) {
        if (error instanceof Error) {
          lastErrorMessage = error.message;
        } else {
          lastErrorMessage = 'Unexpected Mix Mateus store extraction failure.';
        }
        this.logger.warn('Mix Mateus store extraction attempt failed.', {
          storeSlug: store.storeSlug,
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
    input: ExtractMixMateusLeafletsInput,
    store: MixMateusMonitoredStore,
  ): Promise<{
    readonly status: 'succeeded';
    readonly sourceUrl: string;
    readonly leaflets: readonly ExtractedMixMateusPdfLeaflet[];
  }> {
    const page = await this.pageFactory.openPage({
      viewport: input.viewport,
      timeoutMs: input.timeoutMs,
    });

    try {
      await page.goto(input.homeUrl);
      await page.waitForTimeout(input.settleDelayMs);
      await page.dismissCookieBanner();
      await this.captureStateSelectionIfEnabled(page, input, store);
      await page.selectState(store);
      await page.waitForTimeout(input.settleDelayMs);
      await this.captureCitySelectionIfEnabled(page, input, store);
      await page.selectCity(store);
      await page.waitForTimeout(input.settleDelayMs);
      await this.captureStoreSelectionIfEnabled(page, input, store);
      await page.selectStore(store);
      await page.waitForStoreLeaflets(store);
      await page.waitForTimeout(input.settleDelayMs);

      const cards = await page.discoverCards();
      const leaflets: ExtractedMixMateusPdfLeaflet[] = [];

      for (const card of cards) {
        await this.captureLeafletCardIfEnabled(page, input, store, card);
        await page.openLeafletAt(card.cardIndex);
        await page.waitForTimeout(input.settleDelayMs);
        await this.capturePdfDownloadIfEnabled(page, input, store, card);
        const pdfUrl = await page.resolvePdfDownloadUrl();

        if (pdfUrl.trim().length === 0) {
          throw new MixMateusLeafletExtractionError(
            `Mix Mateus leaflet card ${String(card.cardIndex)} did not expose a PDF URL.`,
          );
        }

        leaflets.push({
          leafletId: createMixMateusLeafletId(store, card),
          title: card.title,
          cardIndex: card.cardIndex,
          pdfUrl,
        });
        await page.closeLeafletModal();
      }

      return {
        status: 'succeeded',
        sourceUrl: store.finalPageUrl,
        leaflets,
      };
    } finally {
      await page.close();
    }
  }

  private async captureStateSelectionIfEnabled(
    page: MixMateusLeafletPage,
    input: ExtractMixMateusLeafletsInput,
    store: MixMateusMonitoredStore,
  ): Promise<void> {
    if (input.visualDataset === undefined || this.visualDatasetCaptureService === undefined) {
      return;
    }

    const visualTarget = await page.getStateSelectionVisualTarget(store);

    await this.visualDatasetCaptureService.captureBeforeAction({
      sampleId: `${input.visualDataset.runId}-${store.storeSlug}-select-state`,
      runId: input.visualDataset.runId,
      supermarketId: 'mixmateus',
      stateName: 'STATE_SELECTION',
      label: 'select_state_button',
      subject: {
        subjectKind: 'mixmateus-state-selection',
        stateCode: store.stateCode,
        stateName: store.stateName,
      },
      split: input.visualDataset.split,
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }

  private async captureCitySelectionIfEnabled(
    page: MixMateusLeafletPage,
    input: ExtractMixMateusLeafletsInput,
    store: MixMateusMonitoredStore,
  ): Promise<void> {
    if (input.visualDataset === undefined || this.visualDatasetCaptureService === undefined) {
      return;
    }

    const visualTarget = await page.getCitySelectionVisualTarget(store);

    await this.visualDatasetCaptureService.captureBeforeAction({
      sampleId: `${input.visualDataset.runId}-${store.storeSlug}-select-city`,
      runId: input.visualDataset.runId,
      supermarketId: 'mixmateus',
      stateName: 'CITY_SELECTION',
      label: 'select_city_button',
      subject: {
        subjectKind: 'mixmateus-city-selection',
        stateCode: store.stateCode,
        cityName: store.cityName,
      },
      split: input.visualDataset.split,
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }

  private async captureStoreSelectionIfEnabled(
    page: MixMateusLeafletPage,
    input: ExtractMixMateusLeafletsInput,
    store: MixMateusMonitoredStore,
  ): Promise<void> {
    if (input.visualDataset === undefined || this.visualDatasetCaptureService === undefined) {
      return;
    }

    const visualTarget = await page.getStoreSelectionVisualTarget(store);

    await this.visualDatasetCaptureService.captureBeforeAction({
      sampleId: `${input.visualDataset.runId}-${store.storeSlug}-select-store`,
      runId: input.visualDataset.runId,
      supermarketId: 'mixmateus',
      stateName: 'STORE_SELECTION',
      label: 'select_store_button',
      subject: {
        subjectKind: 'mixmateus-store-selection',
        stateCode: store.stateCode,
        cityName: store.cityName,
        storeSlug: store.storeSlug,
        storeName: store.storeName,
      },
      split: input.visualDataset.split,
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }

  private async captureLeafletCardIfEnabled(
    page: MixMateusLeafletPage,
    input: ExtractMixMateusLeafletsInput,
    store: MixMateusMonitoredStore,
    card: MixMateusLeafletCard,
  ): Promise<void> {
    if (input.visualDataset === undefined || this.visualDatasetCaptureService === undefined) {
      return;
    }

    const visualTarget = await page.getLeafletCardVisualTarget(card.cardIndex);

    await this.visualDatasetCaptureService.captureBeforeAction({
      sampleId: `${input.visualDataset.runId}-${createMixMateusLeafletId(store, card)}-open-card`,
      runId: input.visualDataset.runId,
      supermarketId: 'mixmateus',
      stateName: 'LEAFLETS_PAGE',
      label: 'open_leaflet_modal_button',
      subject: {
        subjectKind: 'mixmateus-leaflet-card',
        stateCode: store.stateCode,
        cityName: store.cityName,
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        cardIndex: card.cardIndex,
        leafletTitle: card.title,
      },
      split: input.visualDataset.split,
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }

  private async capturePdfDownloadIfEnabled(
    page: MixMateusLeafletPage,
    input: ExtractMixMateusLeafletsInput,
    store: MixMateusMonitoredStore,
    card: MixMateusLeafletCard,
  ): Promise<void> {
    if (input.visualDataset === undefined || this.visualDatasetCaptureService === undefined) {
      return;
    }

    const visualTarget = await page.getPdfDownloadVisualTarget();

    await this.visualDatasetCaptureService.captureBeforeAction({
      sampleId: `${input.visualDataset.runId}-${createMixMateusLeafletId(store, card)}-download-pdf`,
      runId: input.visualDataset.runId,
      supermarketId: 'mixmateus',
      stateName: 'PDF_DOWNLOAD',
      label: 'download_pdf_button',
      subject: {
        subjectKind: 'mixmateus-pdf-download',
        stateCode: store.stateCode,
        cityName: store.cityName,
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        cardIndex: card.cardIndex,
        leafletTitle: card.title,
      },
      split: input.visualDataset.split,
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }
}

function validateInput(input: ExtractMixMateusLeafletsInput): void {
  validateUrl(input.homeUrl);
  validatePositiveInteger(input.timeoutMs, 'timeoutMs');
  validatePositiveInteger(input.storeTimeoutMs, 'storeTimeoutMs');
  validatePositiveInteger(input.maxStoreAttempts, 'maxStoreAttempts');

  if (!Number.isInteger(input.settleDelayMs) || input.settleDelayMs < 0) {
    throw new MixMateusLeafletExtractionError('settleDelayMs must be a non-negative integer.');
  }
}

function validateUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new MixMateusLeafletExtractionError('homeUrl must be absolute and valid.');
  }
}

function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new MixMateusLeafletExtractionError(`${fieldName} must be a positive integer.`);
  }
}

function createMixMateusLeafletId(
  store: MixMateusMonitoredStore,
  card: MixMateusLeafletCard,
): string {
  return `${store.storeSlug}-${String(card.cardIndex + 1).padStart(2, '0')}-${slugify(card.title)}`;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : 'leaflet';
}

function withTimeout<TValue>(
  promise: Promise<TValue>,
  timeoutMs: number,
  message: string,
): Promise<TValue> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new MixMateusLeafletExtractionError(message));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timeout);
      });
  });
}
