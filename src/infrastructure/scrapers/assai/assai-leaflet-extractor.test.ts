import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { CaptureVisualDatasetSampleInput } from '../../../application/services/visual-dataset-capture-service';
import type { PixelBoundingBox } from '../../../domain/dataset/bounding-box';
import type { VisualDatasetSample } from '../../../domain/dataset/visual-dataset-sample';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type { AssaiOfferCatalog } from './assai-offer-catalog';
import type { AssaiCachedStoreUrl } from './assai-store-url-cache';
import {
  AssaiLeafletExtractionError,
  AssaiLeafletExtractor,
  type AssaiOfferCatalogProvider,
  type AssaiStoreUrlCachePort,
} from './assai-leaflet-extractor';
import type {
  AssaiLeafletPage,
  AssaiLeafletPageFactory,
  AssaiLeafletVisualTarget,
  OpenAssaiLeafletPageInput,
} from './assai-leaflet-page';
import type { AssaiMonitoredStore } from './assai-targets';

describe('AssaiLeafletExtractor', () => {
  it('extracts image leaflets from a direct cached offer page', async () => {
    const page = new FakeAssaiLeafletPage({
      availableResults: [true],
      currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
    });
    const extractor = createExtractor({
      page,
      cache: new FakeStoreUrlCache('https://www.assai.com.br/ofertas/ceara/assai-parangaba'),
    });

    const result = await extractor.extract(createInput());

    expect(page.calls).toEqual([
      'goto:https://www.assai.com.br/ofertas/ceara/assai-parangaba',
      'wait:5',
      'dismiss-cookie-banner',
      'wait-for-leaflets',
      'wait:5',
      'open-leaflet-tab:0',
      'wait:5',
      'close',
    ]);
    expect(result.stores).toHaveLength(1);
    expect(result.failedStores).toHaveLength(0);
    expect(result.stores[0]?.leaflets).toEqual([
      {
        leafletId: 'assai-parangaba-200-jornal-de-ofertas-1',
        title: 'Jornal de Ofertas 1',
        coverImageUrl: 'https://cdn.example/page-1.jpeg',
        imageUrls: ['https://cdn.example/page-1.jpeg', 'https://cdn.example/page-2.jpeg'],
        startDateIso: '2026-07-20',
        endDateIso: '2026-07-23',
      },
    ]);
  });

  it('falls back to the home flow, captures visual targets, and caches the resolved URL', async () => {
    const page = new FakeAssaiLeafletPage({
      availableResults: [false, false],
      currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
    });
    const cache = new FakeStoreUrlCache(null);
    const captureService = new RecordingCaptureService();
    const extractor = createExtractor({ page, cache, captureService });

    const result = await extractor.extract(
      createInput({
        visualDataset: {
          runId: 'run-1',
          split: 'unassigned',
        },
      }),
    );

    expect(result.stores[0]?.sourceUrl).toBe(
      'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
    );
    expect(page.calls).toContain('goto-home');
    expect(page.calls).toContain('open-offers-page');
    expect(page.calls).toContain('select-state:CE');
    expect(page.calls).toContain('select-city:Fortaleza');
    expect(page.calls).toContain('select-store:assai-parangaba');
    expect(cache.saved).toEqual([
      {
        storeSlug: 'assai-parangaba',
        resolvedOfferUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
        resolvedAtIso: '2026-08-05T10:00:00.000Z',
      },
    ]);
    expect(captureService.inputs.map((input) => input.sampleId)).toEqual([
      'run-1-assai-parangaba-open-offers',
      'run-1-assai-parangaba-choose-store',
      'run-1-assai-parangaba-select-state',
      'run-1-assai-parangaba-select-city',
      'run-1-assai-parangaba-select-store',
      'run-1-assai-parangaba-confirm-store',
      'run-1-assai-parangaba-leaflet-tab-1',
      'run-1-assai-parangaba-download-image-1',
    ]);
  });

  it('keeps the extracted store when resolved URL cache persistence fails with an error', async () => {
    const page = new FakeAssaiLeafletPage({
      availableResults: [false, false],
      currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
    });
    const logger = new RecordingLogger();
    const extractor = createExtractor({
      page,
      cache: new FailingStoreUrlCache(new Error('cache disk unavailable')),
      logger,
    });

    const result = await extractor.extract(createInput());

    expect(result.failedStores).toEqual([]);
    expect(result.stores).toHaveLength(1);
    expect(logger.warnMessages).toContain('Assai resolved store URL could not be cached.');
  });

  it('logs an unexpected cache failure when persistence rejects without an error object', async () => {
    const page = new FakeAssaiLeafletPage({
      availableResults: [false, false],
      currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
    });
    const logger = new RecordingLogger();
    const extractor = createExtractor({
      page,
      cache: new FailingStoreUrlCache(null),
      logger,
    });

    const result = await extractor.extract(createInput());

    expect(result.failedStores).toEqual([]);
    expect(logger.warnPayloads).toContainEqual({
      storeSlug: 'assai-parangaba',
      errorMessage: 'Unexpected cache persistence failure.',
    });
  });

  it('reports unexpected non-error store extraction failures', async () => {
    const extractor = createExtractor({
      page: new NonErrorGotoAssaiLeafletPage({
        availableResults: [true],
        currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
      }),
    });

    const result = await extractor.extract(createInput());

    expect(result.stores).toEqual([]);
    expect(result.failedStores[0]?.errorMessage).toBe('Unexpected Assai store extraction failure.');
  });

  it('uses fallback leaflet values when catalog title and images are empty', async () => {
    const page = new FakeAssaiLeafletPage({
      availableResults: [true],
      currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
    });
    const extractor = createExtractor({
      page,
      catalog: {
        stores: [createCatalogStore()],
        leaflets: [
          {
            leafletId: 'empty-gallery',
            title: '   ',
            startDateIso: null,
            endDateIso: null,
            lojaIds: [10],
            tids: [],
            nids: [],
            imageUrls: [],
          },
        ],
      },
    });

    const result = await extractor.extract(createInput());

    expect(result.stores[0]?.leaflets[0]).toEqual({
      leafletId: 'assai-parangaba-empty-gallery-jornal-de-ofertas',
      title: 'Jornal de Ofertas',
      coverImageUrl: 'empty-gallery',
      imageUrls: [],
      startDateIso: null,
      endDateIso: null,
    });
  });

  it('reports an empty store when the catalog has no assigned leaflets', async () => {
    const page = new FakeAssaiLeafletPage({
      availableResults: [true],
      currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
    });
    const extractor = createExtractor({
      page,
      catalog: {
        stores: [createCatalogStore()],
        leaflets: [],
      },
    });

    const result = await extractor.extract(createInput());

    expect(result.stores[0]?.leaflets).toEqual([]);
    expect(result.failedStores).toEqual([]);
  });

  it('keeps catalog extraction when a leaflet has no matching visible tab', async () => {
    const page = new FakeAssaiLeafletPage({
      availableResults: [true],
      currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
      visibleLeafletTabCount: 1,
    });
    const captureService = new RecordingCaptureService();
    const extractor = createExtractor({
      page,
      captureService,
      catalog: {
        stores: [createCatalogStore()],
        leaflets: [
          ...createCatalog().leaflets,
          {
            leafletId: '201',
            title: 'Jornal de Ofertas 2',
            startDateIso: '2026-07-20',
            endDateIso: '2026-07-23',
            lojaIds: [10],
            tids: [],
            nids: [],
            imageUrls: ['https://cdn.example/page-3.jpeg'],
          },
        ],
      },
    });

    const result = await extractor.extract(
      createInput({
        visualDataset: {
          runId: 'run-1',
          split: 'unassigned',
        },
      }),
    );

    expect(result.failedStores).toEqual([]);
    expect(result.stores[0]?.leaflets).toHaveLength(2);
    expect(page.calls).toContain('open-leaflet-tab:0');
    expect(page.calls).not.toContain('open-leaflet-tab:1');
    expect(captureService.inputs.map((input) => input.sampleId)).toEqual([
      'run-1-assai-parangaba-leaflet-tab-1',
      'run-1-assai-parangaba-download-image-1',
    ]);
  });

  it('skips an invisible visual target without failing the store extraction', async () => {
    const page = new FakeAssaiLeafletPage({
      availableResults: [false, false],
      currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
      invisibleVisualTargets: ['city-select'],
    });
    const captureService = new RecordingCaptureService();
    const extractor = createExtractor({ page, captureService });

    const result = await extractor.extract(
      createInput({
        visualDataset: {
          runId: 'run-1',
          split: 'unassigned',
        },
      }),
    );

    expect(result.failedStores).toEqual([]);
    expect(captureService.inputs.map((input) => input.sampleId)).not.toContain(
      'run-1-assai-parangaba-select-city',
    );
  });

  it('tries an absolute catalog offer URL when the initial page is stale', async () => {
    const page = new FakeAssaiLeafletPage({
      availableResults: [false, true],
      currentUrl: 'https://www.assai.com.br/ofertas/catalogo/assai-parangaba',
    });
    const extractor = createExtractor({
      page,
      catalog: createCatalog({
        offerUrlPath: 'https://www.assai.com.br/ofertas/catalogo/assai-parangaba',
      }),
    });

    const result = await extractor.extract(createInput());

    expect(result.failedStores).toEqual([]);
    expect(result.stores[0]?.sourceUrl).toBe(
      'https://www.assai.com.br/ofertas/catalogo/assai-parangaba',
    );
    expect(page.calls).toContain('goto:https://www.assai.com.br/ofertas/catalogo/assai-parangaba');
  });

  it('normalizes catalog offer paths without a leading slash', async () => {
    const page = new FakeAssaiLeafletPage({
      availableResults: [false, true],
      currentUrl: 'https://www.assai.com.br/ofertas/catalogo/assai-parangaba',
    });
    const extractor = createExtractor({
      page,
      catalog: createCatalog({
        offerUrlPath: 'ofertas/catalogo/assai-parangaba',
      }),
    });

    const result = await extractor.extract(createInput());

    expect(result.failedStores).toEqual([]);
    expect(page.calls).toContain('goto:https://www.assai.com.br/ofertas/catalogo/assai-parangaba');
  });

  it('reports a failed store when an extraction attempt times out', async () => {
    const extractor = createExtractor({
      page: new HangingAssaiLeafletPage({
        availableResults: [true],
        currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
      }),
    });

    const result = await extractor.extract(
      createInput({
        storeTimeoutMs: 1,
      }),
    );

    expect(result.stores).toEqual([]);
    expect(result.failedStores[0]?.errorMessage).toBe(
      'Assai store assai-parangaba extraction timed out.',
    );
  });

  it('fails a store when it is absent from the catalog', async () => {
    const extractor = createExtractor({
      page: new FakeAssaiLeafletPage({
        availableResults: [true],
        currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
      }),
      catalog: {
        stores: [],
        leaflets: [],
      },
    });

    const result = await extractor.extract(createInput());

    expect(result.stores).toEqual([]);
    expect(result.failedStores[0]?.errorMessage).toBe(
      'Assai store Assai Atacadista Parangaba was not found in the offer catalog.',
    );
  });

  it('rejects invalid extraction input', async () => {
    const extractor = createExtractor({
      page: new FakeAssaiLeafletPage({
        availableResults: [true],
        currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
      }),
    });

    await expect(
      extractor.extract({
        ...createInput(),
        stores: [],
      }),
    ).rejects.toThrow(AssaiLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput(),
        timeoutMs: 0,
      }),
    ).rejects.toThrow(AssaiLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput(),
        settleDelayMs: -1,
      }),
    ).rejects.toThrow(AssaiLeafletExtractionError);
  });
});

