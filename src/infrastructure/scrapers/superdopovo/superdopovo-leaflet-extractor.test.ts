import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { LogContext, Logger } from '../../../application/ports/logger';
import type {
  VisualActionTarget,
  VisualDatasetPage,
  VisualDatasetPageSnapshot,
} from '../../../application/ports/visual-dataset-page';
import type { CaptureVisualDatasetSampleInput } from '../../../application/services/visual-dataset-capture-service';
import type { PixelBoundingBox } from '../../../domain/dataset/bounding-box';
import type { VisualDatasetSample } from '../../../domain/dataset/visual-dataset-sample';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type { SuperDoPovoBooklet, SuperDoPovoShop } from './superdopovo-api-types';
import type {
  OpenedSuperDoPovoLeaflet,
  OpenSuperDoPovoLeafletPageInput,
  SuperDoPovoLeafletCard,
  SuperDoPovoLeafletPage,
  SuperDoPovoLeafletPageFactory,
  SuperDoPovoLeafletVisualTarget,
} from './superdopovo-leaflet-page';
import {
  type ExtractSuperDoPovoLeafletsInput,
  SuperDoPovoLeafletExtractionError,
  SuperDoPovoLeafletExtractor,
} from './superdopovo-leaflet-extractor';

describe('SuperDoPovoLeafletExtractor', () => {
  it('navigates from home, captures visual samples and extracts deduplicated images', async () => {
    const page = new FakePage({
      cards: [
        {
          title: '',
          coverImageUrl: 'https://img.test/cover-1.jpg',
        },
        {
          title: 'Unmatched card',
          coverImageUrl: 'https://img.test/cover-2.jpg',
        },
      ],
      openedLeaflets: [
        {
          title: ' ',
          imageUrls: [' https://img.test/modal-extra.jpg ', 'https://img.test/modal-extra.jpg'],
        },
      ],
    });
    const captureService = new FakeVisualDatasetCaptureService(page.events);

    const result = await createExtractor(page, captureService).extract({
      ...createInput([createBooklet(1609, 24, 'Booklet API')]),
      visualDataset: {
        runId: 'run-1',
        split: 'unassigned',
      },
    });

    expect(page.events).toEqual([
      'goto:https://loja.superdopovo.com.br',
      'wait:0',
      'dismiss-cookie',
      'capture:superdopovo-sections-menu',
      'open-sections',
      'wait:0',
      'capture:superdopovo-leaflets-link',
      'open-leaflets-page:https://loja.superdopovo.com.br/booklets',
      'wait:0',
      'capture:superdopovo-leaflet-card',
      'open-card:0',
      'capture:superdopovo-leaflet-image',
      'capture:superdopovo-leaflet-image',
      'capture:superdopovo-leaflet-modal-close',
      'close-modal',
      'close',
    ]);
    expect(result).toEqual({
      supermarketId: 'superdopovo',
      sourceUrl: 'https://loja.superdopovo.com.br/booklets',
      extractedAtIso: '2026-07-23T10:00:00.000Z',
      leaflets: [
        {
          leafletId: 'superdopovo-1609',
          title: 'Booklet API',
          cardIndex: 0,
          coverImageUrl: 'https://img.test/cover-1.jpg',
          images: [
            {
              order: 1,
              imageUrl: 'https://img.test/cover-1.jpg',
            },
            {
              order: 2,
              imageUrl: 'https://img.test/modal-extra.jpg',
            },
          ],
        },
      ],
    });
    expect(captureService.inputs.map((input) => input.sampleId)).toEqual([
      'run-1-sections-menu',
      'run-1-leaflets-link',
      'run-1-shop-24-card-1-booklet-1609',
      'run-1-shop-24-card-1-booklet-1609-image-1',
      'run-1-shop-24-card-1-booklet-1609-image-2',
      'run-1-shop-24-card-1-booklet-1609-close',
    ]);
    expect(captureService.inputs[2]).toMatchObject({
      stateName: 'LEAFLETS_PAGE',
      label: 'open_leaflet_modal_button',
      subject: {
        subjectKind: 'superdopovo-leaflet-card',
        shopId: 24,
        shopName: 'Serrinha',
        cardIndex: 0,
        bookletId: 1609,
      },
    });
    expect(captureService.inputs[3]).toMatchObject({
      stateName: 'LEAFLET_MODAL',
      label: 'extract_leaflet_image',
      subject: {
        subjectKind: 'superdopovo-leaflet-image',
        imageIndex: 0,
        imageUrl: 'https://img.test/cover-1.jpg',
      },
    });
  });

  it('uses modal title before booklet and card titles', async () => {
    const page = new FakePage({
      cards: [
        {
          title: 'Card title',
          coverImageUrl: 'https://img.test/cover-1.jpg',
        },
      ],
      openedLeaflets: [
        {
          title: 'Modal title',
          imageUrls: [],
        },
      ],
    });

    const result = await createExtractor(page).extract(
      createInput([createBooklet(1609, 24, 'API')]),
    );

    expect(result.leaflets[0]?.title).toBe('Modal title');
  });

  it('uses card title when modal and booklet titles are blank', async () => {
    const page = new FakePage({
      cards: [
        {
          title: 'Card title',
          coverImageUrl: 'https://img.test/cover-1.jpg',
        },
      ],
      openedLeaflets: [
        {
          title: ' ',
          imageUrls: [],
        },
      ],
    });

    const result = await createExtractor(page).extract(createInput([createBooklet(1609, 24, ' ')]));

    expect(result.leaflets[0]?.title).toBe('Card title');
  });

  it('closes the page when a leaflet has no images', async () => {
    const page = new FakePage({
      cards: [
        {
          title: 'Card title',
          coverImageUrl: 'https://img.test/cover-1.jpg',
        },
      ],
      openedLeaflets: [
        {
          title: 'Card title',
          imageUrls: [],
        },
      ],
    });

    await expect(
      createExtractor(page).extract(
        createInput([
          {
            ...createBooklet(1609, 24, 'Booklet API'),
            coverImageUrl: '',
            imageUrls: [],
          },
        ]),
      ),
    ).rejects.toThrow('Super do Povo booklet 1609 did not expose image URLs.');
    expect(page.closed).toBe(true);
  });

  it('rejects invalid input values before opening a page', async () => {
    const extractor = createExtractor(new FakePage({ cards: [], openedLeaflets: [] }));

    await expect(
      extractor.extract({
        ...createInput([]),
        homeUrl: 'invalid',
      }),
    ).rejects.toThrow(SuperDoPovoLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput([]),
        sourceUrl: 'invalid',
      }),
    ).rejects.toThrow('sourceUrl must be absolute and valid.');
    await expect(
      extractor.extract({
        ...createInput([]),
        timeoutMs: 0,
      }),
    ).rejects.toThrow('timeoutMs must be a positive integer.');
    await expect(
      extractor.extract({
        ...createInput([]),
        settleDelayMs: -1,
      }),
    ).rejects.toThrow('settleDelayMs must be a non-negative integer.');
  });
});

