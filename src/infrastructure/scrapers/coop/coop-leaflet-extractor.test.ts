import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type { Clock } from '../../../application/ports/clock';
import type { CaptureVisualDatasetSampleInput } from '../../../application/services/visual-dataset-capture-service';
import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { VisualDatasetSample } from '../../../domain/dataset/visual-dataset-sample';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type { CoopLeafletCard } from './coop-image-gallery-leaflet';
import {
  CoopLeafletExtractionError,
  CoopLeafletExtractor,
  createDefaultCoopLeafletExtractionInput,
  type ExtractCoopLeafletsInput,
} from './coop-leaflet-extractor';
import type {
  CoopLeafletMagazinePage,
  CoopLeafletPage,
  CoopLeafletPageFactory,
  CoopLeafletVisualTarget,
} from './coop-leaflet-page';
import { listCoopMonitoredStores, type CoopMonitoredStore } from './coop-targets';

describe('CoopLeafletExtractor', () => {
  it('extracts direct store pages and captures visual dataset samples before actions', async () => {
    const store = getStore('coop-super-agua-verde');
    const page = new FakeCoopPage({
      [store.storeSlug]: {
        cards: [createCard()],
        imageUrls: ['https://www.cooper.coop.br/revista/imagens/5010/1.jpg'],
      },
    });
    const capture = new FakeVisualDatasetCaptureService();
    const extractor = createExtractor(page, capture);

    const result = await extractor.extract({
      ...createInput([store]),
      visualDataset: {
        runId: 'run-1',
        split: 'unassigned',
      },
    });

    expect(result).toEqual({
      source: 'coop-playwright-direct',
      extractedAtIso: '2026-08-13T10:00:00.000Z',
      units: [
        {
          unitId: 'coop-super-agua-verde',
          unitName: 'Cooper Super Agua Verde',
          sourceUrl: 'https://www.cooper.coop.br/ofertas/blumenau/agua-verde',
          leaflets: [
            {
              leafletId: 'coop-agua',
              title: 'Agua Verde semanal',
              sourcePageUrl: 'https://www.cooper.coop.br/revista/?id=agua',
              coverImageUrl: 'https://www.cooper.coop.br/revista/imagens/5010/1.jpg',
              imageUrls: ['https://www.cooper.coop.br/revista/imagens/5010/1.jpg'],
              validUntilIso: null,
            },
          ],
        },
      ],
      failedUnits: [],
    });
    expect(page.visitedUrls).toEqual(['https://www.cooper.coop.br/ofertas/blumenau/agua-verde']);
    expect(page.closed).toBe(true);
    expect(capture.inputs.map((input) => input.subject.subjectKind)).toEqual([
      'coop-leaflet-card',
      'coop-leaflet-image',
    ]);
    expect(capture.inputs[0]).toMatchObject({
      sampleId: 'run-1-coop-coop-super-agua-verde-card-1',
      supermarketId: 'coop',
      stateName: 'LEAFLETS_PAGE',
      label: 'open_leaflet_modal_button',
    });
  });

  it('preserves successful stores when another direct store fails', async () => {
    const successStore = getStore('coop-super-agua-verde');
    const failedStore = getStore('coop-atacarejo-boa-vista');
    const page = new FakeCoopPage({
      [successStore.storeSlug]: {
        cards: [createCard()],
        imageUrls: ['https://www.cooper.coop.br/revista/imagens/5010/1.jpg'],
      },
      [failedStore.storeSlug]: {
        cards: [],
        imageUrls: [],
      },
    });
    const extractor = createExtractor(page);

    const result = await extractor.extract(createInput([successStore, failedStore]));

    expect(result.units).toHaveLength(1);
    expect(result.failedUnits).toEqual([
      {
        unitId: 'coop-atacarejo-boa-vista',
        unitName: 'Cooper Atacarejo Boa Vista',
        sourceUrl: 'https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
        errorMessage:
          'Coop store page did not expose leaflet cards: https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
      },
    ]);
  });

  it('fails a store when a magazine page exposes no images and still closes it', async () => {
    const store = getStore('coop-super-agua-verde');
    const page = new FakeCoopPage({
      [store.storeSlug]: {
        cards: [createCard()],
        imageUrls: [],
      },
    });
    const extractor = createExtractor(page);

    const result = await extractor.extract(createInput([store]));

    expect(result.units).toEqual([]);
    expect(result.failedUnits[0]?.errorMessage).toBe(
      'Coop leaflet page did not expose images: https://www.cooper.coop.br/revista/?id=agua',
    );
    expect(page.magazinePages[0]?.closed).toBe(true);
  });

  it('validates direct extraction input and creates default input', async () => {
    const extractor = createExtractor(new FakeCoopPage({}));
    const defaultInput = createDefaultCoopLeafletExtractionInput(
      createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
      30_000,
      1_000,
    );

    expect(defaultInput.monitoredStores).toEqual(listCoopMonitoredStores());
    await expect(
      extractor.extract({
        ...defaultInput,
        monitoredStores: [],
      }),
    ).rejects.toThrow('monitoredStores cannot be empty.');
    await expect(
      extractor.extract({
        ...defaultInput,
        timeoutMs: 0,
      }),
    ).rejects.toThrow('timeoutMs must be positive.');
    expect(new CoopLeafletExtractionError('x').name).toBe('CoopLeafletExtractionError');
  });
});