function createInput(
  overrides: Partial<Parameters<AssaiLeafletExtractor['extract']>[0]> = {},
): Parameters<AssaiLeafletExtractor['extract']>[0] {
  return {
    stores: [createStore()],
    viewport: createVisualViewport({
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
    }),
    timeoutMs: 1_000,
    storeTimeoutMs: 1_000,
    maxStoreAttempts: 1,
    settleDelayMs: 5,
    ...overrides,
  };
}

function createExtractor(input: {
  readonly page: AssaiLeafletPage;
  readonly catalog?: AssaiOfferCatalog;
  readonly cache?: AssaiStoreUrlCachePort;
  readonly logger?: Logger;
  readonly captureService?: RecordingCaptureService;
}): AssaiLeafletExtractor {
  return new AssaiLeafletExtractor(
    new FakePageFactory(input.page),
    new FakeCatalogProvider(input.catalog ?? createCatalog()),
    input.cache ?? new FakeStoreUrlCache(null),
    new FixedClock(),
    input.logger ?? new NullLogger(),
    input.captureService,
  );
}

function createStore(): AssaiMonitoredStore {
  return {
    stateCode: 'CE',
    stateName: 'Ceara',
    cityName: 'Fortaleza',
    storeSlug: 'assai-parangaba',
    storeName: 'Assai Atacadista Parangaba',
    initialPageUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
  };
}