function createExtractor(
  page: FakePage,
  captureService?: {
    captureBeforeAction(input: CaptureVisualDatasetSampleInput): Promise<VisualDatasetSample>;
  },
): SuperDoPovoLeafletExtractor {
  return new SuperDoPovoLeafletExtractor(
    new FakePageFactory(page),
    new FixedClock(),
    new MemoryLogger(),
    captureService,
  );
}

function createInput(
  expectedBooklets: readonly SuperDoPovoBooklet[],
): ExtractSuperDoPovoLeafletsInput {
  return {
    homeUrl: 'https://loja.superdopovo.com.br',
    sourceUrl: 'https://loja.superdopovo.com.br/booklets',
    shop: createShop(),
    expectedBooklets,
    viewport: createVisualViewport({
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
    }),
    timeoutMs: 30_000,
    settleDelayMs: 0,
  };
}

function createShop(): SuperDoPovoShop {
  return {
    shopId: 24,
    name: 'Serrinha',
    address: {
      zipcode: '',
      street: '',
      number: '',
      neighborhood: '',
      city: 'Fortaleza',
      state: 'CE',
    },
  };
}

function createBooklet(bookletId: number, shopId: number, name: string): SuperDoPovoBooklet {
  return {
    bookletId,
    name,
    startDateIso: null,
    endDateIso: null,
    coverImageUrl: 'https://img.test/cover-1.jpg',
    imageUrls: ['https://img.test/cover-1.jpg'],
    shopId,
  };
}

class FakePageFactory implements SuperDoPovoLeafletPageFactory {
  private readonly page: FakePage;

  constructor(page: FakePage) {
    this.page = page;
  }

  openPage(input: OpenSuperDoPovoLeafletPageInput): Promise<SuperDoPovoLeafletPage> {
    void input;

    return Promise.resolve(this.page);
  }
}

class FakePage implements SuperDoPovoLeafletPage {
  readonly events: string[] = [];

  private readonly cards: readonly SuperDoPovoLeafletCard[];

  private readonly openedLeaflets: readonly OpenedSuperDoPovoLeaflet[];

  closed = false;

  constructor(input: {
    readonly cards: readonly SuperDoPovoLeafletCard[];
    readonly openedLeaflets: readonly OpenedSuperDoPovoLeaflet[];
  }) {
    this.cards = input.cards;
    this.openedLeaflets = input.openedLeaflets;
  }

  goto(url: string): Promise<void> {
    this.events.push(`goto:${url}`);
    return Promise.resolve();
  }

  waitForTimeout(timeoutMs: number): Promise<void> {
    this.events.push(`wait:${String(timeoutMs)}`);
    return Promise.resolve();
  }

