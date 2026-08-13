import { describe, expect, it, vi } from 'vitest';
import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { Logger } from '../../../application/ports/logger';
import type { CaptureVisualDatasetSampleInput } from '../../../application/services/visual-dataset-capture-service';
import type { VisualDatasetSample } from '../../../domain/dataset/visual-dataset-sample';
import type {
  ComboAtacadistaLeafletPage,
  ComboAtacadistaLeafletPageFactory,
  ComboAtacadistaLeafletVisualTarget,
} from './combo-atacadista-leaflet-page';
import {
  ComboAtacadistaLeafletExtractionError,
  ComboAtacadistaLeafletExtractor,
  type ExtractComboAtacadistaLeafletsInput,
} from './combo-atacadista-leaflet-extractor';

describe('ComboAtacadistaLeafletExtractor', () => {
  it('runs the full visual FSM from the home page', async () => {
    const page = new FakeComboPage([
      {
        leafletId: 'comboatacadista-ofertas-dia',
        title: 'Ofertas do dia',
        href: 'https://www.comboatacadista.com.br/ofertas-dia',
        sourcePageUrl: 'https://www.comboatacadista.com.br/ofertas',
        validUntilIso: '2026-08-13',
        cardIndex: 0,
      },
    ]);
    const capture = new FakeCaptureService();
    const extractor = new ComboAtacadistaLeafletExtractor(
      new FakePageFactory(page),
      { nowIso: () => '2026-08-13T10:00:00.000Z' },
      createLogger(),
      capture,
    );

    const result = await extractor.extract({
      ...createInput(),
      startUrlMode: 'home',
      visualDataset: {
        runId: 'run-1',
        split: 'train',
      },
    });

    expect(result.units[0]?.leaflets[0]).toEqual({
      leafletId: 'comboatacadista-ofertas-dia',
      title: 'Ofertas do dia',
      sourcePageUrl: 'https://www.comboatacadista.com.br/ofertas-dia',
      coverImageUrl: 'https://www.comboatacadista.com.br/upload/weekend_image/1.jpeg',
      imageUrls: [
        'https://www.comboatacadista.com.br/upload/weekend_image/1.jpeg',
        'https://www.comboatacadista.com.br/upload/weekend_image/2.jpeg',
      ],
      validUntilIso: '2026-08-13',
    });
    expect(capture.inputs.map((input) => input.label)).toEqual([
      'open_leaflets_page_button',
      'open_leaflet_modal_button',
      'extract_leaflet_image',
      'extract_leaflet_image',
    ]);
    expect(page.events).toEqual([
      'goto:https://www.comboatacadista.com.br/',
      'wait:1000',
      'open-home-offers',
      'wait-offers',
      'wait:1000',
      'open-card:0',
      'wait-gallery',
      'wait:1000',
      'goto:https://www.comboatacadista.com.br/ofertas',
      'wait-offers',
      'close',
    ]);
  });

  it('supports the offers-page shortcut without visual capture', async () => {
    const page = new FakeComboPage([
      {
        leafletId: 'comboatacadista-ofertascombo',
        title: 'Encarte Combo',
        href: 'https://www.comboatacadista.com.br/ofertascombo',
        sourcePageUrl: 'https://www.comboatacadista.com.br/ofertas',
        validUntilIso: null,
        cardIndex: 0,
      },
    ]);
    const extractor = new ComboAtacadistaLeafletExtractor(
      new FakePageFactory(page),
      { nowIso: () => '2026-08-13T10:00:00.000Z' },
      createLogger(),
    );

    const result = await extractor.extract(createInput());

    expect(result.failedUnits).toEqual([]);
    expect(page.events[0]).toBe('goto:https://www.comboatacadista.com.br/ofertas');
  });

  it('supports the home path without visual dataset configuration', async () => {
    const page = new FakeComboPage([
      {
        leafletId: 'comboatacadista-ofertas-dia',
        title: 'Ofertas do dia',
        href: 'https://www.comboatacadista.com.br/ofertas-dia',
        sourcePageUrl: 'https://www.comboatacadista.com.br/ofertas',
        validUntilIso: null,
        cardIndex: 0,
      },
    ]);
    const extractor = new ComboAtacadistaLeafletExtractor(
      new FakePageFactory(page),
      { nowIso: () => '2026-08-13T10:00:00.000Z' },
      createLogger(),
    );

    const result = await extractor.extract({
      ...createInput(),
      startUrlMode: 'home',
    });

    expect(result.units[0]?.leaflets).toHaveLength(1);
  });

  it('returns a failed unit for unsupported page variants and validates input', async () => {
    const extractor = new ComboAtacadistaLeafletExtractor(
      new FakePageFactory(new FakeComboPage([])),
      { nowIso: () => '2026-08-13T10:00:00.000Z' },
      createLogger(),
    );

    const result = await extractor.extract(createInput());

    expect(result.units).toEqual([]);
    expect(result.failedUnits[0]?.errorMessage).toBe(
      'Combo Atacadista offers page did not expose leaflet cards.',
    );
    await expect(
      extractor.extract({
        ...createInput(),
        homeUrl: ' ',
      }),
    ).rejects.toThrow(ComboAtacadistaLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput(),
        offersUrl: ' ',
      }),
    ).rejects.toThrow('offersUrl cannot be blank.');
    await expect(
      extractor.extract({
        ...createInput(),
        timeoutMs: 0,
      }),
    ).rejects.toThrow('timeoutMs must be positive.');
  });

  it('returns a failed unit when a leaflet page has no images', async () => {
    const page = new FakeComboPage([
      {
        leafletId: 'comboatacadista-empty',
        title: 'Empty',
        href: 'https://www.comboatacadista.com.br/empty',
        sourcePageUrl: 'https://www.comboatacadista.com.br/ofertas',
        validUntilIso: null,
        cardIndex: 0,
      },
    ]);
    page.imageUrls = [];
    const extractor = new ComboAtacadistaLeafletExtractor(
      new FakePageFactory(page),
      { nowIso: () => '2026-08-13T10:00:00.000Z' },
      createLogger(),
    );

    const result = await extractor.extract(createInput());

    expect(result.failedUnits[0]?.errorMessage).toBe(
      'Combo Atacadista leaflet page did not expose images: https://www.comboatacadista.com.br/empty',
    );
  });

  it('handles non-Error Playwright failures', async () => {
    const page = new FakeComboPage([]);
    page.throwNonErrorOnCards = true;
    const extractor = new ComboAtacadistaLeafletExtractor(
      new FakePageFactory(page),
      { nowIso: () => '2026-08-13T10:00:00.000Z' },
      createLogger(),
    );

    const result = await extractor.extract(createInput());

    expect(result.failedUnits[0]?.errorMessage).toBe(
      'Unexpected Combo Atacadista Playwright failure.',
    );
  });

  it('propagates page cleanup failures from the finally block', async () => {
    const page = new FakeComboPage([
      {
        leafletId: 'comboatacadista-ofertas-dia',
        title: 'Ofertas do dia',
        href: 'https://www.comboatacadista.com.br/ofertas-dia',
        sourcePageUrl: 'https://www.comboatacadista.com.br/ofertas',
        validUntilIso: null,
        cardIndex: 0,
      },
    ]);
    page.throwOnClose = true;
    const extractor = new ComboAtacadistaLeafletExtractor(
      new FakePageFactory(page),
      { nowIso: () => '2026-08-13T10:00:00.000Z' },
      createLogger(),
    );

    await expect(extractor.extract(createInput())).rejects.toThrow('close failed');
  });

  it('propagates cleanup failures after extraction failures', async () => {
    const page = new FakeComboPage([]);
    page.throwOnClose = true;
    const extractor = new ComboAtacadistaLeafletExtractor(
      new FakePageFactory(page),
      { nowIso: () => '2026-08-13T10:00:00.000Z' },
      createLogger(),
    );

    await expect(extractor.extract(createInput())).rejects.toThrow('close failed');
  });
});

