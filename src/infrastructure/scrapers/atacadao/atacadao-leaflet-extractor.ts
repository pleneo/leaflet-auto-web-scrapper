import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  CaptureVisualDatasetSampleInput,
  VisualDatasetCaptureService,
} from '../../../application/services/visual-dataset-capture-service';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type {
  AtacadaoLeafletCard,
  AtacadaoLeafletPage,
  AtacadaoLeafletPageFactory,
  AtacadaoLeafletVisualTarget,
} from './atacadao-leaflet-page';
import type {
  AtacadaoExtractedStore,
  AtacadaoFailedStore,
  ExtractedAtacadaoPdfLeaflet,
} from './atacadao-pdf-leaflet';
import type { AtacadaoMonitoredStore } from './atacadao-targets';

export interface ExtractAtacadaoLeafletsInput {
  readonly stores: readonly AtacadaoMonitoredStore[];
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly storeTimeoutMs: number;
  readonly maxStoreAttempts: number;
  readonly settleDelayMs: number;
  readonly visualDataset?: ExtractAtacadaoVisualDatasetInput;
}

export interface ExtractAtacadaoVisualDatasetInput {
  readonly runId: string;
  readonly split: DatasetSplit;
}

export interface AtacadaoLeafletExtractionResult {
  readonly source: 'atacadao-playwright';
  readonly extractedAtIso: string;
  readonly stores: readonly AtacadaoExtractedStore[];
  readonly failedStores: readonly AtacadaoFailedStore[];
}

interface AtacadaoVisualDatasetCaptureService {
  captureBeforeAction(
    input: CaptureVisualDatasetSampleInput,
  ): ReturnType<VisualDatasetCaptureService['captureBeforeAction']>;
}

export class AtacadaoLeafletExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AtacadaoLeafletExtractionError';
  }
}

export class AtacadaoLeafletExtractor {
  private readonly pageFactory: AtacadaoLeafletPageFactory;

  private readonly clock: Clock;

  private readonly logger: Logger;

  private readonly visualDatasetCaptureService: AtacadaoVisualDatasetCaptureService | undefined;

  constructor(
    pageFactory: AtacadaoLeafletPageFactory,
    clock: Clock,
    logger: Logger,
    visualDatasetCaptureService?: AtacadaoVisualDatasetCaptureService,
  ) {
    this.pageFactory = pageFactory;
    this.clock = clock;
    this.logger = logger;
    this.visualDatasetCaptureService = visualDatasetCaptureService;
  }

  async extract(input: ExtractAtacadaoLeafletsInput): Promise<AtacadaoLeafletExtractionResult> {
    validateInput(input);

    const extractedStores: AtacadaoExtractedStore[] = [];
    const failedStores: AtacadaoFailedStore[] = [];

    for (const store of input.stores) {
      this.logger.info('Starting Atacadao store PDF leaflet extraction.', {
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        cityName: store.cityName,
        stateCode: store.stateCode,
      });

      const result = await this.extractStoreWithRetry(input, store);

      if (result.status === 'failed') {
        failedStores.push({
          store,
          sourceUrl: store.finalPageUrl,
          errorMessage: result.errorMessage,
        });
        continue;
      }

      if (result.leaflets.length === 0) {
        this.logger.info('No Atacadao leaflets found for store.', {
          storeSlug: store.storeSlug,
          storeName: store.storeName,
          cityName: store.cityName,
          stateCode: store.stateCode,
          attempts: result.attempts,
        });
      }

      this.logger.info('Atacadao store PDF leaflet extraction completed.', {
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        leaflets: result.leaflets.length,
        attempts: result.attempts,
      });
      extractedStores.push({
        store,
        sourceUrl: result.sourceUrl,
        leaflets: result.leaflets,
      });
    }

    return {
      source: 'atacadao-playwright',
      extractedAtIso: this.clock.nowIso(),
      stores: extractedStores,
      failedStores,
    };
  }

