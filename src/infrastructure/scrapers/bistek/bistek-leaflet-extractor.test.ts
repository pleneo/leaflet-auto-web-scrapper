import { describe, expect, it, vi } from 'vitest';
import type {
  VisualActionTarget,
  VisualDatasetPage,
  VisualDatasetPageSnapshot,
} from '../../../application/ports/visual-dataset-page';
import type { CaptureVisualDatasetSampleInput } from '../../../application/services/visual-dataset-capture-service';
import type { PixelBoundingBox } from '../../../domain/dataset/bounding-box';
import type { VisualDatasetSample } from '../../../domain/dataset/visual-dataset-sample';
import type { BistekLeafletCard, BistekMonitoredStore } from './bistek-image-gallery-leaflet';
import { BistekLeafletExtractor } from './bistek-leaflet-extractor';
import type {
  BistekLeafletPage,
  BistekLeafletPageFactory,
  BistekLeafletVisualTarget,
} from './bistek-leaflet-page';

describe('BistekLeafletExtractor', () => {
  it('walks the city/store/modal flow and captures visual dataset samples before actions', async () => {
    const captureService = new FakeCaptureService();
    const extractionPage = new FakeBistekPage([createStore()], [createCard()]);
    const extractor = new BistekLeafletExtractor(
      new FakeBistekPageFactory([new FakeBistekPage([createStore()], []), extractionPage]),
      { nowIso: () => '2026-08-14T10:00:00.000Z' },
      createLogger(),
      captureService,
    );

    const result = await extractor.extract({
      offersUrl: 'https://institucional.bistek.com.br/ofertas',
      viewport: {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      },
      timeoutMs: 30_000,
      storeTimeoutMs: 30_000,
      maxStoreAttempts: 1,
      settleDelayMs: 0,
      storeIds: ['2'],
      cityIds: [],
      visualDataset: {
        runId: 'run-1',
        split: 'train',
      },
    });

    expect(result).toMatchObject({
      source: 'bistek-playwright',
      extractedAtIso: '2026-08-14T10:00:00.000Z',
      failedStores: [],
      stores: [
        {
          unitId: 'bistek-sc-blumenau-loja-no-4-bairro-garcia-2',
          leaflets: [
            {
              leafletId: 'bistek-sc-blumenau-loja-no-4-bairro-garcia-2-oferta-1897',
              title: 'Ofertas válidas de 14/08/2026 até 16/08/2026',
              coverImageUrl: 'https://institucional.bistek.com.br/image/capa.jpg',
            },
          ],
        },
      ],
    });
    expect(captureService.inputs.map((input) => [input.stateName, input.label])).toEqual([
      ['CITY_SELECTION', 'select_city_button'],
      ['STORE_SELECTION', 'select_store_button'],
      ['LEAFLETS_PAGE', 'open_leaflet_modal_button'],
      ['IMAGE_GALLERY', 'download_image_button'],
      ['IMAGE_GALLERY', 'close_modal_button'],
    ]);
    expect(extractionPage.events).toEqual([
      'goto',
      'wait',
      'ensure-modal',
      'target-city',
      'select-city',
      'wait',
      'target-store',
      'select-store',
      'wait-leaflets',
      'wait',
      'discover-cards',
      'target-card',
      'open-card',
      'wait',
      'target-download',
      'resolve-download',
      'target-close',
      'close-modal',
      'close',
    ]);
  });

  it('does not request visual targets when visual dataset is disabled', async () => {
    const extractionPage = new FakeBistekPage([createStore()], [createCard()]);
    const extractor = new BistekLeafletExtractor(
      new FakeBistekPageFactory([new FakeBistekPage([createStore()], []), extractionPage]),
      { nowIso: () => '2026-08-14T10:00:00.000Z' },
      createLogger(),
      new FakeCaptureService(),
    );

    await extractor.extract({
      offersUrl: 'https://institucional.bistek.com.br/ofertas',
      viewport: {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      },
      timeoutMs: 30_000,
      storeTimeoutMs: 30_000,
      maxStoreAttempts: 1,
      settleDelayMs: 0,
      storeIds: ['2'],
      cityIds: [],
    });

    expect(extractionPage.events).not.toContain('target-city');
    expect(extractionPage.events).not.toContain('target-store');
  });
});

class FakeBistekPageFactory implements BistekLeafletPageFactory {
  private readonly pages: BistekLeafletPage[];

  constructor(pages: BistekLeafletPage[]) {
    this.pages = pages;
  }

  openPage(): Promise<BistekLeafletPage> {
    const page = this.pages.shift();

    if (page === undefined) {
      throw new Error('No fake Bistek page available.');
    }

    return Promise.resolve(page);
  }
}

class FakeBistekPage implements BistekLeafletPage {
  readonly events: string[] = [];

  private readonly stores: readonly BistekMonitoredStore[];

  private readonly cards: readonly BistekLeafletCard[];

  constructor(stores: readonly BistekMonitoredStore[], cards: readonly BistekLeafletCard[]) {
    this.stores = stores;
    this.cards = cards;
  }

  goto(): Promise<void> {
    this.events.push('goto');
    return Promise.resolve();
  }

  waitForTimeout(): Promise<void> {
    this.events.push('wait');
    return Promise.resolve();
  }

  discoverStores(): Promise<readonly BistekMonitoredStore[]> {
    this.events.push('discover-stores');
    return Promise.resolve(this.stores);
  }

  ensureStoreSelectionModalOpen(): Promise<void> {
    this.events.push('ensure-modal');
    return Promise.resolve();
  }

