import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import {
  PlaywrightVisualActionTarget,
  PlaywrightVisualDatasetPage,
} from '../../playwright/playwright-visual-dataset-page';
import {
  parseComboAtacadistaLeafletCards,
  parseComboAtacadistaLeafletImageUrls,
} from './combo-atacadista-api-client';
import type { ComboAtacadistaLeafletCard } from './combo-atacadista-image-gallery-leaflet';
import type {
  ComboAtacadistaLeafletPage,
  ComboAtacadistaLeafletPageFactory,
  ComboAtacadistaLeafletVisualTarget,
  OpenComboAtacadistaLeafletPageInput,
} from './combo-atacadista-leaflet-page';
import { COMBO_ATACADISTA_HOME_URL } from './combo-atacadista-targets';

const COMBO_ATACADISTA_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

export class PlaywrightComboAtacadistaLeafletPageFactory implements ComboAtacadistaLeafletPageFactory {
  async openPage(input: OpenComboAtacadistaLeafletPageInput): Promise<ComboAtacadistaLeafletPage> {
    const browser = await chromium.launch({
      headless: true,
    });
    const context = await browser.newContext({
      deviceScaleFactor: input.viewport.deviceScaleFactor,
      locale: 'pt-BR',
      userAgent: COMBO_ATACADISTA_USER_AGENT,
      viewport: {
        width: input.viewport.width,
        height: input.viewport.height,
      },
      extraHTTPHeaders: {
        'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
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
        url.includes('facebook.com/tr')
      ) {
        await route.abort();
        return;
      }

      await route.continue();
    });
    const page = await context.newPage();

    return new PlaywrightComboAtacadistaLeafletPage(browser, context, page, input.timeoutMs);
  }
}

class PlaywrightComboAtacadistaLeafletPage implements ComboAtacadistaLeafletPage {
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

  async gotoHome(): Promise<void> {
    await this.goto(COMBO_ATACADISTA_HOME_URL);
  }

  async waitForTimeout(timeoutMs: number): Promise<void> {
    await this.page.waitForTimeout(timeoutMs);
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(this.page.url());
  }

  getHomeOffersVisualTarget(): Promise<ComboAtacadistaLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.homeOffersLocator(), 'Combo Atacadista home offers button'),
    );
  }

  async openHomeOffersPage(): Promise<void> {
    await Promise.all([
      this.page.waitForURL(/\/ofertas\/?$/i, { timeout: this.timeoutMs }).catch(() => undefined),
      this.homeOffersLocator().click({
        timeout: this.timeoutMs,
      }),
    ]);
  }

  async waitForOffersPage(): Promise<void> {
    await this.page
      .waitForURL(/\/ofertas\/?$/i, {
        timeout: this.timeoutMs,
        waitUntil: 'domcontentloaded',
      })
      .catch(() => undefined);
    await this.leafletCardLocator().first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  async listLeafletCards(): Promise<readonly ComboAtacadistaLeafletCard[]> {
    return parseComboAtacadistaLeafletCards(this.page.url(), await this.page.content());
  }

  getLeafletCardVisualTarget(cardIndex: number): Promise<ComboAtacadistaLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(
        this.leafletCardLocator()
          .nth(cardIndex)
          .getByRole('link', { name: /ver ofertas/i }),
        `Combo Atacadista leaflet card ${String(cardIndex + 1)}`,
      ),
    );
  }

  async openLeafletCard(cardIndex: number): Promise<void> {
    await Promise.all([
      this.page.waitForLoadState('domcontentloaded', { timeout: this.timeoutMs }).catch(() => {
        return undefined;
      }),
      this.leafletCardLocator()
        .nth(cardIndex)
        .getByRole('link', { name: /ver ofertas/i })
        .click({
          timeout: this.timeoutMs,
        }),
    ]);
  }

  async waitForImageGallery(): Promise<void> {
    await this.galleryImageLinkLocator().first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  async listLeafletImageUrls(): Promise<readonly string[]> {
    return parseComboAtacadistaLeafletImageUrls(this.page.url(), await this.page.content());
  }

  getLeafletImageVisualTarget(imageIndex: number): Promise<ComboAtacadistaLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(
        this.galleryImageLinkLocator().nth(imageIndex).locator('img').first(),
        `Combo Atacadista leaflet image ${String(imageIndex + 1)}`,
      ),
    );
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  private homeOffersLocator(): Locator {
    return this.page
      .locator('section')
      .filter({ hasText: /confira nossas ofertas/i })
      .getByRole('link', { name: /ver ofertas/i })
      .first()
      .or(this.page.getByRole('link', { name: /ver ofertas/i }).first());
  }

  private leafletCardLocator(): Locator {
    return this.page.locator('.item-topic').filter({
      has: this.page.getByRole('link', { name: /ver ofertas/i }),
    });
  }

  private galleryImageLinkLocator(): Locator {
    return this.page.locator('a[itemprop="contentUrl"]');
  }

  private createVisualTarget(
    locator: Locator,
    locatorDescription: string,
  ): ComboAtacadistaLeafletVisualTarget {
    return {
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(locator, locatorDescription, this.timeoutMs),
    };
  }
}
