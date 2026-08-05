import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type { CaptureVisualDatasetSampleInput } from '../../../application/services/visual-dataset-capture-service';
import type { PixelBoundingBox } from '../../../domain/dataset/bounding-box';
import type { VisualDatasetSample } from '../../../domain/dataset/visual-dataset-sample';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type {
  AtacadaoLeafletCard,
  AtacadaoLeafletPage,
  AtacadaoLeafletPageFactory,
  AtacadaoLeafletVisualTarget,
} from './atacadao-leaflet-page';
import {
  AtacadaoLeafletExtractionError,
  AtacadaoLeafletExtractor,
} from './atacadao-leaflet-extractor';
import type { AtacadaoMonitoredStore } from './atacadao-targets';

describe('AtacadaoLeafletExtractor', () => {
  it('extracts PDF leaflets from canonical store URLs and captures visual samples', async () => {
    const page = new FakeAtacadaoPage({
      cards: [
        {
          title: 'Boa do Dia',
          cardIndex: 0,
          pdfUrl: 'https://cdn.example.com/boa.pdf',
          validityText: 'De 4/8 até 4/8',
        },
      ],
      moreLeafletsBeforeEmpty: 1,
    });
    const captureService = new FakeVisualDatasetCaptureService();
    const extractor = createExtractor(new FakeAtacadaoPageFactory([page]), captureService);

    const result = await extractor.extract(createInput({ visualDataset: true }));

    expect(result).toEqual({
      source: 'atacadao-playwright',
      extractedAtIso: '2026-08-04T10:00:00.000Z',
      stores: [
        {
          store: STORE,
          sourceUrl: STORE.finalPageUrl,
          leaflets: [
            {
              leafletId: 'ipiranga-01-boa-do-dia',
              title: 'Boa do Dia',
              cardIndex: 0,
              pdfUrl: 'https://cdn.example.com/boa.pdf',
              validityText: 'De 4/8 até 4/8',
            },
          ],
        },
      ],
      failedStores: [],
    });
    expect(page.actions).toEqual([
      'goto:https://www.atacadao.com.br/loja/ipiranga',
      'wait:0',
      'dismiss-cookie-banner',
      'is-unavailable:false',
      'wait-store-leaflets:ipiranga',
      'wait:0',
      'has-more:true',
      'target:show-more',
      'show-more',
      'wait:0',
      'has-more:false',
      'discover-cards',
      'target:card:0',
      'close',
    ]);
    expect(captureService.inputs.map((input) => [input.stateName, input.label])).toEqual([
      ['LEAFLETS_PAGE', 'show_more_leaflets_button'],
      ['PDF_DOWNLOAD', 'download_pdf_button'],
    ]);
  });

  it('extracts without visual dataset capture when it is disabled', async () => {
    const page = new FakeAtacadaoPage({
      cards: [
        {
          title: '',
          cardIndex: 1,
          pdfUrl: 'https://cdn.example.com/leaflet.pdf',
          validityText: null,
        },
      ],
      moreLeafletsBeforeEmpty: 0,
    });
    const captureService = new FakeVisualDatasetCaptureService();
    const extractor = createExtractor(new FakeAtacadaoPageFactory([page]), captureService);

    const result = await extractor.extract(createInput());

    expect(result.stores[0]?.leaflets[0]).toMatchObject({
      leafletId: 'ipiranga-02-leaflet',
      title: 'Leaflet',
      pdfUrl: 'https://cdn.example.com/leaflet.pdf',
    });
    expect(captureService.inputs).toEqual([]);
    expect(page.actions).not.toContain('target:card:1');
  });

  it('resolves the store URL from the directory when the direct URL is unavailable', async () => {
    const page = new FakeAtacadaoPage({
      cards: [
        {
          title: 'Resolved Leaflet',
          cardIndex: 0,
          pdfUrl: 'https://cdn.example.com/resolved.pdf',
          validityText: null,
        },
      ],
      moreLeafletsBeforeEmpty: 0,
      storePageUnavailable: true,
      resolvedStoreUrl: 'https://www.atacadao.com.br/loja/juzeiro-do-norte-triangulo',
    });
    const extractor = createExtractor(new FakeAtacadaoPageFactory([page]));

    const result = await extractor.extract(createInput());

    expect(result.stores[0]?.sourceUrl).toBe(
      'https://www.atacadao.com.br/loja/juzeiro-do-norte-triangulo',
    );
    expect(result.stores[0]?.leaflets[0]?.pdfUrl).toBe('https://cdn.example.com/resolved.pdf');
    expect(page.actions).toEqual([
      'goto:https://www.atacadao.com.br/loja/ipiranga',
      'wait:0',
      'dismiss-cookie-banner',
      'is-unavailable:true',
      'resolve-store-url:ipiranga',
      'goto:https://www.atacadao.com.br/loja/juzeiro-do-norte-triangulo',
      'wait:0',
      'wait-store-leaflets:juzeiro-do-norte-triangulo',
      'wait:0',
      'has-more:false',
      'discover-cards',
      'close',
    ]);
  });

  it('resolves the store URL from the directory when the direct URL has no leaflet section', async () => {
    const page = new FakeAtacadaoPage({
      cards: [
        {
          title: 'Resolved Leaflet',
          cardIndex: 0,
          pdfUrl: 'https://cdn.example.com/resolved.pdf',
          validityText: null,
        },
      ],
      moreLeafletsBeforeEmpty: 0,
      failFirstLeafletWait: true,
      resolvedStoreUrl: 'https://www.atacadao.com.br/loja/savador-pau-da-lima',
    });
    const logger = new FakeLogger();
    const extractor = createExtractor(new FakeAtacadaoPageFactory([page]), undefined, logger);

    const result = await extractor.extract(createInput());

    expect(result.stores[0]?.sourceUrl).toBe(
      'https://www.atacadao.com.br/loja/savador-pau-da-lima',
    );
    expect(logger.warnMessages).toContain(
      'Atacadao direct store URL did not expose leaflets; resolving by directory.',
    );
  });

  it('reports unexpected direct URL failures while resolving through the directory', async () => {
    const page = new FakeAtacadaoPage({
      cards: [
        {
          title: 'Resolved Leaflet',
          cardIndex: 0,
          pdfUrl: 'https://cdn.example.com/resolved.pdf',
          validityText: null,
        },
      ],
      moreLeafletsBeforeEmpty: 0,
      failFirstLeafletWaitWithNonError: true,
      resolvedStoreUrl: 'https://www.atacadao.com.br/loja/savador-pau-da-lima',
    });
    const logger = new FakeLogger();
    const extractor = createExtractor(new FakeAtacadaoPageFactory([page]), undefined, logger);

    const result = await extractor.extract(createInput());

    expect(result.stores[0]?.leaflets).toHaveLength(1);
    expect(logger.warnContexts[0]?.['errorMessage']).toBe('Unexpected direct URL failure.');
  });

  it('fails the store when the directory fallback cannot resolve its URL', async () => {
    const page = new FakeAtacadaoPage({
      cards: [],
      moreLeafletsBeforeEmpty: 0,
      storePageUnavailable: true,
      resolvedStoreUrl: null,
    });
    const extractor = createExtractor(new FakeAtacadaoPageFactory([page]));

    const result = await extractor.extract(createInput());

    expect(result.stores).toEqual([]);
    expect(result.failedStores[0]?.errorMessage).toBe(
      'Atacadao store Ipiranga could not be resolved from the store directory.',
    );
  });

  it('skips show-more capture when visual dataset input has no capture service', async () => {
    const page = new FakeAtacadaoPage({
      cards: [],
      moreLeafletsBeforeEmpty: 1,
    });
    const extractor = createExtractor(new FakeAtacadaoPageFactory([page]));

    const result = await extractor.extract(createInput({ visualDataset: true }));

    expect(result.stores[0]?.leaflets).toEqual([]);
    expect(page.actions).toEqual([
      'goto:https://www.atacadao.com.br/loja/ipiranga',
      'wait:0',
      'dismiss-cookie-banner',
      'is-unavailable:false',
      'wait-store-leaflets:ipiranga',
      'wait:0',
      'has-more:true',
      'show-more',
      'wait:0',
      'has-more:false',
      'discover-cards',
      'close',
    ]);
  });

  it('logs stores without leaflets as empty successful stores', async () => {
    const logger = new FakeLogger();
    const extractor = createExtractor(
      new FakeAtacadaoPageFactory([
        new FakeAtacadaoPage({
          cards: [],
          moreLeafletsBeforeEmpty: 0,
        }),
      ]),
      undefined,
      logger,
    );

    const result = await extractor.extract(createInput());

    expect(result.stores[0]?.leaflets).toEqual([]);
    expect(result.failedStores).toEqual([]);
    expect(logger.infoMessages).toContain('No Atacadao leaflets found for store.');
  });

  it('retries failed stores and keeps extracting the remaining stores', async () => {
    const logger = new FakeLogger();
    const extractor = createExtractor(
      new FakeAtacadaoPageFactory([
        new FakeAtacadaoPage({
          cards: [{ title: 'Broken', cardIndex: 0, pdfUrl: ' ', validityText: null }],
          moreLeafletsBeforeEmpty: 0,
        }),
        new FakeAtacadaoPage({
          cards: [{ title: 'Still broken', cardIndex: 0, pdfUrl: ' ', validityText: null }],
          moreLeafletsBeforeEmpty: 0,
        }),
        new FakeAtacadaoPage({
          cards: [
            {
              title: 'Working',
              cardIndex: 0,
              pdfUrl: 'https://cdn.example.com/working.pdf',
              validityText: null,
            },
          ],
          moreLeafletsBeforeEmpty: 0,
        }),
      ]),
      undefined,
      logger,
    );

    const result = await extractor.extract(
      createInput({
        stores: [STORE, SECOND_STORE],
        maxStoreAttempts: 2,
      }),
    );

    expect(result.failedStores[0]?.store.storeSlug).toBe('ipiranga');
    expect(result.failedStores[0]?.errorMessage).toBe(
      'Atacadao leaflet card 0 did not expose a PDF URL.',
    );
    expect(result.stores[0]?.store.storeSlug).toBe('penha');
    expect(logger.warnMessages).toEqual([
      'Atacadao store extraction attempt failed.',
      'Atacadao store extraction attempt failed.',
    ]);
  });

  it('fails fast for invalid input', async () => {
    const extractor = createExtractor(new FakeAtacadaoPageFactory([]));

    await expect(
      extractor.extract({
        ...createInput(),
        stores: [],
      }),
    ).rejects.toThrow(AtacadaoLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput(),
        timeoutMs: 0,
      }),
    ).rejects.toThrow(AtacadaoLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput(),
        storeTimeoutMs: 0,
      }),
    ).rejects.toThrow(AtacadaoLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput(),
        maxStoreAttempts: 0,
      }),
    ).rejects.toThrow(AtacadaoLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput(),
        settleDelayMs: -1,
      }),
    ).rejects.toThrow(AtacadaoLeafletExtractionError);
  });

  it('reports non-error failures from a store attempt', async () => {
    const page = new FakeAtacadaoPage({
      cards: [],
      moreLeafletsBeforeEmpty: 0,
      throwNonErrorOnGoto: true,
    });
    const extractor = createExtractor(new FakeAtacadaoPageFactory([page]));

    const result = await extractor.extract(createInput());

    expect(result.failedStores[0]?.errorMessage).toBe(
      'Unexpected Atacadao store extraction failure.',
    );
  });

  it('reports store extraction timeouts', async () => {
    vi.useFakeTimers();
    const page = new FakeAtacadaoPage({
      cards: [],
      moreLeafletsBeforeEmpty: 0,
      neverResolveGoto: true,
    });
    const extractor = createExtractor(new FakeAtacadaoPageFactory([page]));

    const promise = extractor.extract(
      createInput({
        storeTimeoutMs: 10,
      }),
    );
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;

    expect(result.failedStores[0]?.errorMessage).toBe(
      'Atacadao store ipiranga extraction timed out.',
    );
    vi.useRealTimers();
  });
});