  getCitySelectionVisualTarget(): Promise<BistekLeafletVisualTarget> {
    this.events.push('target-city');
    return Promise.resolve(createVisualTarget('city'));
  }

  selectCity(): Promise<void> {
    this.events.push('select-city');
    return Promise.resolve();
  }

  getStoreSelectionVisualTarget(): Promise<BistekLeafletVisualTarget> {
    this.events.push('target-store');
    return Promise.resolve(createVisualTarget('store'));
  }

  selectStore(): Promise<void> {
    this.events.push('select-store');
    return Promise.resolve();
  }

  waitForStoreLeaflets(): Promise<void> {
    this.events.push('wait-leaflets');
    return Promise.resolve();
  }

  discoverCards(): Promise<readonly BistekLeafletCard[]> {
    this.events.push('discover-cards');
    return Promise.resolve(this.cards);
  }

  getLeafletCardVisualTarget(): Promise<BistekLeafletVisualTarget> {
    this.events.push('target-card');
    return Promise.resolve(createVisualTarget('card'));
  }

  openLeafletAt(): Promise<void> {
    this.events.push('open-card');
    return Promise.resolve();
  }

  getImageDownloadVisualTarget(): Promise<BistekLeafletVisualTarget> {
    this.events.push('target-download');
    return Promise.resolve(createVisualTarget('download'));
  }

  resolveActiveDownloadImageUrl(): Promise<string> {
    this.events.push('resolve-download');
    return Promise.resolve('https://institucional.bistek.com.br/image/capa.jpg');
  }

  getModalCloseVisualTarget(): Promise<BistekLeafletVisualTarget> {
    this.events.push('target-close');
    return Promise.resolve(createVisualTarget('close'));
  }

  closeLeafletModal(): Promise<void> {
    this.events.push('close-modal');
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.events.push('close');
    return Promise.resolve();
  }
}

class FakeCaptureService {
  readonly inputs: CaptureVisualDatasetSampleInput[] = [];

  captureBeforeAction(input: CaptureVisualDatasetSampleInput): Promise<VisualDatasetSample> {
    this.inputs.push(input);

    return Promise.resolve(createSample(input));
  }
}

class FakeVisualDatasetPage implements VisualDatasetPage {
  captureFullPageSnapshot(): Promise<VisualDatasetPageSnapshot> {
    return Promise.resolve({
      pageUrl: 'https://institucional.bistek.com.br/ofertas',
      screenshotPng: Uint8Array.of(1, 2, 3),
      viewport: {
        width: 1366,
        height: 768,
      },
      documentSize: {
        width: 1366,
        height: 2000,
      },
      scrollPosition: {
        scrollX: 0,
        scrollY: 0,
      },
    });
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

  getViewportBoundingBox(): Promise<PixelBoundingBox> {
    return Promise.resolve({
      xMin: 10,
      yMin: 10,
      xMax: 110,
      yMax: 60,
      width: 100,
      height: 50,
    });
  }
}

function createVisualTarget(locatorDescription: string): BistekLeafletVisualTarget {
  return {
    page: new FakeVisualDatasetPage(),
    target: new FakeVisualActionTarget(locatorDescription),
  };
}

function createSample(input: CaptureVisualDatasetSampleInput): VisualDatasetSample {
  return {
    sampleId: input.sampleId,
    runId: input.runId,
    supermarketId: input.supermarketId,
    stateName: input.stateName,
    pageUrl: 'https://institucional.bistek.com.br/ofertas',
    subject: input.subject,
    screenshotPng: Uint8Array.of(1, 2, 3),
    screenshotMetadata: {
      fileName: `${input.sampleId}.png`,
      mimeType: 'image/png',
      fullPage: true,
      viewport: {
        width: 1366,
        height: 768,
      },
      documentWidth: 1366,
      documentHeight: 2000,
      scrollPosition: {
        scrollX: 0,
        scrollY: 0,
      },
      capturedAtIso: '2026-08-14T10:00:00.000Z',
    },
    target: {
      label: input.label,
      viewportBox: {
        xMin: 10,
        yMin: 10,
        xMax: 110,
        yMax: 60,
        width: 100,
        height: 50,
      },
      documentBox: {
        xMin: 10,
        yMin: 10,
        xMax: 110,
        yMax: 60,
        width: 100,
        height: 50,
      },
      normalizedDocumentBox: {
        xCenter: 0.0439,
        yCenter: 0.0175,
        width: 0.0732,
        height: 0.025,
      },
    },
    split: input.split,
  };
}

function createStore(): BistekMonitoredStore {
  return {
    cityId: '4348',
    stateCode: 'SC',
    cityName: 'Blumenau',
    storeId: '2',
    storeName: 'Loja Nº 4 - Bairro Garcia',
    storeSlug: 'sc-blumenau-loja-no-4-bairro-garcia-2',
  };
}

function createCard(): BistekLeafletCard {
  return {
    leafletId: 'bistek-sc-blumenau-loja-no-4-bairro-garcia-2-oferta-1897',
    title: 'Ofertas válidas de 14/08/2026 até 16/08/2026',
    cardIndex: 0,
    fancyboxGroup: 'Oferta-1897',
    coverImageUrl: 'https://institucional.bistek.com.br/image/capa.jpg',
    imageUrls: ['https://institucional.bistek.com.br/image/capa.jpg'],
    validityStartDateIso: '2026-08-14',
    validityEndDateIso: '2026-08-16',
  };
}

function createLogger(): {
  readonly debug: ReturnType<typeof vi.fn>;
  readonly info: ReturnType<typeof vi.fn>;
  readonly warn: ReturnType<typeof vi.fn>;
  readonly error: ReturnType<typeof vi.fn>;
} {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}