function createInput(): ExtractComboAtacadistaLeafletsInput {
  return {
    homeUrl: 'https://www.comboatacadista.com.br/',
    offersUrl: 'https://www.comboatacadista.com.br/ofertas',
    startUrlMode: 'offers-page',
    viewport: {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
    },
    timeoutMs: 30_000,
    settleDelayMs: 1_000,
  };
}

class FakePageFactory implements ComboAtacadistaLeafletPageFactory {
  private readonly page: ComboAtacadistaLeafletPage;

  constructor(page: ComboAtacadistaLeafletPage) {
    this.page = page;
  }

  openPage(): Promise<ComboAtacadistaLeafletPage> {
    return Promise.resolve(this.page);
  }
}

class FakeComboPage implements ComboAtacadistaLeafletPage {
  readonly events: string[] = [];

  throwNonErrorOnCards = false;

  throwOnClose = false;

  imageUrls: readonly string[] = [
    'https://www.comboatacadista.com.br/upload/weekend_image/1.jpeg',
    'https://www.comboatacadista.com.br/upload/weekend_image/2.jpeg',
  ];

  private readonly cards: ReturnType<
    ComboAtacadistaLeafletPage['listLeafletCards']
  > extends Promise<infer T>
    ? T
    : never;

  private currentUrl = 'about:blank';

  constructor(cards: FakeComboPage['cards']) {
    this.cards = cards;
  }