const STORE: AtacadaoMonitoredStore = {
  stateCode: 'SP',
  cityName: 'Sao Paulo',
  storeSlug: 'ipiranga',
  storeName: 'Ipiranga',
  finalPageUrl: 'https://www.atacadao.com.br/loja/ipiranga',
};

const SECOND_STORE: AtacadaoMonitoredStore = {
  stateCode: 'SP',
  cityName: 'Sao Paulo',
  storeSlug: 'penha',
  storeName: 'Penha',
  finalPageUrl: 'https://www.atacadao.com.br/loja/penha',
};

function createInput(
  overrides: {
    readonly stores?: readonly AtacadaoMonitoredStore[];
    readonly maxStoreAttempts?: number;
    readonly storeTimeoutMs?: number;
    readonly visualDataset?: boolean;
  } = {},
): Parameters<AtacadaoLeafletExtractor['extract']>[0] {
  const baseInput = {
    stores: overrides.stores ?? [STORE],
    viewport: createVisualViewport({
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
    }),
    timeoutMs: 30_000,
    storeTimeoutMs: overrides.storeTimeoutMs ?? 30_000,
    maxStoreAttempts: overrides.maxStoreAttempts ?? 1,
    settleDelayMs: 0,
  };

  if (overrides.visualDataset !== true) {
    return baseInput;
  }

  return {
    ...baseInput,
    visualDataset: {
      runId: 'run-1',
      split: 'unassigned',
    },
  };
}

