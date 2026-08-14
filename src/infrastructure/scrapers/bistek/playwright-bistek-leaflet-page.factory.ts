import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import {
  PlaywrightVisualActionTarget,
  PlaywrightVisualDatasetPage,
} from '../../playwright/playwright-visual-dataset-page';
import type { BistekLeafletCard, BistekMonitoredStore } from './bistek-image-gallery-leaflet';
import type {
  BistekLeafletPage,
  BistekLeafletPageFactory,
  BistekLeafletVisualTarget,
  OpenBistekLeafletPageInput,
} from './bistek-leaflet-page';
import { parseBistekLeafletCards } from './bistek-api-extraction';
import { parseBistekTargetsFromHtml } from './bistek-targets';

export class PlaywrightBistekLeafletPageFactory implements BistekLeafletPageFactory {
  async openPage(input: OpenBistekLeafletPageInput): Promise<BistekLeafletPage> {
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
        url.includes('cloudflareinsights.com') ||
        url.includes('tag.goadopt.io')
      ) {
        await route.abort();
        return;
      }

      await route.continue();
    });
    const page = await context.newPage();

    return new PlaywrightBistekLeafletPage(browser, context, page, input.timeoutMs);
  }
}

class PlaywrightBistekLeafletPage implements BistekLeafletPage {
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

  async discoverStores(): Promise<readonly BistekMonitoredStore[]> {
    return parseBistekTargetsFromHtml(await this.page.content());
  }

  async ensureStoreSelectionModalOpen(): Promise<void> {
    if (
      await this.storeModalLocator()
        .isVisible({ timeout: 1_000 })
        .catch(() => false)
    ) {
      return;
    }

    await this.page
      .getByText(/Encontre sua loja/i)
      .first()
      .click({
        timeout: this.timeoutMs,
      });
    await this.storeModalLocator().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  getCitySelectionVisualTarget(): Promise<BistekLeafletVisualTarget> {
    return Promise.resolve(this.createVisualTarget(this.citySelectLocator(), 'Bistek city select'));
  }

  async selectCity(store: BistekMonitoredStore): Promise<void> {
    await this.citySelectLocator().selectOption(store.cityId, {
      timeout: this.timeoutMs,
    });
  }

  getStoreSelectionVisualTarget(): Promise<BistekLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.storeSelectLocator(), 'Bistek store select'),
    );
  }

  async selectStore(store: BistekMonitoredStore): Promise<void> {
    await Promise.all([
      this.page
        .waitForURL(/\/ofertas\/?$/i, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs })
        .catch(() => undefined),
      this.storeSelectLocator().selectOption(store.storeId, {
        timeout: this.timeoutMs,
      }),
    ]);
  }

  async waitForStoreLeaflets(store: BistekMonitoredStore): Promise<void> {
    await this.storeModalLocator().waitFor({
      state: 'hidden',
      timeout: this.timeoutMs,
    });
    await this.page
      .getByText(new RegExp(`Confira as ofertas de\\s+${escapeRegExp(store.cityName)}`, 'i'))
      .waitFor({
        state: 'visible',
        timeout: this.timeoutMs,
      });
    await this.page.locator('.oferta').first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  async discoverCards(store: BistekMonitoredStore): Promise<readonly BistekLeafletCard[]> {
    return parseBistekLeafletCards(this.page.url(), store, await this.page.content());
  }

  getLeafletCardVisualTarget(cardIndex: number): Promise<BistekLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(
        this.leafletCardLocator(cardIndex),
        `Bistek leaflet card ${String(cardIndex + 1)}`,
      ),
    );
  }

  async openLeafletAt(cardIndex: number): Promise<void> {
    await this.leafletCardLocator(cardIndex).click({
      timeout: this.timeoutMs,
    });
    await this.fancyboxContainerLocator().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  getImageDownloadVisualTarget(): Promise<BistekLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(
        this.downloadButtonLocator(),
        'Bistek Fancybox image download button',
      ),
    );
  }

  async resolveActiveDownloadImageUrl(): Promise<string> {
    const href = await this.downloadButtonLocator().getAttribute('href', {
      timeout: this.timeoutMs,
    });

    if (typeof href !== 'string' || href.trim().length === 0) {
      throw new Error('Bistek Fancybox download button did not expose an image URL.');
    }

    return new URL(href, this.page.url()).toString();
  }

  async getModalCloseVisualTarget(): Promise<BistekLeafletVisualTarget> {
    await this.ensureFancyboxToolbarVisible();
    return this.createVisualTarget(this.closeButtonLocator(), 'Bistek Fancybox close button');
  }

  async closeLeafletModal(): Promise<void> {
    await this.ensureFancyboxToolbarVisible();
    await this.closeButtonLocator()
      .click({
        force: true,
        timeout: 2_000,
      })
      .catch(async () => {
        await this.page.keyboard.press('Escape');
      });
    await this.fancyboxContainerLocator().waitFor({
      state: 'hidden',
      timeout: this.timeoutMs,
    });
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  private createVisualTarget(locator: Locator, description: string): BistekLeafletVisualTarget {
    return {
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(locator, description, this.timeoutMs),
    };
  }

  private storeModalLocator(): Locator {
    return this.page.locator('#select_lojas');
  }

  private citySelectLocator(): Locator {
    return this.page.locator('#cidades_list');
  }

  private storeSelectLocator(): Locator {
    return this.page.locator('#lojas_list');
  }

  private leafletCardLocator(cardIndex: number): Locator {
    return this.page.locator('.oferta .capa_oferta a[data-fancybox]').nth(cardIndex);
  }

  private fancyboxContainerLocator(): Locator {
    return this.page.locator('.fancybox-container');
  }

  private downloadButtonLocator(): Locator {
    return this.page.locator('.fancybox-container .fancybox-button--download').first();
  }

  private async ensureFancyboxToolbarVisible(): Promise<void> {
    await this.page.mouse.move(500, 500);
    await this.page
      .locator('.fancybox-toolbar')
      .first()
      .waitFor({
        state: 'visible',
        timeout: this.timeoutMs,
      })
      .catch(() => undefined);
  }

  private closeButtonLocator(): Locator {
    return this.page.locator('.fancybox-container .fancybox-button--close').first();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
