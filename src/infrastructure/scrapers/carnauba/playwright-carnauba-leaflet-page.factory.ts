import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import type {
  CarnaubaLeafletCard,
  CarnaubaLeafletPage,
  CarnaubaLeafletVisualTarget,
  CarnaubaLeafletPageFactory,
  OpenCarnaubaLeafletPageInput,
  OpenedCarnaubaLeaflet,
} from './carnauba-leaflet-page';
import {
  PlaywrightVisualActionTarget,
  PlaywrightVisualDatasetPage,
} from '../../playwright/playwright-visual-dataset-page';

interface RawCarnaubaLeafletCard {
  readonly title: string;
  readonly coverImageUrl: string;
}

export class PlaywrightCarnaubaLeafletPageFactory implements CarnaubaLeafletPageFactory {
  async openPage(input: OpenCarnaubaLeafletPageInput): Promise<CarnaubaLeafletPage> {
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

    return new PlaywrightCarnaubaLeafletPage(browser, context, page, input.timeoutMs);
  }
}

class PlaywrightCarnaubaLeafletPage implements CarnaubaLeafletPage {
  private readonly browser: Browser;

  private readonly context: BrowserContext;

  private readonly page: Page;

  private readonly timeoutMs: number;

  constructor(browser: Browser, context: BrowserContext, page: Page, timeoutMs: number) {
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.timeoutMs = timeoutMs;
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url, {
      timeout: this.timeoutMs,
      waitUntil: 'domcontentloaded',
    });
  }

  async waitForTimeout(timeoutMs: number): Promise<void> {
    await this.page.waitForTimeout(timeoutMs);
  }

  async discoverCards(): Promise<readonly CarnaubaLeafletCard[]> {
    const cards = await this.cardLocator().evaluateAll((elements): RawCarnaubaLeafletCard[] => {
      return elements
        .map((element): RawCarnaubaLeafletCard | null => {
          const image = element.querySelector('img[src*="flipbooks"]');
          const title = image?.getAttribute('alt')?.trim() ?? element.textContent.trim();
          const coverImageUrl = image?.getAttribute('src')?.trim() ?? '';

          if (title.length === 0 || coverImageUrl.length === 0) {
            return null;
          }

          return {
            title,
            coverImageUrl,
          };
        })
        .filter((card): card is RawCarnaubaLeafletCard => card !== null);
    });

    return cards;
  }

  getLeafletsPageVisualTarget(): Promise<CarnaubaLeafletVisualTarget> {
    return Promise.resolve({
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(
        this.leafletsPageButtonLocator(),
        'Carnauba home leaflets button',
        this.timeoutMs,
      ),
    });
  }

  async openLeafletsPage(expectedUrl: string): Promise<void> {
    await Promise.all([
      this.page.waitForURL(expectedUrl, {
        timeout: this.timeoutMs,
        waitUntil: 'domcontentloaded',
      }),
      this.leafletsPageButtonLocator().click({
        timeout: this.timeoutMs,
      }),
    ]);
  }

  getLeafletCardVisualTarget(cardIndex: number): Promise<CarnaubaLeafletVisualTarget> {
    return Promise.resolve({
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(
        this.cardLocator().nth(cardIndex),
        `Carnauba leaflet card ${String(cardIndex + 1)}`,
        this.timeoutMs,
      ),
    });
  }

  async openLeafletAt(cardIndex: number): Promise<OpenedCarnaubaLeaflet> {
    const card = this.cardLocator().nth(cardIndex);
    await card.scrollIntoViewIfNeeded({
      timeout: this.timeoutMs,
    });
    await card.click({
      timeout: this.timeoutMs,
    });

    const modal = this.modalLocator();
    await modal.waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
    await this.page.waitForTimeout(500);

    return {
      title: normalizeText((await modal.locator('.modal-title').first().textContent()) ?? ''),
      imageUrls: await extractModalImageUrls(modal),
    };
  }

  async closeLeafletModal(): Promise<void> {
    const modal = this.modalLocator();
    await modal.locator('button.close, [aria-label="Close"]').first().click({
      timeout: this.timeoutMs,
    });
    await modal.waitFor({
      state: 'hidden',
      timeout: this.timeoutMs,
    });
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  private cardLocator(): Locator {
    return this.page.locator('.flip-card.card').filter({
      has: this.page.locator('img[src*="flipbooks"]'),
    });
  }

  private leafletsPageButtonLocator(): Locator {
    return this.page
      .locator('button:visible, [role="button"]:visible, a:visible')
      .filter({
        hasText: /^\s*Encartes\s*$/,
      })
      .first();
  }

  private modalLocator(): Locator {
    return this.page.locator('.modal.show[role="dialog"]').first();
  }
}

async function extractModalImageUrls(modal: Locator): Promise<readonly string[]> {
  const imageUrls = await modal.evaluate((modalElement): string[] => {
    const urls: string[] = [];

    for (const image of modalElement.querySelectorAll('img')) {
      const source = image.getAttribute('src')?.trim();

      if (source !== undefined && source.length > 0) {
        urls.push(source);
      }
    }

    for (const element of modalElement.querySelectorAll('*')) {
      const backgroundImage = window.getComputedStyle(element).backgroundImage;
      const match = /^url\(["']?(.*?)["']?\)$/.exec(backgroundImage);

      if (match?.[1] !== undefined && match[1].length > 0) {
        urls.push(match[1]);
      }
    }

    return urls;
  });

  return [...new Set(imageUrls)];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
