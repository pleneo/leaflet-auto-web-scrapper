import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type { CaptureVisualDatasetSampleInput } from '../../../application/services/visual-dataset-capture-service';
import type { PixelBoundingBox } from '../../../domain/dataset/bounding-box';
import type { VisualDatasetSample } from '../../../domain/dataset/visual-dataset-sample';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type {
  MixMateusLeafletPage,
  MixMateusLeafletPageFactory,
  MixMateusLeafletVisualTarget,
} from './mixmateus-leaflet-page';
import {
  MixMateusLeafletExtractionError,
  MixMateusLeafletExtractor,
} from './mixmateus-leaflet-extractor';
import type { MixMateusMonitoredStore } from './mixmateus-targets';

describe('MixMateusLeafletExtractor', () => {
  it('extracts PDF leaflets and captures visual dataset samples before each action', async () => {
    const page = new FakeMixMateusPage({
      cards: [{ title: 'Encarte Mix', cardIndex: 0 }],
      pdfUrls: ['https://cdn.example.com/encarte.pdf'],
    });
    const captureService = new FakeVisualDatasetCaptureService();
    const extractor = createExtractor(new FakeMixMateusPageFactory([page]), captureService);

    const result = await extractor.extract(createInput({ visualDataset: true }));

    expect(result).toEqual({
      source: 'mixmateus-playwright',
      extractedAtIso: '2026-07-23T10:00:00.000Z',
      stores: [
        {
          store: STORE,
          sourceUrl: STORE.finalPageUrl,
          leaflets: [
            {
              leafletId: 'mix-aracati-01-encarte-mix',
              title: 'Encarte Mix',
              cardIndex: 0,
              pdfUrl: 'https://cdn.example.com/encarte.pdf',
            },
          ],
        },
      ],
      failedStores: [],
    });
    expect(page.actions).toEqual([
      'goto:https://ofertasmateus.com/',
      'wait:0',
      'dismiss-cookie-banner',
      'target:state',
      'select-state:CE',
      'wait:0',
      'target:city',
      'select-city:Aracati',
      'wait:0',
      'target:store',
      'select-store:mix-aracati',
      'wait-store-leaflets:mix-aracati',
      'wait:0',
      'discover-cards',
      'target:card:0',
      'open-card:0',
      'wait:0',
      'target:download',
      'resolve-pdf',
      'close-modal',
      'close',
    ]);
    expect(captureService.inputs.map((input) => [input.stateName, input.label])).toEqual([
      ['STATE_SELECTION', 'select_state_button'],
      ['CITY_SELECTION', 'select_city_button'],
      ['STORE_SELECTION', 'select_store_button'],
      ['LEAFLETS_PAGE', 'open_leaflet_modal_button'],
      ['PDF_DOWNLOAD', 'download_pdf_button'],
    ]);
  });

  it('extracts without visual dataset capture when it is disabled', async () => {
    const page = new FakeMixMateusPage({
      cards: [{ title: '---', cardIndex: 1 }],
      pdfUrls: ['https://cdn.example.com/only.pdf'],
    });
    const captureService = new FakeVisualDatasetCaptureService();
    const extractor = createExtractor(new FakeMixMateusPageFactory([page]), captureService);

    const result = await extractor.extract(createInput());

    expect(result.stores[0]?.leaflets[0]).toMatchObject({
      leafletId: 'mix-aracati-02-leaflet',
      pdfUrl: 'https://cdn.example.com/only.pdf',
    });
    expect(captureService.inputs).toEqual([]);
    expect(page.actions).not.toContain('target:state');
  });

  it('logs stores without leaflets as empty successful stores', async () => {
    const logger = new FakeLogger();
    const extractor = createExtractor(
      new FakeMixMateusPageFactory([
        new FakeMixMateusPage({
          cards: [],
          pdfUrls: [],
        }),
      ]),
      undefined,
      logger,
    );

    const result = await extractor.extract(createInput());

    expect(result.stores[0]?.leaflets).toEqual([]);
    expect(result.failedStores).toEqual([]);
    expect(logger.infoMessages).toContain('No Mix Mateus leaflets found for store.');
  });

  it('retries failed stores and reports the final failure without stopping other stores', async () => {
    const logger = new FakeLogger();
    const extractor = createExtractor(
      new FakeMixMateusPageFactory([
        new FakeMixMateusPage({
          cards: [{ title: 'Broken', cardIndex: 0 }],
          pdfUrls: [' '],
        }),
        new FakeMixMateusPage({
          cards: [{ title: 'Still broken', cardIndex: 0 }],
          pdfUrls: [' '],
        }),
        new FakeMixMateusPage({
          cards: [{ title: 'Working', cardIndex: 0 }],
          pdfUrls: ['https://cdn.example.com/working.pdf'],
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

    expect(result.failedStores).toHaveLength(1);
    expect(result.failedStores[0]?.store.storeSlug).toBe('mix-aracati');
    expect(result.failedStores[0]?.errorMessage).toBe(
      'Mix Mateus leaflet card 0 did not expose a PDF URL.',
    );
    expect(result.stores[0]?.store.storeSlug).toBe('mix-caninde');
    expect(logger.warnMessages).toEqual([
      'Mix Mateus store extraction attempt failed.',
      'Mix Mateus store extraction attempt failed.',
    ]);
  });

  it('fails fast for invalid input', async () => {
    const extractor = createExtractor(new FakeMixMateusPageFactory([]));

    await expect(
      extractor.extract({
        ...createInput(),
        homeUrl: 'not-url',
      }),
    ).rejects.toThrow(MixMateusLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput(),
        timeoutMs: 0,
      }),
    ).rejects.toThrow(MixMateusLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput(),
        storeTimeoutMs: 0,
      }),
    ).rejects.toThrow(MixMateusLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput(),
        maxStoreAttempts: 0,
      }),
    ).rejects.toThrow(MixMateusLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput(),
        settleDelayMs: -1,
      }),
    ).rejects.toThrow(MixMateusLeafletExtractionError);
  });

  it('reports unexpected non-error failures from a store attempt', async () => {
    const page = new FakeMixMateusPage({
      cards: [],
      pdfUrls: [],
      throwNonErrorOnGoto: true,
    });
    const extractor = createExtractor(new FakeMixMateusPageFactory([page]));

    const result = await extractor.extract(createInput());

    expect(result.failedStores[0]?.errorMessage).toBe(
      'Unexpected Mix Mateus store extraction failure.',
    );
  });

  it('reports store extraction timeouts', async () => {
    vi.useFakeTimers();
    const page = new FakeMixMateusPage({
      cards: [],
      pdfUrls: [],
      neverResolveGoto: true,
    });
    const extractor = createExtractor(new FakeMixMateusPageFactory([page]));

    const promise = extractor.extract(
      createInput({
        storeTimeoutMs: 10,
      }),
    );
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;

    expect(result.failedStores[0]?.errorMessage).toBe(
      'Mix Mateus store mix-aracati extraction timed out.',
    );
    vi.useRealTimers();
  });
});

