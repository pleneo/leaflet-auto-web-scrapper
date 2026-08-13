import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import {
  PlaywrightVisualActionTarget,
  PlaywrightVisualDatasetPage,
} from '../../playwright/playwright-visual-dataset-page';
import { createTaustePublicationId } from './tauste-api-client';
import type { TaustePublication } from './tauste-pdf-leaflet';
import type {
  OpenTausteLeafletPageInput,
  TausteLeafletPage,
  TausteLeafletPageFactory,
  TausteLeafletVisualTarget,
  TausteOpenedPublicationPage,
} from './tauste-leaflet-page';

const TAUSTE_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

export class PlaywrightTausteLeafletPageFactory implements TausteLeafletPageFactory {
  async openPage(input: OpenTausteLeafletPageInput): Promise<TausteLeafletPage> {
    const browser = await chromium.launch({
      headless: true,
    });
    const context = await browser.newContext({
      deviceScaleFactor: input.viewport.deviceScaleFactor,
      locale: 'pt-BR',
      userAgent: TAUSTE_USER_AGENT,
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

    return new PlaywrightTausteLeafletPage(browser, context, page, input.timeoutMs);
  }
}

class PlaywrightTausteLeafletPage implements TausteLeafletPage {
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

  waitForTimeout(timeoutMs: number): Promise<void> {
    return this.page.waitForTimeout(timeoutMs);
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(this.page.url());
  }

  async waitForInstitutionalHomePage(): Promise<void> {
    await this.heroOffersLocator().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  getHeroOffersVisualTarget(): Promise<TausteLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.heroOffersLocator(), 'Tauste hero offers link'),
    );
  }

  async openHeroOffersPage(): Promise<void> {
    await Promise.all([
      this.page.waitForURL(/\/ofertas\/?$/i, { timeout: this.timeoutMs }).catch(() => undefined),
      this.heroOffersLocator().click({
        timeout: this.timeoutMs,
      }),
    ]);
  }

  getFooterOffersVisualTarget(): Promise<TausteLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.footerOffersLocator(), 'Tauste footer offers link'),
    );
  }

  async openFooterOffersPage(): Promise<void> {
    await Promise.all([
      this.page.waitForURL(/\/ofertas\/?$/i, { timeout: this.timeoutMs }).catch(() => undefined),
      this.footerOffersLocator().click({
        timeout: this.timeoutMs,
      }),
    ]);
  }

  async waitForFlipsnackProfilePage(): Promise<void> {
    await this.page
      .waitForURL(/flipsnack\.com\/taustesupermercado\/?$/i, {
        timeout: this.timeoutMs,
        waitUntil: 'domcontentloaded',
      })
      .catch(() => undefined);
    await this.publicationCardLocator().first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  async listPublicationCards(): Promise<readonly TaustePublication[]> {
    const cards = this.publicationCardLocator();
    const count = await cards.count();
    const publications: TaustePublication[] = [];

    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      const href = await card.getAttribute('href');
      const text = (await card.textContent())?.trim() ?? '';

      if (href === null || href.trim().length === 0 || text.length === 0) {
        continue;
      }

      const publicationUrl = new URL(href, this.page.url()).toString();
      const coverImageUrl = await card
        .locator('img')
        .first()
        .getAttribute('src')
        .catch(() => null);

      publications.push({
        publicationId: createTaustePublicationId(href, index),
        title: text.replace(/\s+/g, ' '),
        directLink: href,
        publicationUrl,
        coverImageUrl,
        publishedAtIso: null,
      });
    }

    return publications;
  }

  getPublicationCardVisualTarget(cardIndex: number): Promise<TausteLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(
        this.publicationCardLocator().nth(cardIndex),
        `Tauste publication card ${String(cardIndex + 1)}`,
      ),
    );
  }

  async openPublication(cardIndex: number): Promise<TausteOpenedPublicationPage> {
    const card = this.publicationCardLocator().nth(cardIndex);
    const popupPromise = this.context.waitForEvent('page', {
      timeout: this.timeoutMs,
    });
    await card.scrollIntoViewIfNeeded({
      timeout: this.timeoutMs,
    });
    await card.click({
      timeout: this.timeoutMs,
    });
    const popup = await popupPromise.catch(() => null);
    const publicationPage = popup ?? this.page;
    await publicationPage.waitForLoadState('domcontentloaded', {
      timeout: this.timeoutMs,
    });

    return new PlaywrightTausteOpenedPublicationPage(
      publicationPage,
      publicationPage !== this.page,
      this.timeoutMs,
    );
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  private heroOffersLocator(): Locator {
    return this.page.getByRole('link', { name: /veja nossas ofertas/i }).first();
  }

  private footerOffersLocator(): Locator {
    return this.page
      .locator('footer')
      .getByRole('link', { name: /^ofertas$/i })
      .first();
  }

  private publicationCardLocator(): Locator {
    return this.page.locator('a[href*="/taustesupermercado/"][href$=".html"]').filter({
      hasText: /ofertas tauste|especial festival/i,
    });
  }

  private createVisualTarget(
    locator: Locator,
    locatorDescription: string,
  ): TausteLeafletVisualTarget {
    return {
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(locator, locatorDescription, this.timeoutMs),
    };
  }
}

class PlaywrightTausteOpenedPublicationPage implements TausteOpenedPublicationPage {
  private readonly page: Page;

  private readonly closeOnDone: boolean;

  private readonly timeoutMs: number;

  constructor(page: Page, closeOnDone: boolean, timeoutMs: number) {
    this.page = page;
    this.closeOnDone = closeOnDone;
    this.timeoutMs = timeoutMs;
  }

  async waitForPublicationPlayer(): Promise<void> {
    await this.page.locator('#myPlayer, iframe#player-iframe').first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  getPdfDownloadVisualTarget(): Promise<TausteLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.pdfDownloadLocator(), 'Tauste PDF download button'),
    );
  }

  async resolvePdfDownloadUrl(): Promise<string> {
    const href = await this.pdfDownloadLocator().getAttribute('href', {
      timeout: this.timeoutMs,
    });

    if (href === null || href.trim().length === 0) {
      return '';
    }

    return new URL(href, this.page.url()).toString();
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(this.page.url());
  }

  async close(): Promise<void> {
    if (this.closeOnDone) {
      await this.page.close();
    }
  }

  private pdfDownloadLocator(): Locator {
    return this.page
      .getByRole('link', { name: /download|baixar|pdf/i })
      .or(this.page.getByRole('button', { name: /download|baixar|pdf/i }))
      .first();
  }

  private createVisualTarget(
    locator: Locator,
    locatorDescription: string,
  ): TausteLeafletVisualTarget {
    return {
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(locator, locatorDescription, this.timeoutMs),
    };
  }
}
