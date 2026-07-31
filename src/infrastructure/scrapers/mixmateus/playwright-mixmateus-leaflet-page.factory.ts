import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import {
  PlaywrightVisualActionTarget,
  PlaywrightVisualDatasetPage,
} from '../../playwright/playwright-visual-dataset-page';
import type {
  MixMateusLeafletCard,
  MixMateusLeafletPage,
  MixMateusLeafletPageFactory,
  MixMateusLeafletVisualTarget,
  OpenMixMateusLeafletPageInput,
} from './mixmateus-leaflet-page';
import type { MixMateusMonitoredStore } from './mixmateus-targets';

interface RawMixMateusLeafletCard {
  readonly title: string;
  readonly cardIndex: number;
}

export class PlaywrightMixMateusLeafletPageFactory implements MixMateusLeafletPageFactory {
  async openPage(input: OpenMixMateusLeafletPageInput): Promise<MixMateusLeafletPage> {
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
        url.includes('facebook.com/tr')
      ) {
        await route.abort();
        return;
      }

      await route.continue();
    });
    const page = await context.newPage();

    return new PlaywrightMixMateusLeafletPage(browser, context, page, input.timeoutMs);
  }
}

class PlaywrightMixMateusLeafletPage implements MixMateusLeafletPage {
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
        name: /aceitar|entendi|estou ciente|ok/i,
      })
      .first();

    if (await consentButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await consentButton.click({
        timeout: this.timeoutMs,
      });
    }
  }

  async getStateSelectionVisualTarget(
    store: MixMateusMonitoredStore,
  ): Promise<MixMateusLeafletVisualTarget> {
    await this.openSearchableSelect('selEstado');

    return this.createVisualTarget(
      this.searchableOptionLocator('selEstado', store.stateName, store.stateCode.toLowerCase()),
      `Mix Mateus state option ${store.stateName}`,
    );
  }

  async selectState(store: MixMateusMonitoredStore): Promise<void> {
    await this.selectSearchableOption('selEstado', store.stateName, store.stateCode.toLowerCase());
  }

  async getCitySelectionVisualTarget(
    store: MixMateusMonitoredStore,
  ): Promise<MixMateusLeafletVisualTarget> {
    await this.openSearchableSelect('selCidade');

    return this.createVisualTarget(
      this.searchableOptionLocator('selCidade', store.cityName, slugify(store.cityName)),
      `Mix Mateus city option ${store.cityName}`,
    );
  }

  async selectCity(store: MixMateusMonitoredStore): Promise<void> {
    await this.selectSearchableOption('selCidade', store.cityName, slugify(store.cityName));
  }

  async getStoreSelectionVisualTarget(
    store: MixMateusMonitoredStore,
  ): Promise<MixMateusLeafletVisualTarget> {
    await this.openSearchableSelect('selLoja');

    return this.createVisualTarget(
      this.searchableOptionLocator('selLoja', store.storeName, store.storeSlug),
      `Mix Mateus store option ${store.storeName}`,
    );
  }

  async selectStore(store: MixMateusMonitoredStore): Promise<void> {
    await Promise.all([
      this.page
        .waitForURL(store.finalPageUrl, {
          timeout: this.timeoutMs,
          waitUntil: 'domcontentloaded',
        })
        .catch(() => undefined),
      this.selectSearchableOption('selLoja', store.storeName, store.storeSlug),
    ]);
  }

  async waitForStoreLeaflets(store: MixMateusMonitoredStore): Promise<void> {
    await this.page
      .waitForURL(store.finalPageUrl, {
        timeout: this.timeoutMs,
        waitUntil: 'domcontentloaded',
      })
      .catch(() => undefined);
    await this.page.locator('#wrapEncarte').waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  async discoverCards(): Promise<readonly MixMateusLeafletCard[]> {
    const header = this.encarteHeaderLocator();

    if (!(await header.isVisible({ timeout: 2_000 }).catch(() => false))) {
      return [];
    }

    await this.openLeafletDropdown();

    return this.leafletItemLocator().evaluateAll((elements): RawMixMateusLeafletCard[] => {
      return elements
        .map((element, index): RawMixMateusLeafletCard | null => {
          const title =
            element.querySelector('.encarte-nome')?.textContent.replace(/\s+/g, ' ').trim() ?? '';

          if (title.length === 0 || /^escolha o encarte$/i.test(title)) {
            return null;
          }

          return {
            title,
            cardIndex: index,
          };
        })
        .filter((card): card is RawMixMateusLeafletCard => card !== null);
    });
  }

  async getLeafletCardVisualTarget(cardIndex: number): Promise<MixMateusLeafletVisualTarget> {
    await this.openLeafletDropdown();

    return this.createVisualTarget(
      this.leafletViewButtonLocator(cardIndex),
      `Mix Mateus leaflet card ${String(cardIndex + 1)}`,
    );
  }

  async openLeafletAt(cardIndex: number): Promise<void> {
    const button = this.leafletViewButtonLocator(cardIndex);
    await button.scrollIntoViewIfNeeded({
      timeout: this.timeoutMs,
    });
    await button.click({
      timeout: this.timeoutMs,
    });
    await this.modalLocator().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  getPdfDownloadVisualTarget(): Promise<MixMateusLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.pdfDownloadLocator(), 'Mix Mateus leaflet PDF download button'),
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

  async closeLeafletModal(): Promise<void> {
    const closeButton = this.page.locator('#modalFechar').first();

    if (await closeButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await closeButton.click({
        timeout: this.timeoutMs,
      });
      await this.modalLocator()
        .waitFor({
          state: 'hidden',
          timeout: this.timeoutMs,
        })
        .catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  private async openSearchableSelect(selectId: string): Promise<void> {
    const wrapper = this.searchableWrapperLocator(selectId);
    const input = wrapper.locator('input:visible').first();

    await wrapper.scrollIntoViewIfNeeded({
      timeout: this.timeoutMs,
    });

    if (!(await wrapper.evaluate((element) => element.classList.contains('open')))) {
      await input.click({
        timeout: this.timeoutMs,
      });
    }
  }

  private async selectSearchableOption(
    selectId: string,
    visibleText: string,
    value: string,
  ): Promise<void> {
    await this.openSearchableSelect(selectId);
    const option = this.searchableOptionLocator(selectId, visibleText, value);
    await option.scrollIntoViewIfNeeded({
      timeout: this.timeoutMs,
    });
    await option.click({
      timeout: this.timeoutMs,
    });
  }

  private searchableWrapperLocator(selectId: string): Locator {
    return this.page.locator(`.searchable-select:has(#${selectId})`).first();
  }

  private searchableOptionLocator(selectId: string, visibleText: string, value: string): Locator {
    const wrapper = this.searchableWrapperLocator(selectId);
    const byText = wrapper.locator('.option-item').filter({
      hasText: new RegExp(`^\\s*${escapeRegExp(visibleText)}\\s*$`, 'i'),
    });
    const byValue = wrapper.locator(`.option-item[data-value="${cssString(value)}"]`);

    return byText.or(byValue).first();
  }

  private async openLeafletDropdown(): Promise<void> {
    const customSelect = this.page.locator('#wrapEncarte .encarte-select-custom').first();
    const header = this.encarteHeaderLocator();

    await customSelect.waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });

    if (!(await customSelect.evaluate((element) => element.classList.contains('open')))) {
      await header.click({
        timeout: this.timeoutMs,
      });
    }
  }

  private encarteHeaderLocator(): Locator {
    return this.page.locator('#wrapEncarte .encarte-select-header:visible').first();
  }

  private leafletItemLocator(): Locator {
    return this.page.locator('#wrapEncarte .encarte-item[data-action="select"]:visible').filter({
      has: this.page.locator('.encarte-item-ver-btn[data-action="view"]'),
    });
  }

  private leafletViewButtonLocator(cardIndex: number): Locator {
    return this.leafletItemLocator()
      .nth(cardIndex)
      .locator('.encarte-item-ver-btn[data-action="view"]')
      .first();
  }

  private modalLocator(): Locator {
    return this.page.locator('#modalEncarte:not(.hidden)').first();
  }

  private pdfDownloadLocator(): Locator {
    return this.page.locator('#modalFooter a[data-track="download"][href]:visible').first();
  }

  private createVisualTarget(locator: Locator, description: string): MixMateusLeafletVisualTarget {
    return {
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(locator, description, this.timeoutMs),
    };
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