function createExtractor(
  page: FakeCoopPage,
  captureService?: FakeVisualDatasetCaptureService,
): CoopLeafletExtractor {
  return new CoopLeafletExtractor(
    new FakeCoopPageFactory(page),
    fixedClock('2026-08-13T10:00:00.000Z'),
    createLogger(),
    captureService,
  );
}

function createInput(monitoredStores: readonly CoopMonitoredStore[]): ExtractCoopLeafletsInput {
  return {
    startUrlMode: 'store-page',
    monitoredStores,
    viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
    timeoutMs: 30_000,
    settleDelayMs: 0,
  };
}

function createCard(): CoopLeafletCard {
  return {
    leafletId: 'coop-agua',
    title: 'Agua Verde semanal',
    href: 'https://www.cooper.coop.br/revista/?id=agua',
    sourcePageUrl: 'https://www.cooper.coop.br/ofertas/blumenau/agua-verde',
    validUntilIso: null,
    cardIndex: 0,
  };
}

function getStore(storeSlug: CoopMonitoredStore['storeSlug']): CoopMonitoredStore {
  const store = listCoopMonitoredStores().find((candidate) => candidate.storeSlug === storeSlug);

  if (store === undefined) {
    throw new Error(`Missing test store: ${storeSlug}`);
  }

  return store;
}

function fixedClock(value: string): Clock {
  return {
    nowIso: () => value,
  };
}

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

interface StoreScenario {
  readonly cards: readonly CoopLeafletCard[];
  readonly imageUrls: readonly string[];
}

class FakeCoopPageFactory implements CoopLeafletPageFactory {
  private readonly page: FakeCoopPage;

  constructor(page: FakeCoopPage) {
    this.page = page;
  }

  openPage(): Promise<CoopLeafletPage> {
    return Promise.resolve(this.page);
  }
}

class FakeCoopPage implements CoopLeafletPage {
  readonly visitedUrls: string[] = [];

  readonly magazinePages: FakeCoopMagazinePage[] = [];

  closed = false;

  private readonly scenarios: Readonly<Record<string, StoreScenario>>;

  private currentStoreSlug: string | null = null;

  constructor(scenarios: Readonly<Record<string, StoreScenario>>) {
    this.scenarios = scenarios;
  }

  goto(url: string): Promise<void> {
    this.visitedUrls.push(url);
    this.currentStoreSlug =
      listCoopMonitoredStores().find((store) => store.finalPageUrl === url)?.storeSlug ?? null;
    return Promise.resolve();
  }

  gotoHome(): Promise<void> {
    return Promise.resolve();
  }

  waitForTimeout(): Promise<void> {
    return Promise.resolve();
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(this.visitedUrls.at(-1) ?? '');
  }

  waitForHomePage(): Promise<void> {
    return Promise.resolve();
  }

  waitForOffersPage(): Promise<void> {
    return Promise.resolve();
  }

  waitForStoreOffersPage(): Promise<void> {
    return Promise.resolve();
  }

  getHomeOffersVisualTarget(): Promise<CoopLeafletVisualTarget> {
    return Promise.resolve(createVisualTarget());
  }

  openHomeOffersPage(): Promise<void> {
    return Promise.resolve();
  }

  getStoreLinkVisualTarget(): Promise<CoopLeafletVisualTarget> {
    return Promise.resolve(createVisualTarget());
  }

  openStore(): Promise<void> {
    return Promise.resolve();
  }

  listLeafletCards(): Promise<readonly CoopLeafletCard[]> {
    return Promise.resolve(this.getCurrentScenario().cards);
  }

  getLeafletCardVisualTarget(): Promise<CoopLeafletVisualTarget> {
    return Promise.resolve(createVisualTarget());
  }

  openLeafletCardInNewPage(): Promise<CoopLeafletMagazinePage> {
    const magazinePage = new FakeCoopMagazinePage(this.getCurrentScenario().imageUrls);
    this.magazinePages.push(magazinePage);
    return Promise.resolve(magazinePage);
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  private getCurrentScenario(): StoreScenario {
    const scenario =
      this.currentStoreSlug === null ? undefined : this.scenarios[this.currentStoreSlug];

    if (scenario === undefined) {
      throw new Error('Missing store scenario.');
    }

    return scenario;
  }
}

class FakeCoopMagazinePage implements CoopLeafletMagazinePage {
  closed = false;

  private readonly imageUrls: readonly string[];

  constructor(imageUrls: readonly string[]) {
    this.imageUrls = imageUrls;
  }

  waitForImageGallery(): Promise<void> {
    return Promise.resolve();
  }

  listLeafletImageUrls(): Promise<readonly string[]> {
    return Promise.resolve(this.imageUrls);
  }

  getLeafletImageVisualTarget(): Promise<CoopLeafletVisualTarget> {
    return Promise.resolve(createVisualTarget());
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve('https://www.cooper.coop.br/revista/?id=agua');
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

class FakeVisualDatasetCaptureService {
  readonly inputs: CaptureVisualDatasetSampleInput[] = [];

  captureBeforeAction(input: CaptureVisualDatasetSampleInput): Promise<VisualDatasetSample> {
    this.inputs.push(input);
    return Promise.resolve({} as VisualDatasetSample);
  }
}

function createVisualTarget(): CoopLeafletVisualTarget {
  return {
    page: {} as VisualDatasetPage,
    target: {} as VisualActionTarget,
  };
}