function createCatalog(
  storeOverrides: Partial<AssaiOfferCatalog['stores'][number]> = {},
): AssaiOfferCatalog {
  return {
    stores: [createCatalogStore(storeOverrides)],
    leaflets: [
      {
        leafletId: '200',
        title: 'Jornal de Ofertas 1',
        startDateIso: '2026-07-20',
        endDateIso: '2026-07-23',
        lojaIds: [10],
        tids: [20],
        nids: [30],
        imageUrls: ['https://cdn.example/page-1.jpeg', 'https://cdn.example/page-2.jpeg'],
      },
    ],
  };
}

function createCatalogStore(
  overrides: Partial<AssaiOfferCatalog['stores'][number]> = {},
): AssaiOfferCatalog['stores'][number] {
  return {
    lojaId: 10,
    tid: 20,
    nid: 30,
    name: 'Assaí Parangaba',
    offerUrlPath: '/ofertas/ceara/assai-parangaba',
    storeSlug: 'assai-parangaba',
    ...overrides,
  };
}

class FakePageFactory implements AssaiLeafletPageFactory {
  private readonly page: AssaiLeafletPage;

  constructor(page: AssaiLeafletPage) {
    this.page = page;
  }

  openPage(input: OpenAssaiLeafletPageInput): Promise<AssaiLeafletPage> {
    void input;

    return Promise.resolve(this.page);
  }
}