  dismissCookieBanner(): Promise<void> {
    this.events.push('dismiss-cookie');
    return Promise.resolve();
  }

  getSectionsMenuVisualTarget(): Promise<SuperDoPovoLeafletVisualTarget> {
    return Promise.resolve(createVisualTarget());
  }

  openSectionsMenu(): Promise<void> {
    this.events.push('open-sections');
    return Promise.resolve();
  }

  getLeafletsLinkVisualTarget(): Promise<SuperDoPovoLeafletVisualTarget> {
    return Promise.resolve(createVisualTarget());
  }

  openLeafletsPage(expectedUrl: string): Promise<void> {
    this.events.push(`open-leaflets-page:${expectedUrl}`);
    return Promise.resolve();
  }

  discoverCards(): Promise<readonly SuperDoPovoLeafletCard[]> {
    return Promise.resolve(this.cards);
  }

  getLeafletCardVisualTarget(cardIndex: number): Promise<SuperDoPovoLeafletVisualTarget> {
    void cardIndex;

    return Promise.resolve(createVisualTarget());
  }

  openLeafletAt(cardIndex: number): Promise<OpenedSuperDoPovoLeaflet> {
    this.events.push(`open-card:${String(cardIndex)}`);
    const openedLeaflet = this.openedLeaflets[cardIndex];

    if (openedLeaflet === undefined) {
      return Promise.reject(new Error(`Missing fake opened leaflet ${String(cardIndex)}.`));
    }

    return Promise.resolve(openedLeaflet);
  }

  getLeafletModalImageVisualTarget(imageIndex: number): Promise<SuperDoPovoLeafletVisualTarget> {
    void imageIndex;

    return Promise.resolve(createVisualTarget());
  }

  getLeafletModalCloseVisualTarget(): Promise<SuperDoPovoLeafletVisualTarget> {
    return Promise.resolve(createVisualTarget());
  }

  closeLeafletModal(): Promise<void> {
    this.events.push('close-modal');
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    this.events.push('close');
    return Promise.resolve();
  }
}

function createVisualTarget(): SuperDoPovoLeafletVisualTarget {
  return {
    page: new FakeVisualDatasetPage(),
    target: new FakeVisualActionTarget(),
  };
}

class FakeVisualDatasetPage implements VisualDatasetPage {
  captureFullPageSnapshot(): Promise<VisualDatasetPageSnapshot> {
    return Promise.resolve({
      pageUrl: 'https://loja.superdopovo.com.br/booklets',
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
    });
  }
}

class FakeVisualActionTarget implements VisualActionTarget {
  readonly locatorDescription = 'fake target';

  scrollIntoView(): Promise<void> {
    return Promise.resolve();
  }

  isVisible(): Promise<boolean> {
    return Promise.resolve(true);
  }

  isEnabled(): Promise<boolean> {
    return Promise.resolve(true);
  }

  getViewportBoundingBox(): Promise<PixelBoundingBox> {
    return Promise.resolve({
      xMin: 10,
      yMin: 20,
      xMax: 110,
      yMax: 60,
      width: 100,
      height: 40,
    });
  }
}

class FakeVisualDatasetCaptureService {
  readonly inputs: CaptureVisualDatasetSampleInput[] = [];

  private readonly events: string[];

  constructor(events: string[]) {
    this.events = events;
  }

  captureBeforeAction(input: CaptureVisualDatasetSampleInput): Promise<VisualDatasetSample> {
    this.events.push(`capture:${input.subject.subjectKind}`);
    this.inputs.push(input);

    return Promise.resolve({
      sampleId: input.sampleId,
      runId: input.runId,
      supermarketId: input.supermarketId,
      stateName: input.stateName,
      pageUrl: 'https://loja.superdopovo.com.br/booklets',
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
        capturedAtIso: '2026-07-23T10:00:00.000Z',
      },
      target: {
        label: input.label,
        viewportBox: {
          xMin: 10,
          yMin: 20,
          xMax: 110,
          yMax: 60,
          width: 100,
          height: 40,
        },
        documentBox: {
          xMin: 10,
          yMin: 20,
          xMax: 110,
          yMax: 60,
          width: 100,
          height: 40,
        },
        normalizedDocumentBox: {
          xCenter: 60 / 1366,
          yCenter: 40 / 1600,
          width: 100 / 1366,
          height: 40 / 1600,
        },
      },
      split: input.split,
    });
  }
}

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-07-23T10:00:00.000Z';
  }
}

class MemoryLogger implements Logger {
  debug(message: string, context?: LogContext): void {
    void message;
    void context;
  }

  info(message: string, context?: LogContext): void {
    void message;
    void context;
  }

  warn(message: string, context?: LogContext): void {
    void message;
    void context;
  }

  error(message: string, context?: LogContext): void {
    void message;
    void context;
  }
}