const STORE: MixMateusMonitoredStore = {
  stateCode: 'CE',
  stateName: 'Ceará',
  cityName: 'Aracati',
  storeSlug: 'mix-aracati',
  storeName: 'Mix Mateus Aracati',
  finalPageUrl: 'https://ofertasmateus.com/ce/aracati/mix-aracati',
};

const SECOND_STORE: MixMateusMonitoredStore = {
  stateCode: 'CE',
  stateName: 'Ceará',
  cityName: 'Canindé',
  storeSlug: 'mix-caninde',
  storeName: 'Mix Mateus Canindé',
  finalPageUrl: 'https://ofertasmateus.com/ce/caninde/mix-caninde',
};

function createInput(
  overrides: {
    readonly stores?: readonly MixMateusMonitoredStore[];
    readonly maxStoreAttempts?: number;
    readonly storeTimeoutMs?: number;
    readonly visualDataset?: boolean;
  } = {},
): Parameters<MixMateusLeafletExtractor['extract']>[0] {
  const baseInput = {
    homeUrl: 'https://ofertasmateus.com/',
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
  pageFactory: MixMateusLeafletPageFactory,
  captureService?: FakeVisualDatasetCaptureService,
  logger: Logger = new FakeLogger(),
): MixMateusLeafletExtractor {
  return new MixMateusLeafletExtractor(pageFactory, new FixedClock(), logger, captureService);
}

class FakeMixMateusPageFactory implements MixMateusLeafletPageFactory {
  private readonly pages: readonly MixMateusLeafletPage[];

  private index = 0;

  constructor(pages: readonly MixMateusLeafletPage[]) {
    this.pages = pages;
  }

  openPage(): Promise<MixMateusLeafletPage> {
    const page = this.pages[this.index];
    this.index += 1;

    if (page === undefined) {
      throw new Error('No fake page was configured.');
    }

    return Promise.resolve(page);
  }
}

class FakeMixMateusPage implements MixMateusLeafletPage {
  readonly actions: string[] = [];

  private readonly cards: readonly { readonly title: string; readonly cardIndex: number }[];

  private readonly pdfUrls: string[];

  private readonly throwNonErrorOnGoto: boolean;

  private readonly neverResolveGoto: boolean;

  constructor(input: {
    readonly cards: readonly { readonly title: string; readonly cardIndex: number }[];
    readonly pdfUrls: readonly string[];
    readonly throwNonErrorOnGoto?: boolean;
    readonly neverResolveGoto?: boolean;
  }) {
    this.cards = input.cards;
    this.pdfUrls = [...input.pdfUrls];
    this.throwNonErrorOnGoto = input.throwNonErrorOnGoto ?? false;
    this.neverResolveGoto = input.neverResolveGoto ?? false;
  }

  goto(url: string): Promise<void> {
    this.actions.push(`goto:${url}`);

    if (this.throwNonErrorOnGoto) {
      return new Promise((_resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- covers defensive non-Error adapter rejection.
        reject('goto failed');
      });
    }

    if (this.neverResolveGoto) {
      return new Promise(() => undefined);
    }

    return Promise.resolve();
  }

  waitForTimeout(timeoutMs: number): Promise<void> {
    this.actions.push(`wait:${String(timeoutMs)}`);
    return Promise.resolve();
  }

  dismissCookieBanner(): Promise<void> {
    this.actions.push('dismiss-cookie-banner');
    return Promise.resolve();
  }

  getStateSelectionVisualTarget(): Promise<MixMateusLeafletVisualTarget> {
    this.actions.push('target:state');
    return Promise.resolve(createVisualTarget());
  }

  selectState(store: MixMateusMonitoredStore): Promise<void> {
    this.actions.push(`select-state:${store.stateCode}`);
    return Promise.resolve();
  }

  getCitySelectionVisualTarget(): Promise<MixMateusLeafletVisualTarget> {
    this.actions.push('target:city');
    return Promise.resolve(createVisualTarget());
  }

  selectCity(store: MixMateusMonitoredStore): Promise<void> {
    this.actions.push(`select-city:${store.cityName}`);
    return Promise.resolve();
  }

  getStoreSelectionVisualTarget(): Promise<MixMateusLeafletVisualTarget> {
    this.actions.push('target:store');
    return Promise.resolve(createVisualTarget());
  }

  selectStore(store: MixMateusMonitoredStore): Promise<void> {
    this.actions.push(`select-store:${store.storeSlug}`);
    return Promise.resolve();
  }

  waitForStoreLeaflets(store: MixMateusMonitoredStore): Promise<void> {
    this.actions.push(`wait-store-leaflets:${store.storeSlug}`);
    return Promise.resolve();
  }

  discoverCards(): Promise<readonly { readonly title: string; readonly cardIndex: number }[]> {
    this.actions.push('discover-cards');
    return Promise.resolve(this.cards);
  }

  getLeafletCardVisualTarget(cardIndex: number): Promise<MixMateusLeafletVisualTarget> {
    this.actions.push(`target:card:${String(cardIndex)}`);
    return Promise.resolve(createVisualTarget());
  }

  openLeafletAt(cardIndex: number): Promise<void> {
    this.actions.push(`open-card:${String(cardIndex)}`);
    return Promise.resolve();
  }

  getPdfDownloadVisualTarget(): Promise<MixMateusLeafletVisualTarget> {
    this.actions.push('target:download');
    return Promise.resolve(createVisualTarget());
  }

  resolvePdfDownloadUrl(): Promise<string> {
    this.actions.push('resolve-pdf');
    const url = this.pdfUrls.shift();
    return Promise.resolve(url ?? '');
  }

  closeLeafletModal(): Promise<void> {
    this.actions.push('close-modal');
    return Promise.resolve();
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
    return Promise.resolve(createVisualDatasetSample(input));
  }
}

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-07-23T10:00:00.000Z';
  }
}