  goto(url: string): Promise<void> {
    this.currentUrl = url;
    this.events.push(`goto:${url}`);
    return Promise.resolve();
  }

  gotoHome(): Promise<void> {
    return this.goto('https://www.comboatacadista.com.br/');
  }

  waitForTimeout(timeoutMs: number): Promise<void> {
    this.events.push(`wait:${String(timeoutMs)}`);
    return Promise.resolve();
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(this.currentUrl);
  }

  getHomeOffersVisualTarget(): Promise<ComboAtacadistaLeafletVisualTarget> {
    return Promise.resolve(createVisualTarget('home-offers'));
  }

  openHomeOffersPage(): Promise<void> {
    this.currentUrl = 'https://www.comboatacadista.com.br/ofertas';
    this.events.push('open-home-offers');
    return Promise.resolve();
  }

  waitForOffersPage(): Promise<void> {
    this.events.push('wait-offers');
    return Promise.resolve();
  }

  listLeafletCards(): Promise<FakeComboPage['cards']> {
    if (this.throwNonErrorOnCards) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      return Promise.reject('missing cards');
    }

    return Promise.resolve(this.cards);
  }

  getLeafletCardVisualTarget(cardIndex: number): Promise<ComboAtacadistaLeafletVisualTarget> {
    return Promise.resolve(createVisualTarget(`card-${String(cardIndex)}`));
  }

  openLeafletCard(cardIndex: number): Promise<void> {
    this.currentUrl = this.cards[cardIndex]?.href ?? this.currentUrl;
    this.events.push(`open-card:${String(cardIndex)}`);
    return Promise.resolve();
  }

  waitForImageGallery(): Promise<void> {
    this.events.push('wait-gallery');
    return Promise.resolve();
  }

  listLeafletImageUrls(): Promise<readonly string[]> {
    return Promise.resolve(this.imageUrls);
  }

  getLeafletImageVisualTarget(imageIndex: number): Promise<ComboAtacadistaLeafletVisualTarget> {
    return Promise.resolve(createVisualTarget(`image-${String(imageIndex)}`));
  }

  close(): Promise<void> {
    this.events.push('close');

    if (this.throwOnClose) {
      throw new Error('close failed');
    }

    return Promise.resolve();
  }
}

class FakeCaptureService {
  readonly inputs: CaptureVisualDatasetSampleInput[] = [];

  captureBeforeAction(input: CaptureVisualDatasetSampleInput): Promise<VisualDatasetSample> {
    this.inputs.push(input);
    return Promise.resolve({
      sampleId: input.sampleId,
      runId: input.runId,
      supermarketId: input.supermarketId,
      stateName: input.stateName,
      pageUrl: 'https://www.comboatacadista.com.br/',
      subject: input.subject,
      screenshotPng: Uint8Array.of(1),
      screenshotMetadata: {
        fileName: `${input.sampleId}.png`,
        mimeType: 'image/png',
        fullPage: true,
        viewport: {
          width: 1280,
          height: 720,
        },
        documentWidth: 1280,
        documentHeight: 720,
        scrollPosition: {
          scrollX: 0,
          scrollY: 0,
        },
        capturedAtIso: '2026-08-13T10:00:00.000Z',
      },
      target: {
        label: input.label,
        viewportBox: {
          xMin: 0,
          yMin: 0,
          xMax: 10,
          yMax: 10,
          width: 10,
          height: 10,
        },
        documentBox: {
          xMin: 0,
          yMin: 0,
          xMax: 10,
          yMax: 10,
          width: 10,
          height: 10,
        },
        normalizedDocumentBox: {
          xCenter: 0.5,
          yCenter: 0.5,
          width: 0.1,
          height: 0.1,
        },
      },
      split: input.split,
    });
  }
}

function createVisualTarget(locatorDescription: string): ComboAtacadistaLeafletVisualTarget {
  return {
    page: new FakeVisualDatasetPage(),
    target: new FakeVisualActionTarget(locatorDescription),
  };
}

class FakeVisualDatasetPage implements VisualDatasetPage {
  captureFullPageSnapshot(): never {
    throw new Error('Fake capture service does not use the page.');
  }
}

class FakeVisualActionTarget implements VisualActionTarget {
  readonly locatorDescription: string;

  constructor(locatorDescription: string) {
    this.locatorDescription = locatorDescription;
  }

  scrollIntoView(): Promise<void> {
    return Promise.resolve();
  }

  isVisible(): Promise<boolean> {
    return Promise.resolve(true);
  }

  isEnabled(): Promise<boolean> {
    return Promise.resolve(true);
  }

  getViewportBoundingBox(): Promise<
    VisualActionTarget['getViewportBoundingBox'] extends () => Promise<infer T> ? T : never
  > {
    return Promise.resolve(null);
  }
}

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}
