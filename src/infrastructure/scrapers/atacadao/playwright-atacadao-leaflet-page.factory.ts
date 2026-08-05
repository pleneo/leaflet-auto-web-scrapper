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

interface RawAtacadaoStorePageCandidate {
  readonly href: string;
  readonly text: string;
}

const ATACADAO_STORES_DIRECTORY_URL = 'https://www.atacadao.com.br/institucional/nossas-lojas';
const MAX_STORE_DIRECTORY_EXPANSIONS = 40;

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

  private lastNavigationStatus: number | null = null;

  constructor(browser: Browser, context: BrowserContext, page: Page, timeoutMs: number) {
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.timeoutMs = timeoutMs;
  }

  async goto(url: string): Promise<void> {
    const response = await this.page.goto(url, {
      timeout: this.timeoutMs,
      waitUntil: 'domcontentloaded',
    });
    this.lastNavigationStatus = response?.status() ?? null;
    await this.page
      .waitForLoadState('networkidle', {
        timeout: this.timeoutMs,
      })
      .catch(() => undefined);
  }

  async isStorePageUnavailable(): Promise<boolean> {
    if (this.lastNavigationStatus === 404) {
      return true;
    }

    return this.page
      .getByRole('heading', {
        name: /página não encontrada/i,
      })
      .first()
      .isVisible({
        timeout: 1_000,
      })
      .catch(() => false);
  }

  async resolveStorePageUrl(store: AtacadaoMonitoredStore): Promise<string | null> {
    await this.goto(ATACADAO_STORES_DIRECTORY_URL);
    await this.dismissCookieBanner();
    await this.selectDirectoryOption(this.stateSelectLocator(), store.stateCode);
    await this.page.waitForTimeout(1_000);
    await this.selectDirectoryOption(this.citySelectLocator(), store.cityName);
    await this.page.waitForTimeout(2_000);

    for (let expansion = 0; expansion <= MAX_STORE_DIRECTORY_EXPANSIONS; expansion += 1) {
      const matchedUrl = await this.findStorePageCandidateUrl(store);

      if (matchedUrl !== null) {
        return matchedUrl;
      }

      if (!(await this.hasMoreStores())) {
        return null;
      }

      await this.showMoreStoresButtonLocator().click({
        timeout: this.timeoutMs,
      });
      await this.page.waitForTimeout(500);
    }

    return null;
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

  private async hasMoreStores(): Promise<boolean> {
    return this.showMoreStoresButtonLocator()
      .isVisible({
        timeout: 1_000,
      })
      .catch(() => false);
  }

  private showMoreStoresButtonLocator(): Locator {
    return this.page
      .getByRole('button', {
        name: /^mostrar mais$/i,
      })
      .first();
  }

  private stateSelectLocator(): Locator {
    return this.page.locator('select').nth(0);
  }

  private citySelectLocator(): Locator {
    return this.page.locator('select').nth(1);
  }

  private async selectDirectoryOption(locator: Locator, expectedText: string): Promise<void> {
    const options = await locator.evaluate(
      (selectElement): readonly { text: string; value: string }[] => {
        if (!(selectElement instanceof HTMLSelectElement)) {
          return [];
        }

        return Array.from(selectElement.options).map((option) => ({
          text: option.textContent.trim(),
          value: option.value,
        }));
      },
    );
    const selectedOption = options.find(
      (option) => normalizeComparableText(option.text) === normalizeComparableText(expectedText),
    );

    if (selectedOption === undefined) {
      throw new Error(`Atacadao directory option "${expectedText}" was not found.`);
    }

    await locator.selectOption({
      value: selectedOption.value,
    });
  }

  private async findStorePageCandidateUrl(store: AtacadaoMonitoredStore): Promise<string | null> {
    const candidates = await this.page
      .locator('a[href*="/loja/"]')
      .evaluateAll((elements): RawAtacadaoStorePageCandidate[] => {
        const seenUrls = new Set<string>();
        const candidates: RawAtacadaoStorePageCandidate[] = [];

        for (const element of elements) {
          const link = element instanceof HTMLAnchorElement ? element : null;

          if (link === null) {
            continue;
          }

          const href = link.href.trim();
          const text = link.textContent.replace(/\s+/g, ' ').trim();

          if (href.length === 0 || text.length === 0 || seenUrls.has(href)) {
            continue;
          }

          seenUrls.add(href);
          candidates.push({
            href,
            text,
          });
        }

        return candidates;
      });
    const normalizedStoreName = normalizeComparableText(store.storeName);
    const matchedCandidate = candidates.find((candidate) =>
      normalizeComparableText(candidate.text).includes(normalizedStoreName),
    );

    return matchedCandidate?.href ?? null;
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

function normalizeComparableText(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
