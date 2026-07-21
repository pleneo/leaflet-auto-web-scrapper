import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { LogContext, Logger } from '../../../application/ports/logger';
import type {
  VisualActionTarget,
  VisualDatasetPage,
} from '../../../application/ports/visual-dataset-page';
import type { CaptureVisualDatasetSampleInput } from '../../../application/services/visual-dataset-capture-service';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type {
  CarnaubaLeafletCard,
  CarnaubaLeafletPage,
  CarnaubaLeafletPageFactory,
  CarnaubaLeafletVisualTarget,
  OpenCarnaubaLeafletPageInput,
  OpenedCarnaubaLeaflet,
} from './carnauba-leaflet-page';
import {
  CarnaubaLeafletExtractionError,
  CarnaubaLeafletExtractor,
} from './carnauba-leaflet-extractor';

describe('CarnaubaLeafletExtractor', () => {
  it('extracts leaflets by opening every discovered card', async () => {
    const page = new FakeCarnaubaLeafletPage({
      cards: [
        {
          title: 'São joão é gol de sabor e tradição',
          coverImageUrl: 'https://cdn.example.com/cover-1.png',
        },
        {
          title: 'Carnaubar!🔥🛒',
          coverImageUrl: 'https://cdn.example.com/cover-2.jpeg',
        },
      ],
      openedLeaflets: [
        {
          title: 'São joão é gol de sabor e tradição',
          imageUrls: ['https://cdn.example.com/page-1.png', 'https://cdn.example.com/page-1.png'],
        },
        {
          title: 'Carnaubar!🔥🛒',
          imageUrls: ['https://cdn.example.com/page-2.jpeg'],
        },
      ],
    });
    const extractor = createExtractor(page);

    const result = await extractor.extract({
      homeUrl: 'https://carnaubasupermercados.com.br/loja/79',
      sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
      viewport: createVisualViewport({
        width: 1366,
        height: 768,
      }),
      timeoutMs: 30_000,
      settleDelayMs: 5_000,
    });

    expect(page.gotoUrls).toEqual(['https://carnaubasupermercados.com.br/loja/79']);
    expect(page.openedLeafletsPageUrls).toEqual([
      'https://carnaubasupermercados.com.br/loja/79/encartes',
    ]);
    expect(page.waitCalls).toEqual([5_000, 5_000]);
    expect(page.openedIndexes).toEqual([0, 1]);
    expect(page.closeModalCalls).toBe(2);
    expect(page.closed).toBe(true);
    expect(result).toEqual({
      supermarketId: 'carnauba',
      sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
      extractedAtIso: '2026-07-17T10:00:00.000Z',
      leaflets: [
        {
          leafletId: '1-sao-joao-e-gol-de-sabor-e-tradicao',
          title: 'São joão é gol de sabor e tradição',
          cardIndex: 0,
          coverImageUrl: 'https://cdn.example.com/cover-1.png',
          images: [
            {
              order: 1,
              imageUrl: 'https://cdn.example.com/page-1.png',
            },
          ],
        },
        {
          leafletId: '2-carnaubar',
          title: 'Carnaubar!🔥🛒',
          cardIndex: 1,
          coverImageUrl: 'https://cdn.example.com/cover-2.jpeg',
          images: [
            {
              order: 1,
              imageUrl: 'https://cdn.example.com/page-2.jpeg',
            },
          ],
        },
      ],
    });
  });

  it('falls back to the card title when the modal title is blank', async () => {
    const page = new FakeCarnaubaLeafletPage({
      cards: [
        {
          title: 'Fallback title',
          coverImageUrl: 'https://cdn.example.com/cover.png',
        },
      ],
      openedLeaflets: [
        {
          title: ' ',
          imageUrls: ['https://cdn.example.com/page.png'],
        },
      ],
    });

    const result = await createExtractor(page).extract({
      homeUrl: 'https://carnaubasupermercados.com.br/loja/79',
      sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
      viewport: createVisualViewport({
        width: 1366,
        height: 768,
      }),
      timeoutMs: 30_000,
      settleDelayMs: 0,
    });

    expect(result.leaflets[0]?.title).toBe('Fallback title');
    expect(result.leaflets[0]?.leafletId).toBe('1-fallback-title');
  });

  it('captures visual dataset samples before opening leaflet cards', async () => {
    const page = new FakeCarnaubaLeafletPage({
      cards: [
        {
          title: 'São João',
          coverImageUrl: 'https://cdn.example.com/cover.png',
        },
      ],
      openedLeaflets: [
        {
          title: 'São João',
          imageUrls: ['https://cdn.example.com/page.png'],
        },
      ],
    });
    const visualDatasetCaptureService = new FakeVisualDatasetCaptureService(page.events);
    const extractor = createExtractor(page, visualDatasetCaptureService);

    await extractor.extract({
      homeUrl: 'https://carnaubasupermercados.com.br/loja/79',
      sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
      viewport: createVisualViewport({
        width: 1366,
        height: 768,
      }),
      timeoutMs: 30_000,
      settleDelayMs: 0,
      visualDataset: {
        runId: 'run-1',
        storeId: 79,
        storeName: 'Maestro',
        split: 'unassigned',
      },
    });

    expect(page.events).toEqual([
      'capture-home',
      'open-leaflets-page',
      'capture-card-0',
      'open-0',
      'capture-image-0-0',
    ]);
    expect(visualDatasetCaptureService.inputs).toHaveLength(3);
    expect(visualDatasetCaptureService.inputs[0]).toMatchObject({
      sampleId: 'run-1-store-79-open-leaflets-page',
      runId: 'run-1',
      supermarketId: 'carnauba',
      stateName: 'ANCHOR_PAGE',
      label: 'open_leaflets_page_button',
      subject: {
        subjectKind: 'carnauba-home-leaflets-link',
        storeId: 79,
        storeName: 'Maestro',
      },
      split: 'unassigned',
    });
    expect(visualDatasetCaptureService.inputs[1]).toMatchObject({
      sampleId: 'run-1-store-79-card-1-sao-joao',
      runId: 'run-1',
      supermarketId: 'carnauba',
      stateName: 'LEAFLETS_PAGE',
      label: 'open_leaflet_modal_button',
      subject: {
        subjectKind: 'carnauba-leaflet-card',
        storeId: 79,
        storeName: 'Maestro',
        cardIndex: 0,
        leafletTitle: 'São João',
      },
      split: 'unassigned',
    });
    expect(visualDatasetCaptureService.inputs[2]).toMatchObject({
      sampleId: 'run-1-store-79-card-1-sao-joao-image-1',
      runId: 'run-1',
      supermarketId: 'carnauba',
      stateName: 'LEAFLET_MODAL',
      label: 'extract_leaflet_image',
      subject: {
        subjectKind: 'carnauba-leaflet-image',
        storeId: 79,
        storeName: 'Maestro',
        cardIndex: 0,
        leafletTitle: 'São João',
        imageIndex: 0,
        imageUrl: 'https://cdn.example.com/page.png',
      },
      split: 'unassigned',
    });
  });

  it('closes the page when extraction fails', async () => {
    const page = new FakeCarnaubaLeafletPage({
      cards: [
        {
          title: 'Leaflet without images',
          coverImageUrl: 'https://cdn.example.com/cover.png',
        },
      ],
      openedLeaflets: [
        {
          title: 'Leaflet without images',
          imageUrls: [],
        },
      ],
    });

    await expect(
      createExtractor(page).extract({
        homeUrl: 'https://carnaubasupermercados.com.br/loja/79',
        sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
        viewport: createVisualViewport({
          width: 1366,
          height: 768,
        }),
        timeoutMs: 30_000,
        settleDelayMs: 5_000,
      }),
    ).rejects.toThrow(CarnaubaLeafletExtractionError);

    expect(page.closed).toBe(true);
  });

  it('rejects invalid extraction input before opening a page', async () => {
    const factory = new FakeCarnaubaLeafletPageFactory(new FakeCarnaubaLeafletPage());
    const extractor = new CarnaubaLeafletExtractor(factory, new FixedClock(), new MemoryLogger());
    const viewport = createVisualViewport({
      width: 1366,
      height: 768,
    });

    await expect(
      extractor.extract({
        homeUrl: 'invalid-url',
        sourceUrl: 'invalid-url',
        viewport,
        timeoutMs: 30_000,
        settleDelayMs: 5_000,
      }),
    ).rejects.toThrow(CarnaubaLeafletExtractionError);

    await expect(
      extractor.extract({
        homeUrl: 'https://example.com',
        sourceUrl: 'https://example.com',
        viewport,
        timeoutMs: 0,
        settleDelayMs: 5_000,
      }),
    ).rejects.toThrow(CarnaubaLeafletExtractionError);

    await expect(
      extractor.extract({
        homeUrl: 'https://example.com',
        sourceUrl: 'https://example.com',
        viewport,
        timeoutMs: 30_000,
        settleDelayMs: -1,
      }),
    ).rejects.toThrow(CarnaubaLeafletExtractionError);

    expect(factory.openPageCalls).toBe(0);
  });
});

