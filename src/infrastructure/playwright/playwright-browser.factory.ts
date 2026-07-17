import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { CaptureRegion } from '../../domain/visual/capture-region';
import type { VisualBrowserFactory, VisualBrowserPage } from './visual-browser';
import type { VisualViewport } from '../../domain/visual/viewport';

export class PlaywrightBrowserFactory implements VisualBrowserFactory {
  async openPage(input: { readonly viewport: VisualViewport }): Promise<VisualBrowserPage> {
    const browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      deviceScaleFactor: input.viewport.deviceScaleFactor,
      viewport: {
        width: input.viewport.width,
        height: input.viewport.height,
      },
    });

    const page = await context.newPage();
    return new PlaywrightVisualBrowserPage(browser, context, page);
  }
}

class PlaywrightVisualBrowserPage implements VisualBrowserPage {
  private readonly browser: Browser;

  private readonly context: BrowserContext;

  private readonly page: Page;

  constructor(browser: Browser, context: BrowserContext, page: Page) {
    this.browser = browser;
    this.context = context;
    this.page = page;
  }

  async goto(url: string, timeoutMs: number): Promise<void> {
    await this.page.goto(url, {
      timeout: timeoutMs,
      waitUntil: 'domcontentloaded',
    });
  }

  async title(): Promise<string> {
    return this.page.title();
  }

  currentUrl(): string {
    return this.page.url();
  }

  async screenshotPage(fullPage: boolean): Promise<Uint8Array> {
    return this.page.screenshot({
      fullPage,
      type: 'png',
    });
  }

  async screenshotRegion(region: CaptureRegion): Promise<Uint8Array> {
    return this.page.screenshot({
      clip: {
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
      },
      type: 'png',
    });
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }
}