class FakeLogger implements Logger {
  readonly infoMessages: string[] = [];

  readonly warnMessages: string[] = [];

  debug(): void {
    return undefined;
  }

  info(message: string): void {
    this.infoMessages.push(message);
  }

  warn(message: string): void {
    this.warnMessages.push(message);
  }

  error(): void {
    return undefined;
  }
}

function createVisualDatasetSample(input: CaptureVisualDatasetSampleInput): VisualDatasetSample {
  const viewportBox: PixelBoundingBox = {
    xMin: 10,
    yMin: 20,
    xMax: 110,
    yMax: 70,
    width: 100,
    height: 50,
  };

  return {
    sampleId: input.sampleId,
    runId: input.runId,
    supermarketId: input.supermarketId,
    stateName: input.stateName,
    pageUrl: 'https://ofertasmateus.com/',
    subject: input.subject,
    screenshotPng: Uint8Array.of(1),
    screenshotMetadata: {
      fileName: `${input.sampleId}.png`,
      mimeType: 'image/png',
      fullPage: true,
      viewport: { width: 1366, height: 768 },
      documentWidth: 1366,
      documentHeight: 1200,
      scrollPosition: { scrollX: 0, scrollY: 0 },
      capturedAtIso: '2026-07-23T10:00:00.000Z',
    },
    target: {
      label: input.label,
      viewportBox,
      documentBox: viewportBox,
      normalizedDocumentBox: {
        xCenter: 60 / 1366,
        yCenter: 45 / 1200,
        width: 100 / 1366,
        height: 50 / 1200,
      },
    },
    split: input.split,
  };
}

function createVisualTarget(): MixMateusLeafletVisualTarget {
  return {
    page: {
      captureFullPageSnapshot: () => {
        return Promise.resolve({
          pageUrl: 'https://ofertasmateus.com/',
          screenshotPng: Uint8Array.of(1),
          viewport: { width: 1366, height: 768 },
          documentSize: { width: 1366, height: 1200 },
          scrollPosition: { scrollX: 0, scrollY: 0 },
        });
      },
    },
    target: {
      locatorDescription: 'fake target',
      scrollIntoView: () => Promise.resolve(),
      isVisible: () => Promise.resolve(true),
      isEnabled: () => Promise.resolve(true),
      getViewportBoundingBox: () =>
        Promise.resolve({
          xMin: 10,
          yMin: 20,
          xMax: 110,
          yMax: 70,
          width: 100,
          height: 50,
        } satisfies PixelBoundingBox),
    },
  };
}