function createExtractor(
  page: FakeCarnaubaLeafletPage,
  visualDatasetCaptureService?: FakeVisualDatasetCaptureService,
): CarnaubaLeafletExtractor {
  return new CarnaubaLeafletExtractor(
    new FakeCarnaubaLeafletPageFactory(page),
    new FixedClock(),
    new MemoryLogger(),
    visualDatasetCaptureService,
  );
}

class FakeCarnaubaLeafletPageFactory implements CarnaubaLeafletPageFactory {
  openPageCalls = 0;

  private readonly page: CarnaubaLeafletPage;

  constructor(page: CarnaubaLeafletPage) {
    this.page = page;
  }

  openPage(input: OpenCarnaubaLeafletPageInput): Promise<CarnaubaLeafletPage> {
    this.openPageCalls += 1;
    input.viewport.width.toString();
    return Promise.resolve(this.page);
  }
}

interface FakeCarnaubaLeafletPageConfig {
  readonly cards?: readonly CarnaubaLeafletCard[];
  readonly openedLeaflets?: readonly OpenedCarnaubaLeaflet[];
}

class FakeCarnaubaLeafletPage implements CarnaubaLeafletPage {
  readonly events: string[] = [];

  readonly gotoUrls: string[] = [];

  readonly waitCalls: number[] = [];