function createExtractor(
  pageFactory: AtacadaoLeafletPageFactory,
  captureService?: FakeVisualDatasetCaptureService,
  logger: Logger = new FakeLogger(),
): AtacadaoLeafletExtractor {
  return new AtacadaoLeafletExtractor(pageFactory, new FixedClock(), logger, captureService);
}

class FakeAtacadaoPageFactory implements AtacadaoLeafletPageFactory {
  private readonly pages: readonly AtacadaoLeafletPage[];

  private index = 0;

  constructor(pages: readonly AtacadaoLeafletPage[]) {
    this.pages = pages;
  }

  openPage(): Promise<AtacadaoLeafletPage> {
    const page = this.pages[this.index];
    this.index += 1;

    if (page === undefined) {
      throw new Error('No fake page was configured.');
    }

    return Promise.resolve(page);
  }
}

class FakeAtacadaoPage implements AtacadaoLeafletPage {
  readonly actions: string[] = [];

  private readonly cards: readonly AtacadaoLeafletCard[];

  private remainingShowMoreClicks: number;

  private readonly throwNonErrorOnGoto: boolean;

  private readonly neverResolveGoto: boolean;

  private readonly storePageUnavailable: boolean;

  private readonly failFirstLeafletWait: boolean;

  private readonly failFirstLeafletWaitWithNonError: boolean;