  private async extractStoreWithRetry(
    input: ExtractAtacadaoLeafletsInput,
    store: AtacadaoMonitoredStore,
  ): Promise<
    | {
        readonly status: 'succeeded';
        readonly attempts: number;
        readonly sourceUrl: string;
        readonly leaflets: readonly ExtractedAtacadaoPdfLeaflet[];
      }
    | {
        readonly status: 'failed';
        readonly errorMessage: string;
      }
  > {
    let lastErrorMessage = 'Unknown Atacadao store extraction failure.';

    for (let attempt = 1; attempt <= input.maxStoreAttempts; attempt += 1) {
      try {
        const output = await withTimeout(
          this.extractStore(input, store),
          input.storeTimeoutMs,
          `Atacadao store ${store.storeSlug} extraction timed out.`,
        );

        return {
          ...output,
          attempts: attempt,
        };
      } catch (error) {
        lastErrorMessage =
          error instanceof Error ? error.message : 'Unexpected Atacadao store extraction failure.';
        this.logger.warn('Atacadao store extraction attempt failed.', {
          storeSlug: store.storeSlug,
          storeName: store.storeName,
          attempt,
          errorMessage: lastErrorMessage,
        });
      }
    }

    return {
      status: 'failed',
      errorMessage: lastErrorMessage,
    };
  }

  private async extractStore(
    input: ExtractAtacadaoLeafletsInput,
    store: AtacadaoMonitoredStore,
  ): Promise<{
    readonly status: 'succeeded';
    readonly sourceUrl: string;
    readonly leaflets: readonly ExtractedAtacadaoPdfLeaflet[];
  }> {
    const page = await this.pageFactory.openPage({
      viewport: input.viewport,
      timeoutMs: input.timeoutMs,
    });

    try {
      const sourceUrl = await this.resolveReachableStorePageUrl(page, input, store);
      const leaflets = await this.extractStoreLeafletsFromCurrentPage(page, input, store);

      return {
        status: 'succeeded',
        sourceUrl,
        leaflets,
      };
    } finally {
      await page.close();
    }
  }

  private async resolveReachableStorePageUrl(
    page: AtacadaoLeafletPage,
    input: ExtractAtacadaoLeafletsInput,
    store: AtacadaoMonitoredStore,
  ): Promise<string> {
    await page.goto(store.finalPageUrl);
    await page.waitForTimeout(input.settleDelayMs);
    await page.dismissCookieBanner();

    if (!(await page.isStorePageUnavailable())) {
      try {
        await page.waitForStoreLeaflets(store);
        await page.waitForTimeout(input.settleDelayMs);

        return store.finalPageUrl;
      } catch (error) {
        this.logger.warn(
          'Atacadao direct store URL did not expose leaflets; resolving by directory.',
          {
            storeSlug: store.storeSlug,
            storeName: store.storeName,
            errorMessage: error instanceof Error ? error.message : 'Unexpected direct URL failure.',
          },
        );
      }
    } else {
      this.logger.warn('Atacadao direct store URL is unavailable; resolving by directory.', {
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        sourceUrl: store.finalPageUrl,
      });
    }

    const resolvedUrl = await page.resolveStorePageUrl(store);

    if (resolvedUrl === null) {
      throw new AtacadaoLeafletExtractionError(
        `Atacadao store ${store.storeName} could not be resolved from the store directory.`,
      );
    }

    this.logger.info('Atacadao store URL resolved from directory.', {
      storeSlug: store.storeSlug,
      storeName: store.storeName,
      previousUrl: store.finalPageUrl,
      resolvedUrl,
    });

    await page.goto(resolvedUrl);
    await page.waitForTimeout(input.settleDelayMs);
    await page.waitForStoreLeaflets({
      ...store,
      finalPageUrl: resolvedUrl,
      storeSlug: extractStoreSlugFromUrl(resolvedUrl),
    });
    await page.waitForTimeout(input.settleDelayMs);

    return resolvedUrl;
  }

  private async extractStoreLeafletsFromCurrentPage(
    page: AtacadaoLeafletPage,
    input: ExtractAtacadaoLeafletsInput,
    store: AtacadaoMonitoredStore,
  ): Promise<readonly ExtractedAtacadaoPdfLeaflet[]> {
    await this.expandAllLeaflets(page, input, store);

    const cards = await page.discoverCards();
    const leaflets: ExtractedAtacadaoPdfLeaflet[] = [];

    for (const card of cards) {
      await this.captureLeafletCardIfEnabled(page, input, store, card);

      if (card.pdfUrl.trim().length === 0) {
        throw new AtacadaoLeafletExtractionError(
          `Atacadao leaflet card ${String(card.cardIndex)} did not expose a PDF URL.`,
        );
      }

      leaflets.push({
        leafletId: createAtacadaoLeafletId(store, card),
        title: normalizeLeafletTitle(card.title),
        cardIndex: card.cardIndex,
        pdfUrl: card.pdfUrl,
        validityText: card.validityText,
      });
    }

    return leaflets;
  }

