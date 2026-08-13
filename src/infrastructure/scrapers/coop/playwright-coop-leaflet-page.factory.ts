import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import {
  PlaywrightVisualActionTarget,
  PlaywrightVisualDatasetPage,
} from '../../playwright/playwright-visual-dataset-page';
import { parseCoopLeafletCards, parseCoopLeafletImageUrls } from './coop-api-client';
import type { CoopLeafletCard } from './coop-image-gallery-leaflet';
import type {
  CoopLeafletMagazinePage,
  CoopLeafletPage,
  CoopLeafletPageFactory,
  CoopLeafletVisualTarget,
  OpenCoopLeafletPageInput,
} from './coop-leaflet-page';
import { COOP_HOME_URL, type CoopMonitoredStore } from './coop-targets';

const COOP_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

export class PlaywrightCoopLeafletPageFactory implements CoopLeafletPageFactory {
  async openPage(input: OpenCoopLeafletPageInput): Promise<CoopLeafletPage> {
    const browser = await chromium.launch({
      headless: true,
    });
    const context = await browser.newContext({
      deviceScaleFactor: input.viewport.deviceScaleFactor,
      locale: 'pt-BR',
      userAgent: COOP_USER_AGENT,
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

    return new PlaywrightCoopLeafletPage(browser, context, page, input.timeoutMs);
  }
}

class PlaywrightCoopLeafletPage implements CoopLeafletPage {
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
    await this.goto(COOP_HOME_URL);
  }

  async waitForTimeout(timeoutMs: number): Promise<void> {
    await this.page.waitForTimeout(timeoutMs);
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(this.page.url());
  }

  async waitForHomePage(): Promise<void> {
    await this.homeOffersLocator().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  async waitForOffersPage(): Promise<void> {
    await this.page
      .waitForURL(/\/ofertas\/?$/i, {
        timeout: this.timeoutMs,
        waitUntil: 'domcontentloaded',
      })
      .catch(() => undefined);
    await this.page.locator('a[href*="/ofertas/"]').first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  async waitForStoreOffersPage(store: CoopMonitoredStore): Promise<void> {
    await this.page
      .waitForURL(new RegExp(`${escapeRegExp(store.finalPageUrl.replace(/\/+$/, ''))}/?$`, 'i'), {
        timeout: this.timeoutMs,
        waitUntil: 'domcontentloaded',
      })
      .catch(() => undefined);
    await this.leafletCardLocator().first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  getHomeOffersVisualTarget(): Promise<CoopLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.homeOffersLocator(), 'Coop home offers link'),
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

  getStoreLinkVisualTarget(store: CoopMonitoredStore): Promise<CoopLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.storeLinkLocator(store), `Coop store link ${store.storeSlug}`),
    );
  }

  async openStore(store: CoopMonitoredStore): Promise<void> {
    await Promise.all([
      this.page
        .waitForURL(new RegExp(`${escapeRegExp(store.finalPageUrl.replace(/\/+$/, ''))}/?$`, 'i'), {
          timeout: this.timeoutMs,
        })
        .catch(() => undefined),
      this.storeLinkLocator(store).click({
        timeout: this.timeoutMs,
      }),
    ]);
  }

  async listLeafletCards(): Promise<readonly CoopLeafletCard[]> {
    return parseCoopLeafletCards(this.page.url(), await this.page.content());
  }

  getLeafletCardVisualTarget(cardIndex: number): Promise<CoopLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(
        this.leafletCardLocator().nth(cardIndex),
        `Coop leaflet card ${String(cardIndex + 1)}`,
      ),
    );
  }

  async openLeafletCardInNewPage(cardIndex: number): Promise<CoopLeafletMagazinePage> {
    const popupPromise = this.context.waitForEvent('page', {
      timeout: this.timeoutMs,
    });
    await this.leafletCardLocator().nth(cardIndex).click({
      timeout: this.timeoutMs,
    });
    const magazinePage = await popupPromise;
    await magazinePage.waitForLoadState('domcontentloaded', {
      timeout: this.timeoutMs,
    });
    await magazinePage
      .waitForLoadState('networkidle', {
        timeout: this.timeoutMs,
      })
      .catch(() => undefined);

    return new PlaywrightCoopLeafletMagazinePage(magazinePage, this.timeoutMs);
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  private homeOffersLocator(): Locator {
    return this.page.getByRole('link', { name: /^ofertas$/i }).first();
  }

  private storeLinkLocator(store: CoopMonitoredStore): Locator {
    return this.page
      .locator(`a[href="${store.finalPageUrl}"]`)
      .first()
      .or(this.page.locator(`a[href="${store.finalPageUrl.replace(/\/+$/, '')}"]`).first());
  }

  private leafletCardLocator(): Locator {
    return this.page.locator('.ofertas a[href*="/revista/"]');
  }

  private createVisualTarget(
    locator: Locator,
    locatorDescription: string,
  ): CoopLeafletVisualTarget {
    return {
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(locator, locatorDescription, this.timeoutMs),
    };
  }
}

class PlaywrightCoopLeafletMagazinePage implements CoopLeafletMagazinePage {
  private readonly page: Page;

  private readonly timeoutMs: number;

  constructor(page: Page, timeoutMs: number) {
    this.page = page;
    this.timeoutMs = timeoutMs;
  }

  async waitForImageGallery(): Promise<void> {
    await this.galleryImageLocator().first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  async listLeafletImageUrls(): Promise<readonly string[]> {
    return parseCoopLeafletImageUrls(this.page.url(), await this.page.content());
  }

  getLeafletImageVisualTarget(imageIndex: number): Promise<CoopLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(
        this.galleryImageLocator().nth(imageIndex),
        `Coop leaflet image ${String(imageIndex + 1)}`,
      ),
    );
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(this.page.url());
  }

  async close(): Promise<void> {
    await this.page.close();
  }

  private galleryImageLocator(): Locator {
    return this.page.locator('.thumbnails img[src*="imagens/"], img[src*="/revista/imagens/"]');
  }

  private createVisualTarget(
    locator: Locator,
    locatorDescription: string,
  ): CoopLeafletVisualTarget {
    return {
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(locator, locatorDescription, this.timeoutMs),
    };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