  private readonly resolvedStoreUrl: string | null;

  private leafletWaits = 0;

  constructor(input: {
    readonly cards: readonly AtacadaoLeafletCard[];
    readonly moreLeafletsBeforeEmpty: number;
    readonly throwNonErrorOnGoto?: boolean;
    readonly neverResolveGoto?: boolean;
    readonly storePageUnavailable?: boolean;
    readonly failFirstLeafletWait?: boolean;
    readonly failFirstLeafletWaitWithNonError?: boolean;
    readonly resolvedStoreUrl?: string | null;
  }) {
    this.cards = input.cards;
    this.remainingShowMoreClicks = input.moreLeafletsBeforeEmpty;
    this.throwNonErrorOnGoto = input.throwNonErrorOnGoto === true;
    this.neverResolveGoto = input.neverResolveGoto === true;
    this.storePageUnavailable = input.storePageUnavailable === true;
    this.failFirstLeafletWait = input.failFirstLeafletWait === true;
    this.failFirstLeafletWaitWithNonError = input.failFirstLeafletWaitWithNonError === true;
    this.resolvedStoreUrl = input.resolvedStoreUrl ?? null;
  }

  goto(url: string): Promise<void> {
    this.actions.push(`goto:${url}`);

    if (this.throwNonErrorOnGoto) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- covers defensive non-Error adapter rejection.
      return Promise.reject('non-error failure');
    }

    if (this.neverResolveGoto) {
      return new Promise(() => undefined);
    }