  private async expandAllLeaflets(
    page: AtacadaoLeafletPage,
    input: ExtractAtacadaoLeafletsInput,
    store: AtacadaoMonitoredStore,
  ): Promise<void> {
    while (await page.hasMoreLeaflets()) {
      await this.captureShowMoreLeafletsIfEnabled(page, input, store);
      await page.showMoreLeaflets();
      await page.waitForTimeout(input.settleDelayMs);
    }
  }

  private async captureShowMoreLeafletsIfEnabled(
    page: AtacadaoLeafletPage,
    input: ExtractAtacadaoLeafletsInput,
    store: AtacadaoMonitoredStore,
  ): Promise<void> {
    if (input.visualDataset === undefined || this.visualDatasetCaptureService === undefined) {
      return;
    }

    const visualTarget = await page.getShowMoreLeafletsVisualTarget();

    await this.captureBeforeAction(this.visualDatasetCaptureService, visualTarget, {
      sampleId: `${input.visualDataset.runId}-${store.storeSlug}-show-more-leaflets`,
      runId: input.visualDataset.runId,
      stateName: 'LEAFLETS_PAGE',
      label: 'show_more_leaflets_button',
      split: input.visualDataset.split,
      subject: {
        subjectKind: 'atacadao-show-more-leaflets',
        stateCode: store.stateCode,
        cityName: store.cityName,
        storeSlug: store.storeSlug,
        storeName: store.storeName,
      },
    });
  }

  private async captureLeafletCardIfEnabled(
    page: AtacadaoLeafletPage,
    input: ExtractAtacadaoLeafletsInput,
    store: AtacadaoMonitoredStore,
    card: AtacadaoLeafletCard,
  ): Promise<void> {
    if (input.visualDataset === undefined || this.visualDatasetCaptureService === undefined) {
      return;
    }

    const visualTarget = await page.getLeafletCardVisualTarget(card.cardIndex);

    await this.captureBeforeAction(this.visualDatasetCaptureService, visualTarget, {
      sampleId: `${input.visualDataset.runId}-${store.storeSlug}-card-${String(card.cardIndex + 1)}`,
      runId: input.visualDataset.runId,
      stateName: 'PDF_DOWNLOAD',
      label: 'download_pdf_button',
      split: input.visualDataset.split,
      subject: {
        subjectKind: 'atacadao-leaflet-card',
        stateCode: store.stateCode,
        cityName: store.cityName,
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        cardIndex: card.cardIndex,
        leafletTitle: card.title,
      },
    });
  }

  private async captureBeforeAction(
    captureService: AtacadaoVisualDatasetCaptureService,
    visualTarget: AtacadaoLeafletVisualTarget,
    input: Omit<CaptureVisualDatasetSampleInput, 'supermarketId' | 'page' | 'target'>,
  ): Promise<void> {
    await captureService.captureBeforeAction({
      ...input,
      supermarketId: 'atacadao',
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }
}

function validateInput(input: ExtractAtacadaoLeafletsInput): void {
  if (input.stores.length === 0) {
    throw new AtacadaoLeafletExtractionError('Atacadao extraction requires at least one store.');
  }

  if (input.timeoutMs <= 0 || input.storeTimeoutMs <= 0 || input.maxStoreAttempts <= 0) {
    throw new AtacadaoLeafletExtractionError(
      'Atacadao extraction timeouts and attempts must be positive.',
    );
  }

  if (input.settleDelayMs < 0) {
    throw new AtacadaoLeafletExtractionError('Atacadao settle delay cannot be negative.');
  }
}

function createAtacadaoLeafletId(store: AtacadaoMonitoredStore, card: AtacadaoLeafletCard): string {
  return `${store.storeSlug}-${String(card.cardIndex + 1).padStart(2, '0')}-${slugify(normalizeLeafletTitle(card.title))}`;
}

function normalizeLeafletTitle(value: string): string {
  const normalizedTitle = value.trim().replace(/\s+/g, ' ');

  return normalizedTitle.length === 0 ? 'Leaflet' : normalizedTitle;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractStoreSlugFromUrl(value: string): string {
  const normalizedUrl = value.replace(/\/+$/, '');

  return normalizedUrl.substring(normalizedUrl.lastIndexOf('/') + 1);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new AtacadaoLeafletExtractionError(message));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timeout);
      });
  });
}
