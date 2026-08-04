import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import {
  PlaywrightVisualActionTarget,
  PlaywrightVisualDatasetPage,
} from '../../playwright/playwright-visual-dataset-page';
import type {
  AtacadaoLeafletCard,
  AtacadaoLeafletPage,
  AtacadaoLeafletPageFactory,
  AtacadaoLeafletVisualTarget,
  OpenAtacadaoLeafletPageInput,
} from './atacadao-leaflet-page';
import type { AtacadaoMonitoredStore } from './atacadao-targets';

interface RawAtacadaoLeafletCard {
  readonly title: string;
  readonly cardIndex: number;
  readonly pdfUrl: string;
  readonly validityText: string | null;
}

export class PlaywrightAtacadaoLeafletPageFactory implements AtacadaoLeafletPageFactory {
  async openPage(input: OpenAtacadaoLeafletPageInput): Promise<AtacadaoLeafletPage> {
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
    await context.route('**/*', async (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();

      if (
        resourceType === 'media' ||
        url.includes('googletagmanager.com') ||
        url.includes('google-analytics.com') ||
        url.includes('facebook.net') ||
        url.includes('facebook.com/tr') ||
        url.includes('hotjar.com')
      ) {
        await route.abort();
        return;
      }

      await route.continue();
    });
    const page = await context.newPage();

    return new PlaywrightAtacadaoLeafletPage(browser, context, page, input.timeoutMs);
  }
}

class PlaywrightAtacadaoLeafletPage implements AtacadaoLeafletPage {
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
    await this.page
      .waitForLoadState('networkidle', {
        timeout: this.timeoutMs,
      })
      .catch(() => undefined);
  }

  async waitForTimeout(timeoutMs: number): Promise<void> {
    await this.page.waitForTimeout(timeoutMs);
  }

  async dismissCookieBanner(): Promise<void> {
    const consentButton = this.page
      .getByRole('button', {
        name: /aceitar todos|aceitar|entendi|ok/i,
      })
      .first();

    if (await consentButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await consentButton.click({
        timeout: this.timeoutMs,
      });
    }
  }

  async waitForStoreLeaflets(store: AtacadaoMonitoredStore): Promise<void> {
    await this.page
      .waitForURL(new RegExp(`/loja/${escapeRegExp(store.storeSlug)}/*$`), {
        timeout: this.timeoutMs,
        waitUntil: 'domcontentloaded',
      })
      .catch(() => undefined);
    await this.leafletSectionLocator().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
    await this.flyerLinkLocator().first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  async hasMoreLeaflets(): Promise<boolean> {
    return this.showMoreLeafletsButtonLocator()
      .isVisible({
        timeout: 1_000,
      })
      .catch(() => false);
  }

  getShowMoreLeafletsVisualTarget(): Promise<AtacadaoLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(
        this.showMoreLeafletsButtonLocator(),
        'Atacadao show more leaflets button',
      ),
    );
  }

  async showMoreLeaflets(): Promise<void> {
    await this.showMoreLeafletsButtonLocator().click({
      timeout: this.timeoutMs,
    });
  }

  async discoverCards(): Promise<readonly AtacadaoLeafletCard[]> {
    const rawCards = await this.flyerLinkLocator().evaluateAll(
      (elements): RawAtacadaoLeafletCard[] => {
        const seenUrls = new Set<string>();
        const cards: RawAtacadaoLeafletCard[] = [];

        for (const element of elements) {
          const link = element instanceof HTMLAnchorElement ? element : null;

          if (link === null) {
            continue;
          }

          const style = window.getComputedStyle(link);
          const box = link.getBoundingClientRect();
          const isVisible =
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity) !== 0 &&
            box.width > 0 &&
            box.height > 0;

          if (!isVisible) {
            continue;
          }

          const pdfUrl = link.href.trim();

          if (pdfUrl.length === 0 || seenUrls.has(pdfUrl)) {
            continue;
          }

          const title =
            link.getAttribute('title')?.trim() ??
            link.querySelector('img')?.getAttribute('alt')?.trim() ??
            'Leaflet';
          const article = link.closest('article');
          const text = article === null ? '' : article.textContent.replace(/\s+/g, ' ').trim();
          const validityMatch = /De\s+\d{1,2}\/\d{1,2}\s+até\s+\d{1,2}\/\d{1,2}/i.exec(text);

          seenUrls.add(pdfUrl);
          cards.push({
            title,
            cardIndex: cards.length,
            pdfUrl,
            validityText: validityMatch?.[0] ?? null,
          });
        }

        return cards;
      },
    );

    return rawCards;
  }

  getLeafletCardVisualTarget(cardIndex: number): Promise<AtacadaoLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(
        this.flyerLinkLocator().nth(cardIndex),
        `Atacadao leaflet card ${String(cardIndex + 1)}`,
      ),
    );
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  private leafletSectionLocator(): Locator {
    return this.page
      .locator('section, main, div')
      .filter({
        hasText: /Folhetos de ofertas/i,
      })
      .first();
  }

  private flyerLinkLocator(): Locator {
    return this.page.locator('a[href*="/api/v2/Flyer/"][href*="id="]:visible').filter({
      has: this.page.locator('img'),
    });
  }

  private showMoreLeafletsButtonLocator(): Locator {
    return this.page
      .getByRole('button', {
        name: /mostrar mais folhetos/i,
      })
      .first();
  }

  private createVisualTarget(locator: Locator, description: string): AtacadaoLeafletVisualTarget {
    return {
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(locator, description, this.timeoutMs),
    };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
