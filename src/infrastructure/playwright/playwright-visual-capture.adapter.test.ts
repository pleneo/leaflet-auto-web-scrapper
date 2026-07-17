import { describe, expect, it } from 'vitest';
import type { Clock } from '../../application/ports/clock';
import type { LogContext, Logger } from '../../application/ports/logger';
import { createCaptureRegion } from '../../domain/visual/capture-region';
import { createVisualViewport } from '../../domain/visual/viewport';
import type {
  OpenVisualBrowserPageRequest,
  VisualBrowserFactory,
  VisualBrowserPage,
} from './visual-browser';
import {
  InvalidVisualCaptureRequestError,
  PlaywrightVisualCaptureAdapter,
} from './playwright-visual-capture.adapter';

describe('PlaywrightVisualCaptureAdapter', () => {
  it('captures a full page screenshot with metadata', async () => {
    const page = new FakeVisualBrowserPage();
    const adapter = createAdapter(page);
    const viewport = createVisualViewport({
      width: 1366,
      height: 768,
    });

    const result = await adapter.capturePage({
      captureId: 'capture-1',
      url: 'https://example.com/promotions',
      viewport,
      fullPage: true,
      timeoutMs: 5_000,
    });

    expect(page.gotoCalls).toEqual([
      {
        url: 'https://example.com/promotions',
        timeoutMs: 5_000,
      },
    ]);
    expect(page.closed).toBe(true);
    expect(result.screenshotPng).toEqual(Uint8Array.of(1, 2, 3));
    expect(result.metadata).toEqual({
      captureId: 'capture-1',
      kind: 'page',
      sourceUrl: 'https://example.com/promotions',
      finalUrl: 'https://example.com/final',
      title: 'Leaflet page',
      capturedAtIso: '2026-07-17T10:00:00.000Z',
      viewport,
      fullPage: true,
      mimeType: 'image/png',
      byteLength: 3,
    });
  });

  it('captures a region screenshot with region metadata', async () => {
    const page = new FakeVisualBrowserPage();
    const adapter = createAdapter(page);
    const viewport = createVisualViewport({
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
    });
    const region = createCaptureRegion({
      x: 10,
      y: 20,
      width: 300,
      height: 150,
    });

    const result = await adapter.captureRegion({
      captureId: 'capture-2',
      url: 'https://example.com/leaflet',
      viewport,
      region,
      timeoutMs: 5_000,
    });

    expect(page.regionScreenshots).toEqual([region]);
    expect(page.closed).toBe(true);
    expect(result.metadata).toEqual({
      captureId: 'capture-2',
      kind: 'region',
      sourceUrl: 'https://example.com/leaflet',
      finalUrl: 'https://example.com/final',
      title: 'Leaflet page',
      capturedAtIso: '2026-07-17T10:00:00.000Z',
      viewport,
      fullPage: false,
      mimeType: 'image/png',
      byteLength: 2,
      region,
    });
  });

  it('closes the page when navigation fails', async () => {
    const page = new FakeVisualBrowserPage();
    page.failNavigation = true;
    const adapter = createAdapter(page);

    await expect(
      adapter.capturePage({
        captureId: 'capture-3',
        url: 'https://example.com',
        viewport: createVisualViewport({
          width: 1366,
          height: 768,
        }),
        fullPage: true,
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow(Error);

    expect(page.closed).toBe(true);
  });

  it('rejects invalid requests before opening the browser', async () => {
    const factory = new FakeVisualBrowserFactory(new FakeVisualBrowserPage());
    const adapter = new PlaywrightVisualCaptureAdapter(
      factory,
      new FixedClock(),
      new MemoryLogger(),
    );
    const viewport = createVisualViewport({
      width: 1366,
      height: 768,
    });

    await expect(
      adapter.capturePage({
        captureId: ' ',
        url: 'https://example.com',
        viewport,
        fullPage: true,
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow(InvalidVisualCaptureRequestError);

    await expect(
      adapter.capturePage({
        captureId: 'capture-4',
        url: 'invalid-url',
        viewport,
        fullPage: true,
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow(InvalidVisualCaptureRequestError);

    await expect(
      adapter.capturePage({
        captureId: 'capture-5',
        url: 'https://example.com',
        viewport,
        fullPage: true,
        timeoutMs: Number.NaN,
      }),
    ).rejects.toThrow(InvalidVisualCaptureRequestError);

    await expect(
      adapter.capturePage({
        captureId: 'capture-6',
        url: 'https://example.com',
        viewport,
        fullPage: true,
        timeoutMs: 0,
      }),
    ).rejects.toThrow(InvalidVisualCaptureRequestError);

    expect(factory.openPageCalls).toBe(0);
  });
});

function createAdapter(page: FakeVisualBrowserPage): PlaywrightVisualCaptureAdapter {
  return new PlaywrightVisualCaptureAdapter(
    new FakeVisualBrowserFactory(page),
    new FixedClock(),
    new MemoryLogger(),
  );
}

class FakeVisualBrowserFactory implements VisualBrowserFactory {
  openPageCalls = 0;

  readonly openedViewports: OpenVisualBrowserPageRequest[] = [];

  private readonly page: VisualBrowserPage;

  constructor(page: VisualBrowserPage) {
    this.page = page;
  }

  openPage(input: OpenVisualBrowserPageRequest): Promise<VisualBrowserPage> {
    this.openPageCalls += 1;
    this.openedViewports.push(input);
    return Promise.resolve(this.page);
  }
}

interface GotoCall {
  readonly url: string;
  readonly timeoutMs: number;
}

class FakeVisualBrowserPage implements VisualBrowserPage {
  readonly gotoCalls: GotoCall[] = [];

  readonly pageScreenshots: boolean[] = [];

  readonly regionScreenshots: ReturnType<typeof createCaptureRegion>[] = [];

  failNavigation = false;

  closed = false;

  goto(url: string, timeoutMs: number): Promise<void> {
    this.gotoCalls.push({
      url,
      timeoutMs,
    });

    if (this.failNavigation) {
      return Promise.reject(new Error('Navigation failed.'));
    }

    return Promise.resolve();
  }

  title(): Promise<string> {
    return Promise.resolve('Leaflet page');
  }

  currentUrl(): string {
    return 'https://example.com/final';
  }

  screenshotPage(fullPage: boolean): Promise<Uint8Array> {
    this.pageScreenshots.push(fullPage);
    return Promise.resolve(Uint8Array.of(1, 2, 3));
  }

  screenshotRegion(region: ReturnType<typeof createCaptureRegion>): Promise<Uint8Array> {
    this.regionScreenshots.push(region);
    return Promise.resolve(Uint8Array.of(4, 5));
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
