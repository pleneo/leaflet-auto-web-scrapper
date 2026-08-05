import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  CaptureVisualDatasetSampleInput,
  VisualDatasetCaptureService,
} from '../../../application/services/visual-dataset-capture-service';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { VisualViewport } from '../../../domain/visual/viewport';
import {
  findAssaiCatalogStore,
  listAssaiLeafletsForStore,
  type AssaiCatalogStore,
  type AssaiOfferCatalog,
} from './assai-offer-catalog';
import type { AssaiCachedStoreUrl } from './assai-store-url-cache';
import type {
  AssaiExtractedStore,
  AssaiFailedStore,
  ExtractedAssaiImageGalleryLeaflet,
} from './assai-image-gallery-leaflet';
import type {
  AssaiLeafletPage,
  AssaiLeafletPageFactory,
  AssaiLeafletVisualTarget,
} from './assai-leaflet-page';
import type { AssaiMonitoredStore } from './assai-targets';

export interface ExtractAssaiLeafletsInput {
  readonly stores: readonly AssaiMonitoredStore[];
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly storeTimeoutMs: number;
  readonly maxStoreAttempts: number;
  readonly settleDelayMs: number;
  readonly visualDataset?: ExtractAssaiVisualDatasetInput;
}

export interface ExtractAssaiVisualDatasetInput {
  readonly runId: string;
  readonly split: DatasetSplit;
}

export interface AssaiLeafletExtractionResult {
  readonly source: 'assai-playwright';
  readonly extractedAtIso: string;
  readonly stores: readonly AssaiExtractedStore[];
  readonly failedStores: readonly AssaiFailedStore[];
}

export interface AssaiOfferCatalogProvider {
  fetchCatalog(): Promise<AssaiOfferCatalog>;
}

export interface AssaiStoreUrlCachePort {
  get(storeSlug: string): Promise<string | null>;
  set(input: AssaiCachedStoreUrl): Promise<string>;
}

interface AssaiVisualDatasetCaptureService {
  captureBeforeAction(
    input: CaptureVisualDatasetSampleInput,
  ): ReturnType<VisualDatasetCaptureService['captureBeforeAction']>;
}

export class AssaiLeafletExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssaiLeafletExtractionError';
  }
}

export class AssaiLeafletExtractor {
  private readonly pageFactory: AssaiLeafletPageFactory;

  private readonly catalogProvider: AssaiOfferCatalogProvider;

  private readonly storeUrlCache: AssaiStoreUrlCachePort;

  private readonly clock: Clock;

  private readonly logger: Logger;

  private readonly visualDatasetCaptureService: AssaiVisualDatasetCaptureService | undefined;

  constructor(
    pageFactory: AssaiLeafletPageFactory,
    catalogProvider: AssaiOfferCatalogProvider,
    storeUrlCache: AssaiStoreUrlCachePort,
    clock: Clock,
    logger: Logger,
    visualDatasetCaptureService?: AssaiVisualDatasetCaptureService,
  ) {
    this.pageFactory = pageFactory;
    this.catalogProvider = catalogProvider;
    this.storeUrlCache = storeUrlCache;
    this.clock = clock;
    this.logger = logger;
    this.visualDatasetCaptureService = visualDatasetCaptureService;
  }