class FakeCatalogProvider implements AssaiOfferCatalogProvider {
  private readonly catalog: AssaiOfferCatalog;

  constructor(catalog: AssaiOfferCatalog) {
    this.catalog = catalog;
  }

  fetchCatalog(): Promise<AssaiOfferCatalog> {
    return Promise.resolve(this.catalog);
  }
}

class FakeStoreUrlCache implements AssaiStoreUrlCachePort {
  readonly saved: AssaiCachedStoreUrl[] = [];

  private readonly cachedUrl: string | null;

  constructor(cachedUrl: string | null) {
    this.cachedUrl = cachedUrl;
  }

  get(storeSlug: string): Promise<string | null> {
    void storeSlug;

    return Promise.resolve(this.cachedUrl);
  }

  set(input: AssaiCachedStoreUrl): Promise<string> {
    this.saved.push(input);

    return Promise.resolve('/tmp/cache.json');
  }
}

class FailingStoreUrlCache implements AssaiStoreUrlCachePort {
  private readonly failure: Error | null;

  constructor(failure: Error | null = new Error('Cache write failed.')) {
    this.failure = failure;
  }

  get(storeSlug: string): Promise<string | null> {
    void storeSlug;

    return Promise.resolve(null);
  }

  set(input: AssaiCachedStoreUrl): Promise<string> {
    void input;

    if (this.failure === null) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- covers defensive non-Error cache rejection.
      return Promise.reject();
    }

