import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCaptureRegion } from '../../domain/visual/capture-region';
import { createVisualViewport } from '../../domain/visual/viewport';
import { PlaywrightBrowserFactory } from './playwright-browser.factory';

interface LaunchOptions {
  readonly headless: boolean;
}

interface ViewportOptions {
  readonly width: number;
  readonly height: number;
}

interface ContextOptions {
  readonly deviceScaleFactor: number;
  readonly viewport: ViewportOptions;
}

interface GotoOptions {
  readonly timeout: number;
  readonly waitUntil: 'domcontentloaded';
}

interface ScreenshotClip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ScreenshotOptions {
  readonly fullPage?: boolean;
  readonly clip?: ScreenshotClip;
  readonly type: 'png';
}

const playwrightMocks = vi.hoisted(() => {
  const launchOptions: LaunchOptions[] = [];
  const contextOptions: ContextOptions[] = [];
  const gotoCalls: { readonly url: string; readonly options: GotoOptions }[] = [];
  const screenshotCalls: ScreenshotOptions[] = [];
  const closeCalls: string[] = [];

  return {
    closeCalls,
    contextOptions,
    gotoCalls,
    launch: vi.fn((options: LaunchOptions) => {
      launchOptions.push(options);

      return Promise.resolve({
        close: () => {
          closeCalls.push('browser');
          return Promise.resolve();
        },
        newContext: (context: ContextOptions) => {
          contextOptions.push(context);

          return Promise.resolve({
            close: () => {
              closeCalls.push('context');
              return Promise.resolve();
            },
            newPage: () =>
              Promise.resolve({
                goto: (url: string, options: GotoOptions) => {
                  gotoCalls.push({
                    url,
                    options,
                  });
                  return Promise.resolve();
                },
                screenshot: (options: ScreenshotOptions) => {
                  screenshotCalls.push(options);
                  return Promise.resolve(Uint8Array.of(1, 2, 3));
                },
                title: () => Promise.resolve('Leaflet page'),
                url: () => 'https://example.com/final',
              }),
          });
        },
      });
    }),
    launchOptions,
    screenshotCalls,
  };
});

vi.mock('playwright', () => ({
  chromium: {
    launch: playwrightMocks.launch,
  },
}));

describe('PlaywrightBrowserFactory', () => {
  beforeEach(() => {
    playwrightMocks.launch.mockClear();
    playwrightMocks.launchOptions.length = 0;
    playwrightMocks.contextOptions.length = 0;
    playwrightMocks.gotoCalls.length = 0;
    playwrightMocks.screenshotCalls.length = 0;
    playwrightMocks.closeCalls.length = 0;
  });

  it('opens a headless page with the requested viewport', async () => {
    const factory = new PlaywrightBrowserFactory();

    await factory.openPage({
      viewport: createVisualViewport({
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
      }),
    });

    expect(playwrightMocks.launchOptions).toEqual([
      {
        headless: true,
      },
    ]);
    expect(playwrightMocks.contextOptions).toEqual([
      {
        deviceScaleFactor: 3,
        viewport: {
          width: 390,
          height: 844,
        },
      },
    ]);
  });

  it('proxies page navigation, screenshots, metadata, and close', async () => {
    const factory = new PlaywrightBrowserFactory();
    const page = await factory.openPage({
      viewport: createVisualViewport({
        width: 1366,
        height: 768,
      }),
    });

    await page.goto('https://example.com', 5_000);
    const pageScreenshot = await page.screenshotPage(true);
    const regionScreenshot = await page.screenshotRegion(
      createCaptureRegion({
        x: 10,
        y: 20,
        width: 300,
        height: 150,
      }),
    );
    const title = await page.title();
    const url = page.currentUrl();
    await page.close();

    expect(playwrightMocks.gotoCalls).toEqual([
      {
        url: 'https://example.com',
        options: {
          timeout: 5_000,
          waitUntil: 'domcontentloaded',
        },
      },
    ]);
    expect(playwrightMocks.screenshotCalls).toEqual([
      {
        fullPage: true,
        type: 'png',
      },
      {
        clip: {
          x: 10,
          y: 20,
          width: 300,
          height: 150,
        },
        type: 'png',
      },
    ]);
    expect(pageScreenshot).toEqual(Uint8Array.of(1, 2, 3));
    expect(regionScreenshot).toEqual(Uint8Array.of(1, 2, 3));
    expect(title).toBe('Leaflet page');
    expect(url).toBe('https://example.com/final');
    expect(playwrightMocks.closeCalls).toEqual(['context', 'browser']);
  });
});
