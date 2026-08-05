import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import {
  PlaywrightVisualActionTarget,
  PlaywrightVisualDatasetPage,
} from '../../playwright/playwright-visual-dataset-page';
import type {
  AssaiLeafletPage,
  AssaiLeafletPageFactory,
  AssaiLeafletVisualTarget,
  OpenAssaiLeafletPageInput,
} from './assai-leaflet-page';
import type { AssaiMonitoredStore, AssaiStateCode } from './assai-targets';
import { ASSAI_HOME_URL } from './assai-targets';

const ASSAI_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

const STATE_LABELS: Readonly<Record<AssaiStateCode, string>> = {
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  MA: 'Maranhão',
  MS: 'Mato Grosso do Sul',
  PE: 'Pernambuco',
  PI: 'Piauí',
  PR: 'Paraná',
  RN: 'Rio Grande do Norte',
  SP: 'São Paulo',
};

export class PlaywrightAssaiLeafletPageFactory implements AssaiLeafletPageFactory {
  async openPage(input: OpenAssaiLeafletPageInput): Promise<AssaiLeafletPage> {
    const browser = await chromium.launch({
      headless: true,
    });
    const context = await browser.newContext({
      deviceScaleFactor: input.viewport.deviceScaleFactor,
      locale: 'pt-BR',
      userAgent: ASSAI_USER_AGENT,
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
        url.includes('facebook.com/tr') ||
        url.includes('hotjar.com')
      ) {
        await route.abort();
        return;
      }

      await route.continue();
    });
    const page = await context.newPage();

    return new PlaywrightAssaiLeafletPage(browser, context, page, input.timeoutMs);
  }
}

class PlaywrightAssaiLeafletPage implements AssaiLeafletPage {
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

  async gotoHome(): Promise<void> {
    await this.goto(ASSAI_HOME_URL);
  }

  async waitForTimeout(timeoutMs: number): Promise<void> {
    await this.page.waitForTimeout(timeoutMs);
  }

  async dismissCookieBanner(): Promise<void> {
    const cookieControls = [
      this.page.locator('#onetrust-accept-btn-handler').first(),
      this.page.locator('#accept-recommended-btn-handler').first(),
      this.page
        .getByRole('button', {
          name: /aceitar todos|aceitar|entendi|ok/i,
        })
        .first(),
      this.page.locator('#close-pc-btn-handler').first(),
    ];

    for (const control of cookieControls) {
      if (await control.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await control.click({
          timeout: this.timeoutMs,
        });
        await this.page.waitForTimeout(500);
      }
    }

    const overlay = this.page.locator('#onetrust-consent-sdk').first();

    if (await overlay.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await overlay.evaluate((element) => {
        element.remove();
      });
    }
  }

  getOffersLinkVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(this.createVisualTarget(this.offersLinkLocator(), 'Assai offers link'));
  }

  async openOffersPage(): Promise<void> {
    await Promise.all([
      this.page.waitForURL(/\/ofertas/i, { timeout: this.timeoutMs }).catch(() => undefined),
      this.offersLinkLocator().click({
        timeout: this.timeoutMs,
      }),
    ]);
  }

  async waitForLeafletsPage(): Promise<void> {
    await this.page
      .waitForURL(/\/ofertas\//i, {
        timeout: this.timeoutMs,
        waitUntil: 'domcontentloaded',
      })
      .catch(() => undefined);
    await this.leafletTabLocator().first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
    await this.downloadImageLocator().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  async isLeafletsPageAvailable(): Promise<boolean> {
    if (this.lastNavigationStatus !== null && this.lastNavigationStatus >= 400) {
      return false;
    }

    const accessDeniedVisible = await this.page
      .getByText(/access denied|error 15/i)
      .first()
      .isVisible({ timeout: 1_000 })
      .catch(() => false);

    if (accessDeniedVisible) {
      return false;
    }

    return this.leafletTabLocator()
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(this.page.url());
  }

  getChooseStoreVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.chooseStoreLocator(), 'Assai choose store button'),
    );
  }

  async openStoreSelector(): Promise<void> {
    await this.chooseStoreLocator().click({
      timeout: this.timeoutMs,
    });
    await this.storeSelectorLocator().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  getStateSelectVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.stateSelectLocator(), 'Assai state select'),
    );
  }

  async selectState(store: AssaiMonitoredStore): Promise<void> {
    await selectOptionByNormalizedText(this.stateSelectLocator(), STATE_LABELS[store.stateCode]);
  }

  getCitySelectVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(this.createVisualTarget(this.citySelectLocator(), 'Assai city select'));
  }

  async selectCity(store: AssaiMonitoredStore): Promise<void> {
    await selectOptionByNormalizedText(this.citySelectLocator(), store.cityName);
  }

  getStoreSelectVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.storeSelectLocator(), 'Assai store select'),
    );
  }

  async selectStore(store: AssaiMonitoredStore): Promise<void> {
    await selectOptionByNormalizedText(this.storeSelectLocator(), store.storeName);
  }

  getConfirmStoreVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.confirmButtonLocator(), 'Assai confirm store button'),
    );
  }

  async confirmStoreSelection(): Promise<void> {
    await Promise.all([
      this.page.waitForURL(/\/ofertas\//i, { timeout: this.timeoutMs }).catch(() => undefined),
      this.confirmButtonLocator().click({
        timeout: this.timeoutMs,
      }),
    ]);
  }

  getLeafletTabVisualTarget(tabIndex: number): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(
        this.leafletTabLocator().nth(tabIndex),
        `Assai leaflet tab ${String(tabIndex + 1)}`,
      ),
    );
  }

  async openLeafletTab(tabIndex: number): Promise<void> {
    const tab = this.leafletTabLocator().nth(tabIndex);

    if (await tab.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await tab.click({
        timeout: this.timeoutMs,
      });
    }
  }

  getDownloadImageVisualTarget(): Promise<AssaiLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.downloadImageLocator(), 'Assai download image link'),
    );
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  private offersLinkLocator(): Locator {
    return this.page.getByRole('link', { name: /^ofertas$/i }).first();
  }

  private chooseStoreLocator(): Locator {
    return this.page.getByText(/escolha uma loja/i).first();
  }

  private storeSelectorLocator(): Locator {
    return this.page.locator('#seletor-loja').first();
  }

  private stateSelectLocator(): Locator {
    return this.storeSelectorLocator().locator('select').nth(0);
  }

  private citySelectLocator(): Locator {
    return this.storeSelectorLocator().locator('select').nth(1);
  }

  private storeSelectLocator(): Locator {
    return this.storeSelectorLocator().locator('select').nth(2);
  }

  private confirmButtonLocator(): Locator {
    return this.storeSelectorLocator()
      .getByRole('button', { name: /confirmar/i })
      .first();
  }

  private leafletTabLocator(): Locator {
    return this.page.getByText(/Jornal de Ofertas/i);
  }

  private downloadImageLocator(): Locator {
    return this.page.getByRole('link', { name: /baixar página/i }).first();
  }

  private createVisualTarget(
    locator: Locator,
    locatorDescription: string,
  ): AssaiLeafletVisualTarget {
    return {
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(locator, locatorDescription, this.timeoutMs),
    };
  }
}

async function selectOptionByNormalizedText(select: Locator, expectedText: string): Promise<void> {
  await select.waitFor({
    state: 'visible',
  });
  const optionValue = await select.evaluate((element, rawExpectedText): string => {
    if (!(element instanceof HTMLSelectElement)) {
      throw new Error('Expected Assai selector to be a select element.');
    }

    const expected = rawExpectedText
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
    let option: HTMLOptionElement | null = null;

    for (const candidateOption of element.options) {
      const candidateText = candidateOption.textContent
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');

      if (candidateText === expected) {
        option = candidateOption;
        break;
      }
    }

    if (option === null) {
      throw new Error(`Assai selector option was not found: ${rawExpectedText}`);
    }

    return option.value;
  }, expectedText);

  await select.selectOption(optionValue);
}