    return Promise.reject(this.failure);
  }
}

class FakeAssaiLeafletPage implements AssaiLeafletPage {
  readonly calls: string[] = [];

  private readonly availableResults: boolean[];

  private readonly currentUrl: string;

  private readonly visibleLeafletTabCount: number;

  private readonly invisibleVisualTargets: ReadonlySet<string>;

  constructor(input: {
    readonly availableResults: readonly boolean[];
    readonly currentUrl: string;
    readonly visibleLeafletTabCount?: number;
    readonly invisibleVisualTargets?: readonly string[];
  }) {
    this.availableResults = [...input.availableResults];
    this.currentUrl = input.currentUrl;
    this.visibleLeafletTabCount = input.visibleLeafletTabCount ?? Number.POSITIVE_INFINITY;
    this.invisibleVisualTargets = new Set(input.invisibleVisualTargets ?? []);
  }

  goto(url: string): Promise<void> {
    this.calls.push(`goto:${url}`);

    return Promise.resolve();
  }

  gotoHome(): Promise<void> {
    this.calls.push('goto-home');

    return Promise.resolve();
  }

  waitForTimeout(timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${String(timeoutMs)}`);

    return Promise.resolve();
  }

  dismissCookieBanner(): Promise<void> {
    this.calls.push('dismiss-cookie-banner');

    return Promise.resolve();
  }

  getOffersLinkVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(this.createVisualTarget('offers-link'));
  }

  openOffersPage(): Promise<void> {
    this.calls.push('open-offers-page');

    return Promise.resolve();
  }

  waitForLeafletsPage(): Promise<void> {
    this.calls.push('wait-for-leaflets');

    return Promise.resolve();
  }

  isLeafletsPageAvailable(): Promise<boolean> {
    return Promise.resolve(this.availableResults.shift() ?? true);
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(this.currentUrl);
  }

  getChooseStoreVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(this.createVisualTarget('choose-store'));
  }

  openStoreSelector(): Promise<void> {
    this.calls.push('open-store-selector');

    return Promise.resolve();
  }

  getStateSelectVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(this.createVisualTarget('state-select'));
  }

  selectState(store: AssaiMonitoredStore): Promise<void> {
    this.calls.push(`select-state:${store.stateCode}`);

    return Promise.resolve();
  }

  getCitySelectVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(this.createVisualTarget('city-select'));
  }

  selectCity(store: AssaiMonitoredStore): Promise<void> {
    this.calls.push(`select-city:${store.cityName}`);

    return Promise.resolve();
  }

  getStoreSelectVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(this.createVisualTarget('store-select'));
  }

  selectStore(store: AssaiMonitoredStore): Promise<void> {
    this.calls.push(`select-store:${store.storeSlug}`);

    return Promise.resolve();
  }

  getConfirmStoreVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(this.createVisualTarget('confirm-store'));
  }

  confirmStoreSelection(): Promise<void> {
    this.calls.push('confirm-store-selection');

    return Promise.resolve();
  }

  isLeafletTabVisible(tabIndex: number): Promise<boolean> {
    return Promise.resolve(tabIndex < this.visibleLeafletTabCount);
  }

  getLeafletTabVisualTarget(tabIndex: number): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(this.createVisualTarget(`leaflet-tab-${String(tabIndex)}`));
  }

  openLeafletTab(tabIndex: number): Promise<void> {
    this.calls.push(`open-leaflet-tab:${String(tabIndex)}`);

    return Promise.resolve();
  }

  getDownloadImageVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(this.createVisualTarget('download-image'));
  }

  close(): Promise<void> {
    this.calls.push('close');

    return Promise.resolve();
  }

  private createVisualTarget(locatorDescription: string): AssaiLeafletVisualTarget {
    return createVisualTarget(
      locatorDescription,
      !this.invisibleVisualTargets.has(locatorDescription),
    );
  }
}

class HangingAssaiLeafletPage extends FakeAssaiLeafletPage {
  constructor(
    input: {
      readonly availableResults: readonly boolean[];
      readonly currentUrl: string;
    } = {
      availableResults: [true],
      currentUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
    },
  ) {
    super(input);
  }

  override waitForLeafletsPage(): Promise<void> {
    return new Promise<void>(() => {
      return;
    });
  }
}

class NonErrorGotoAssaiLeafletPage extends FakeAssaiLeafletPage {
  override goto(url: string): Promise<void> {
    this.calls.push(`goto:${url}`);

    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- covers defensive non-Error adapter rejection.
    return Promise.reject('non-error failure');
  }
}

class RecordingCaptureService {
  readonly inputs: CaptureVisualDatasetSampleInput[] = [];

  captureBeforeAction(input: CaptureVisualDatasetSampleInput): Promise<VisualDatasetSample> {
    this.inputs.push(input);

    return Promise.resolve(createSample(input));
  }
}

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-08-05T10:00:00.000Z';
  }
}

class NullLogger implements Logger {
  debug(message: string): void {
    void message;
  }

  info(message: string): void {
    void message;
  }

  warn(message: string): void {
    void message;
  }

  error(message: string): void {
    void message;
  }
}

class RecordingLogger extends NullLogger {
  readonly warnMessages: string[] = [];

  readonly warnPayloads: object[] = [];

  override warn(message: string, context?: object): void {
    this.warnMessages.push(message);

    if (context !== undefined) {
      this.warnPayloads.push(context);
    }
  }
}

function createVisualTarget(
  locatorDescription: string,
  isVisible = true,
): AssaiLeafletVisualTarget {
  return {
    page: createPage(),
    target: createTarget(locatorDescription, isVisible),
  };
}

function createPage(): VisualDatasetPage {
  return {
    captureFullPageSnapshot: () =>
      Promise.resolve({
        pageUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
        screenshotPng: new Uint8Array([1]),
        viewport: {
          width: 1366,
          height: 768,
        },
        documentSize: {
          width: 1366,
          height: 1600,
        },
        scrollPosition: {
          scrollX: 0,
          scrollY: 0,
        },
      }),
  };
}

function createTarget(locatorDescription: string, isVisible: boolean): VisualActionTarget {
  return {
    locatorDescription,
    scrollIntoView: () => Promise.resolve(),
    isVisible: () => Promise.resolve(isVisible),
    isEnabled: () => Promise.resolve(true),
    getViewportBoundingBox: () => Promise.resolve(createBox()),
  };
}

function createBox(): PixelBoundingBox {
  return {
    xMin: 10,
    yMin: 20,
    xMax: 110,
    yMax: 70,
    width: 100,
    height: 50,
  };
}

function createSample(input: CaptureVisualDatasetSampleInput): VisualDatasetSample {
  const box = createBox();

  return {
    sampleId: input.sampleId,
    runId: input.runId,
    supermarketId: input.supermarketId,
    stateName: input.stateName,
    pageUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
    subject: input.subject,
    screenshotPng: new Uint8Array([1]),
    screenshotMetadata: {
      fileName: `${input.sampleId}.png`,
      mimeType: 'image/png',
      fullPage: true,
      viewport: {
        width: 1366,
        height: 768,
      },
      documentWidth: 1366,
      documentHeight: 1600,
      scrollPosition: {
        scrollX: 0,
        scrollY: 0,
      },
      capturedAtIso: '2026-08-05T10:00:00.000Z',
    },
    target: {
      label: input.label,
      viewportBox: box,
      documentBox: box,
      normalizedDocumentBox: {
        xCenter: 0.1,
        yCenter: 0.1,
        width: 0.1,
        height: 0.1,
      },
    },
    split: input.split,
  };
}