  readonly openedLeafletsPageUrls: string[] = [];

  readonly openedIndexes: number[] = [];

  closeModalCalls = 0;

  closed = false;

  private readonly cards: readonly CarnaubaLeafletCard[];

  private readonly openedLeaflets: readonly OpenedCarnaubaLeaflet[];

  constructor(config: FakeCarnaubaLeafletPageConfig = {}) {
    this.cards = config.cards ?? [];
    this.openedLeaflets = config.openedLeaflets ?? [];
  }

  goto(url: string): Promise<void> {
    this.gotoUrls.push(url);
    return Promise.resolve();
  }

  waitForTimeout(timeoutMs: number): Promise<void> {
    this.waitCalls.push(timeoutMs);
    return Promise.resolve();
  }

  discoverCards(): Promise<readonly CarnaubaLeafletCard[]> {
    return Promise.resolve(this.cards);
  }

  getLeafletsPageVisualTarget(): Promise<CarnaubaLeafletVisualTarget> {
    return Promise.resolve({
      page: new FakeVisualDatasetPage(),
      target: new FakeVisualActionTarget('home'),
    });
  }

  openLeafletsPage(expectedUrl: string): Promise<void> {
    this.events.push('open-leaflets-page');
    this.openedLeafletsPageUrls.push(expectedUrl);
    return Promise.resolve();
  }

  getLeafletCardVisualTarget(cardIndex: number): Promise<CarnaubaLeafletVisualTarget> {
    return Promise.resolve({
      page: new FakeVisualDatasetPage(),
      target: new FakeVisualActionTarget(cardIndex),
    });
  }

  openLeafletAt(cardIndex: number): Promise<OpenedCarnaubaLeaflet> {
    this.events.push(`open-${String(cardIndex)}`);
    this.openedIndexes.push(cardIndex);
    const openedLeaflet = this.openedLeaflets[cardIndex];

    if (openedLeaflet === undefined) {
      return Promise.reject(new Error('Missing fake opened leaflet.'));
    }

    return Promise.resolve(openedLeaflet);
  }

  getLeafletModalImageVisualTarget(): Promise<CarnaubaLeafletVisualTarget> {
    return Promise.resolve({
      page: new FakeVisualDatasetPage(),
      target: new FakeVisualActionTarget('modal-image'),
    });
  }

  closeLeafletModal(): Promise<void> {
    this.closeModalCalls += 1;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

class FakeVisualDatasetPage implements VisualDatasetPage {
  captureFullPageSnapshot(): never {
    throw new Error('Fake capture service should not call the page.');
  }
}

class FakeVisualActionTarget implements VisualActionTarget {
  readonly locatorDescription: string;

  constructor(target: number | 'home' | 'modal-image') {
    if (target === 'home') {
      this.locatorDescription = 'home-leaflets';
      return;
    }

    if (target === 'modal-image') {
      this.locatorDescription = 'modal-image';
      return;
    }

    this.locatorDescription = `card-${String(target)}`;
  }

  scrollIntoView(): never {
    throw new Error('Fake capture service should not call the target.');
  }

  isVisible(): never {
    throw new Error('Fake capture service should not call the target.');
  }

  isEnabled(): never {
    throw new Error('Fake capture service should not call the target.');
  }

  getViewportBoundingBox(): never {
    throw new Error('Fake capture service should not call the target.');
  }
}

class FakeVisualDatasetCaptureService {
  readonly inputs: CaptureVisualDatasetSampleInput[] = [];

  private readonly events: string[];

  constructor(events: string[]) {
    this.events = events;
  }

  captureBeforeAction(input: CaptureVisualDatasetSampleInput): Promise<never> {
    this.events.push(createCaptureEventName(input.subject));
    this.inputs.push(input);
    return Promise.resolve(undefined as never);
  }
}

function createCaptureEventName(subject: CaptureVisualDatasetSampleInput['subject']): string {
  switch (subject.subjectKind) {
    case 'carnauba-home-leaflets-link':
      return 'capture-home';
    case 'carnauba-leaflet-card':
      return `capture-card-${String(subject.cardIndex)}`;
    case 'carnauba-leaflet-image':
      return `capture-image-${String(subject.cardIndex)}-${String(subject.imageIndex)}`;
  }
}

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-07-17T10:00:00.000Z';
  }
}

class MemoryLogger implements Logger {
  readonly entries: string[] = [];

  debug(message: string, context?: LogContext): void {
    this.write(message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write(message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write(message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write(message, context);
  }

  private write(message: string, context?: LogContext): void {
    this.entries.push(`${message}:${context === undefined ? 'no-context' : 'with-context'}`);
  }
}
