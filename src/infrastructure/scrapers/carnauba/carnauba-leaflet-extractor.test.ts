import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { LogContext, Logger } from '../../../application/ports/logger';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type {
  CarnaubaLeafletCard,
  CarnaubaLeafletPage,
  CarnaubaLeafletPageFactory,
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
      sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
      viewport: createVisualViewport({
        width: 1366,
        height: 768,
      }),
      timeoutMs: 30_000,
      settleDelayMs: 5_000,
    });

    expect(page.gotoUrls).toEqual(['https://carnaubasupermercados.com.br/loja/79/encartes']);
    expect(page.waitCalls).toEqual([5_000]);
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
        sourceUrl: 'invalid-url',
        viewport,
        timeoutMs: 30_000,
        settleDelayMs: 5_000,
      }),
    ).rejects.toThrow(CarnaubaLeafletExtractionError);

    await expect(
      extractor.extract({
        sourceUrl: 'https://example.com',
        viewport,
        timeoutMs: 0,
        settleDelayMs: 5_000,
      }),
    ).rejects.toThrow(CarnaubaLeafletExtractionError);

    await expect(
      extractor.extract({
        sourceUrl: 'https://example.com',
        viewport,
        timeoutMs: 30_000,
        settleDelayMs: -1,
      }),
    ).rejects.toThrow(CarnaubaLeafletExtractionError);

    expect(factory.openPageCalls).toBe(0);
  });
});

function createExtractor(page: FakeCarnaubaLeafletPage): CarnaubaLeafletExtractor {
  return new CarnaubaLeafletExtractor(
    new FakeCarnaubaLeafletPageFactory(page),
    new FixedClock(),
    new MemoryLogger(),
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
  readonly gotoUrls: string[] = [];

  readonly waitCalls: number[] = [];

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

  openLeafletAt(cardIndex: number): Promise<OpenedCarnaubaLeaflet> {
    this.openedIndexes.push(cardIndex);
    const openedLeaflet = this.openedLeaflets[cardIndex];

    if (openedLeaflet === undefined) {
      return Promise.reject(new Error('Missing fake opened leaflet.'));
    }

    return Promise.resolve(openedLeaflet);
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