  async extract(input: ExtractAssaiLeafletsInput): Promise<AssaiLeafletExtractionResult> {
    validateInput(input);

    const catalog = await this.catalogProvider.fetchCatalog();
    const extractedStores: AssaiExtractedStore[] = [];
    const failedStores: AssaiFailedStore[] = [];

    for (const store of input.stores) {
      this.logger.info('Starting Assai image leaflet extraction.', {
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        cityName: store.cityName,
        stateCode: store.stateCode,
      });

      const result = await this.extractStoreWithRetry(input, catalog, store);

      if (result.status === 'failed') {
        failedStores.push({
          store,
          sourceUrl: store.initialPageUrl,
          errorMessage: result.errorMessage,
        });
        continue;
      }

      if (result.leaflets.length === 0) {
        this.logger.info('No Assai leaflets found for store.', {
          storeSlug: store.storeSlug,
          storeName: store.storeName,
          cityName: store.cityName,
          stateCode: store.stateCode,
          attempts: result.attempts,
        });
      }

      this.logger.info('Assai image leaflet extraction completed.', {
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
      source: 'assai-playwright',
      extractedAtIso: this.clock.nowIso(),
      stores: extractedStores,
      failedStores,
    };
  }

  private async extractStoreWithRetry(
    input: ExtractAssaiLeafletsInput,
    catalog: AssaiOfferCatalog,
    store: AssaiMonitoredStore,
  ): Promise<
    | {
        readonly status: 'succeeded';
        readonly attempts: number;
        readonly sourceUrl: string;
        readonly leaflets: readonly ExtractedAssaiImageGalleryLeaflet[];
      }
    | {
        readonly status: 'failed';
        readonly errorMessage: string;
      }
  > {
    let lastErrorMessage = 'Unknown Assai store extraction failure.';

    for (let attempt = 1; attempt <= input.maxStoreAttempts; attempt += 1) {
      try {
        const output = await withTimeout(
          this.extractStore(input, catalog, store),
          input.storeTimeoutMs,
          `Assai store ${store.storeSlug} extraction timed out.`,
        );

        return {
          ...output,
          attempts: attempt,
        };
      } catch (error) {
        lastErrorMessage =
          error instanceof Error ? error.message : 'Unexpected Assai store extraction failure.';
        this.logger.warn('Assai store extraction attempt failed.', {
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
    input: ExtractAssaiLeafletsInput,
    catalog: AssaiOfferCatalog,
    store: AssaiMonitoredStore,
  ): Promise<{
    readonly status: 'succeeded';
    readonly sourceUrl: string;
    readonly leaflets: readonly ExtractedAssaiImageGalleryLeaflet[];
  }> {
    const catalogStore = findAssaiCatalogStore(catalog, store);

    if (catalogStore === null) {
      throw new AssaiLeafletExtractionError(
        `Assai store ${store.storeName} was not found in the offer catalog.`,
      );
    }

    const page = await this.pageFactory.openPage({
      viewport: input.viewport,
      timeoutMs: input.timeoutMs,
    });

    try {
      const sourceUrl = await this.resolveLeafletsPageUrl(page, input, store, catalogStore);
      const leaflets = await this.extractStoreLeafletsFromCatalog(
        page,
        input,
        store,
        catalogStore,
        catalog,
      );

      return {
        status: 'succeeded',
        sourceUrl,
        leaflets,
      };
    } finally {
      await page.close();
    }
  }

  private async resolveLeafletsPageUrl(
    page: AssaiLeafletPage,
    input: ExtractAssaiLeafletsInput,
    store: AssaiMonitoredStore,
    catalogStore: AssaiCatalogStore,
  ): Promise<string> {
    for (const candidateUrl of await this.createCandidateUrls(store, catalogStore)) {
      if (await this.tryOpenLeafletsPage(page, input, candidateUrl)) {
        return candidateUrl;
      }

      this.logger.warn('Assai direct offer URL did not expose leaflets; trying next path.', {
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        candidateUrl,
      });
    }

    return this.resolveLeafletsPageUrlFromHome(page, input, store);
  }

  private async createCandidateUrls(
    store: AssaiMonitoredStore,
    catalogStore: AssaiCatalogStore,
  ): Promise<readonly string[]> {
    const cachedUrl = await this.storeUrlCache.get(store.storeSlug);
    const catalogUrl = createAbsoluteAssaiUrl(catalogStore.offerUrlPath);

    return [...new Set([cachedUrl, store.initialPageUrl, catalogUrl].filter(isNonNullString))];
  }

  private async tryOpenLeafletsPage(
    page: AssaiLeafletPage,
    input: ExtractAssaiLeafletsInput,
    candidateUrl: string,
  ): Promise<boolean> {
    await page.goto(candidateUrl);
    await page.waitForTimeout(input.settleDelayMs);
    await page.dismissCookieBanner();

    if (!(await page.isLeafletsPageAvailable())) {
      return false;
    }

    await page.waitForLeafletsPage();
    await page.waitForTimeout(input.settleDelayMs);

    return true;
  }

  private async resolveLeafletsPageUrlFromHome(
    page: AssaiLeafletPage,
    input: ExtractAssaiLeafletsInput,
    store: AssaiMonitoredStore,
  ): Promise<string> {
    await page.gotoHome();
    await page.waitForTimeout(input.settleDelayMs);
    await page.dismissCookieBanner();
    await this.captureOffersLinkIfEnabled(page, input, store);
    await page.openOffersPage();
    await page.waitForTimeout(input.settleDelayMs);
    await this.captureChooseStoreIfEnabled(page, input, store);
    await page.openStoreSelector();
    await page.waitForTimeout(input.settleDelayMs);
    await this.captureStateSelectIfEnabled(page, input, store);
    await page.selectState(store);
    await page.waitForTimeout(input.settleDelayMs);
    await this.captureCitySelectIfEnabled(page, input, store);
    await page.selectCity(store);
    await page.waitForTimeout(input.settleDelayMs);
    await this.captureStoreSelectIfEnabled(page, input, store);
    await page.selectStore(store);
    await page.waitForTimeout(input.settleDelayMs);
    await this.captureConfirmStoreIfEnabled(page, input, store);
    await page.confirmStoreSelection();
    await page.waitForLeafletsPage();
    await page.waitForTimeout(input.settleDelayMs);

    const resolvedUrl = await page.getCurrentUrl();
    await this.persistResolvedUrl(store, resolvedUrl);

    return resolvedUrl;
  }

  private async extractStoreLeafletsFromCatalog(
    page: AssaiLeafletPage,
    input: ExtractAssaiLeafletsInput,
    store: AssaiMonitoredStore,
    catalogStore: AssaiCatalogStore,
    catalog: AssaiOfferCatalog,
  ): Promise<readonly ExtractedAssaiImageGalleryLeaflet[]> {
    const catalogLeaflets = listAssaiLeafletsForStore(catalog, catalogStore);
    const leaflets: ExtractedAssaiImageGalleryLeaflet[] = [];

    for (const [index, catalogLeaflet] of catalogLeaflets.entries()) {
      await this.captureLeafletTabIfEnabled(page, input, store, index);
      await page.openLeafletTab(index);
      await page.waitForTimeout(input.settleDelayMs);
      await this.captureDownloadImageIfEnabled(page, input, store, index);
      leaflets.push({
        leafletId: createAssaiLeafletId(store, catalogLeaflet.leafletId, catalogLeaflet.title),
        title: normalizeLeafletTitle(catalogLeaflet.title),
        coverImageUrl: catalogLeaflet.imageUrls[0] ?? catalogLeaflet.leafletId,
        imageUrls: catalogLeaflet.imageUrls,
        startDateIso: catalogLeaflet.startDateIso,
        endDateIso: catalogLeaflet.endDateIso,
      });
    }

    return leaflets;
  }

  private async persistResolvedUrl(store: AssaiMonitoredStore, resolvedUrl: string): Promise<void> {
    try {
      await this.storeUrlCache.set({
        storeSlug: store.storeSlug,
        resolvedOfferUrl: resolvedUrl,
        resolvedAtIso: this.clock.nowIso(),
      });
      this.logger.info('Assai store offer URL cached.', {
        storeSlug: store.storeSlug,
        resolvedUrl,
      });
    } catch (error) {
      this.logger.warn('Assai resolved store URL could not be cached.', {
        storeSlug: store.storeSlug,
        errorMessage:
          error instanceof Error ? error.message : 'Unexpected cache persistence failure.',
      });
    }
  }

  private async captureOffersLinkIfEnabled(
    page: AssaiLeafletPage,
    input: ExtractAssaiLeafletsInput,
    store: AssaiMonitoredStore,
  ): Promise<void> {
    await this.captureIfEnabled(page.getOffersLinkVisualTarget(), input, store, {
      sampleSuffix: 'open-offers',
      stateName: 'ANCHOR_PAGE',
      label: 'open_leaflets_page_button',
    });
  }

  private async captureChooseStoreIfEnabled(
    page: AssaiLeafletPage,
    input: ExtractAssaiLeafletsInput,
    store: AssaiMonitoredStore,
  ): Promise<void> {
    await this.captureIfEnabled(page.getChooseStoreVisualTarget(), input, store, {
      sampleSuffix: 'choose-store',
      stateName: 'LEAFLETS_PAGE',
      label: 'select_store_button',
    });
  }

  private async captureStateSelectIfEnabled(
    page: AssaiLeafletPage,
    input: ExtractAssaiLeafletsInput,
    store: AssaiMonitoredStore,
  ): Promise<void> {
    await this.captureIfEnabled(page.getStateSelectVisualTarget(), input, store, {
      sampleSuffix: 'select-state',
      stateName: 'STATE_SELECTION',
      label: 'select_state_button',
    });
  }

  private async captureCitySelectIfEnabled(
    page: AssaiLeafletPage,
    input: ExtractAssaiLeafletsInput,
    store: AssaiMonitoredStore,
  ): Promise<void> {
    await this.captureIfEnabled(page.getCitySelectVisualTarget(), input, store, {
      sampleSuffix: 'select-city',
      stateName: 'CITY_SELECTION',
      label: 'select_city_button',
    });
  }

  private async captureStoreSelectIfEnabled(
    page: AssaiLeafletPage,
    input: ExtractAssaiLeafletsInput,
    store: AssaiMonitoredStore,
  ): Promise<void> {
    await this.captureIfEnabled(page.getStoreSelectVisualTarget(), input, store, {
      sampleSuffix: 'select-store',
      stateName: 'STORE_SELECTION',
      label: 'select_store_button',
    });
  }

  private async captureConfirmStoreIfEnabled(
    page: AssaiLeafletPage,
    input: ExtractAssaiLeafletsInput,
    store: AssaiMonitoredStore,
  ): Promise<void> {
    await this.captureIfEnabled(page.getConfirmStoreVisualTarget(), input, store, {
      sampleSuffix: 'confirm-store',
      stateName: 'STORE_SELECTION',
      label: 'select_store_button',
    });
  }

  private async captureLeafletTabIfEnabled(
    page: AssaiLeafletPage,
    input: ExtractAssaiLeafletsInput,
    store: AssaiMonitoredStore,
    tabIndex: number,
  ): Promise<void> {
    await this.captureIfEnabled(page.getLeafletTabVisualTarget(tabIndex), input, store, {
      sampleSuffix: `leaflet-tab-${String(tabIndex + 1)}`,
      stateName: 'LEAFLETS_PAGE',
      label: 'open_leaflet_modal_button',
      targetIndex: tabIndex,
    });
  }

  private async captureDownloadImageIfEnabled(
    page: AssaiLeafletPage,
    input: ExtractAssaiLeafletsInput,
    store: AssaiMonitoredStore,
    tabIndex: number,
  ): Promise<void> {
    await this.captureIfEnabled(page.getDownloadImageVisualTarget(), input, store, {
      sampleSuffix: `download-image-${String(tabIndex + 1)}`,
      stateName: 'IMAGE_GALLERY',
      label: 'extract_leaflet_image',
      targetIndex: tabIndex,
    });
  }

  private async captureIfEnabled(
    visualTargetPromise: Promise<AssaiLeafletVisualTarget>,
    input: ExtractAssaiLeafletsInput,
    store: AssaiMonitoredStore,
    sample: Omit<
      CaptureVisualDatasetSampleInput,
      'runId' | 'supermarketId' | 'sampleId' | 'page' | 'target' | 'split' | 'subject'
    > & {
      readonly sampleSuffix: string;
      readonly targetIndex?: number;
    },
  ): Promise<void> {
    if (input.visualDataset === undefined || this.visualDatasetCaptureService === undefined) {
      return;
    }

    const visualTarget = await visualTargetPromise;

    await this.visualDatasetCaptureService.captureBeforeAction({
      sampleId: `${input.visualDataset.runId}-${store.storeSlug}-${sample.sampleSuffix}`,
      runId: input.visualDataset.runId,
      supermarketId: 'assai',
      page: visualTarget.page,
      target: visualTarget.target,
      stateName: sample.stateName,
      label: sample.label,
      split: input.visualDataset.split,
      subject: {
        subjectKind: 'assai-leaflet-flow',
        stateCode: store.stateCode,
        cityName: store.cityName,
        storeSlug: store.storeSlug,
        storeName: store.storeName,
        targetIndex: sample.targetIndex ?? null,
      },
    });
  }
}

function validateInput(input: ExtractAssaiLeafletsInput): void {
  if (input.stores.length === 0) {
    throw new AssaiLeafletExtractionError('Assai extraction requires at least one store.');
  }

  if (input.timeoutMs <= 0 || input.storeTimeoutMs <= 0 || input.maxStoreAttempts <= 0) {
    throw new AssaiLeafletExtractionError(
      'Assai extraction timeouts and attempts must be positive.',
    );
  }

  if (input.settleDelayMs < 0) {
    throw new AssaiLeafletExtractionError('Assai settle delay cannot be negative.');
  }
}

function createAbsoluteAssaiUrl(urlPath: string): string {
  if (urlPath.startsWith('https://www.assai.com.br/')) {
    return urlPath;
  }

  return `https://www.assai.com.br${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`;
}

function createAssaiLeafletId(
  store: AssaiMonitoredStore,
  catalogLeafletId: string,
  title: string,
): string {
  return `${store.storeSlug}-${catalogLeafletId}-${slugify(normalizeLeafletTitle(title))}`;
}

function normalizeLeafletTitle(value: string): string {
  const normalizedTitle = value.trim().replace(/\s+/g, ' ');

  return normalizedTitle.length === 0 ? 'Jornal de Ofertas' : normalizedTitle;
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

function isNonNullString(value: string | null): value is string {
  return value !== null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new AssaiLeafletExtractionError(message));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timeout);
      });
  });
}