    return Promise.resolve();
  }

  isStorePageUnavailable(): Promise<boolean> {
    this.actions.push(`is-unavailable:${String(this.storePageUnavailable)}`);
    return Promise.resolve(this.storePageUnavailable);
  }

  resolveStorePageUrl(store: AtacadaoMonitoredStore): Promise<string | null> {
    this.actions.push(`resolve-store-url:${store.storeSlug}`);
    return Promise.resolve(this.resolvedStoreUrl);
  }

  waitForTimeout(timeoutMs: number): Promise<void> {
    this.actions.push(`wait:${String(timeoutMs)}`);
    return Promise.resolve();
  }

  dismissCookieBanner(): Promise<void> {
    this.actions.push('dismiss-cookie-banner');
    return Promise.resolve();
  }

  waitForStoreLeaflets(store: AtacadaoMonitoredStore): Promise<void> {
    this.actions.push(`wait-store-leaflets:${store.storeSlug}`);
    this.leafletWaits += 1;

    if (this.failFirstLeafletWait && this.leafletWaits === 1) {
      return Promise.reject(new Error('Leaflet section was not found.'));
    }

    if (this.failFirstLeafletWaitWithNonError && this.leafletWaits === 1) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- covers defensive non-Error adapter rejection.
      return Promise.reject('non-error leaflet wait failure');
    }

    return Promise.resolve();
  }

  hasMoreLeaflets(): Promise<boolean> {
    const hasMore = this.remainingShowMoreClicks > 0;
    this.actions.push(`has-more:${String(hasMore)}`);
    return Promise.resolve(hasMore);
  }

  getShowMoreLeafletsVisualTarget(): Promise<AtacadaoLeafletVisualTarget> {
    this.actions.push('target:show-more');
    return Promise.resolve(createVisualTarget());
  }

  showMoreLeaflets(): Promise<void> {
    this.remainingShowMoreClicks -= 1;
    this.actions.push('show-more');
    return Promise.resolve();
  }

  discoverCards(): Promise<readonly AtacadaoLeafletCard[]> {
    this.actions.push('discover-cards');
    return Promise.resolve(this.cards);
  }

  getLeafletCardVisualTarget(cardIndex: number): Promise<AtacadaoLeafletVisualTarget> {
    this.actions.push(`target:card:${String(cardIndex)}`);
    return Promise.resolve(createVisualTarget());
  }

  close(): Promise<void> {
    this.actions.push('close');
    return Promise.resolve();
  }
}

class FakeVisualDatasetCaptureService {
  readonly inputs: CaptureVisualDatasetSampleInput[] = [];

  captureBeforeAction(input: CaptureVisualDatasetSampleInput): Promise<VisualDatasetSample> {
    this.inputs.push(input);

    return Promise.resolve({
      sampleId: input.sampleId,
      runId: input.runId,
      supermarketId: input.supermarketId,
      stateName: input.stateName,
      pageUrl: 'https://www.atacadao.com.br/loja/ipiranga',
      screenshotPng: new Uint8Array([1]),
      screenshotMetadata: {
        fileName: `${input.sampleId}.png`,
        mimeType: 'image/png',
        fullPage: true,
        viewport: {
          width: 1366,
          height: 768,
          deviceScaleFactor: 1,
        },
        documentWidth: 1366,
        documentHeight: 2000,
        scrollPosition: {
          scrollX: 0,
          scrollY: 0,
        },
        capturedAtIso: '2026-08-04T10:00:00.000Z',
      },
      target: {
        label: input.label,
        viewportBox: BOX,
        documentBox: BOX,
        normalizedDocumentBox: {
          xCenter: 0.5,
          yCenter: 0.5,
          width: 0.1,
          height: 0.1,
        },
      },
      split: input.split,
      subject: input.subject,
    });
  }
}

function createVisualTarget(): AtacadaoLeafletVisualTarget {
  return {
    page: {
      captureFullPageSnapshot: () =>
        Promise.resolve({
          pageUrl: 'https://www.atacadao.com.br/loja/ipiranga',
          screenshotPng: new Uint8Array([1]),
          viewport: {
            width: 1366,
            height: 768,
            deviceScaleFactor: 1,
          },
          documentSize: {
            width: 1366,
            height: 2000,
            deviceScaleFactor: 1,
          },
          scrollPosition: {
            scrollX: 0,
            scrollY: 0,
          },
        }),
    },
    target: {
      locatorDescription: 'target',
      scrollIntoView: () => Promise.resolve(),
      getViewportBoundingBox: () => Promise.resolve(BOX),
      isVisible: () => Promise.resolve(true),
      isEnabled: () => Promise.resolve(true),
    },
  };
}

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-08-04T10:00:00.000Z';
  }
}

class FakeLogger implements Logger {
  readonly infoMessages: string[] = [];

  readonly warnMessages: string[] = [];

  readonly warnContexts: Record<string, string>[] = [];

  debug(): void {
    return undefined;
  }

  info(message: string): void {
    this.infoMessages.push(message);
  }

  warn(message: string, context?: Record<string, string>): void {
    this.warnMessages.push(message);

    if (context !== undefined) {
      this.warnContexts.push(context);
    }
  }

  error(): void {
    return undefined;
  }
}

const BOX: PixelBoundingBox = {
  xMin: 10,
  yMin: 20,
  xMax: 110,
  yMax: 220,
  width: 100,
  height: 200,
};
