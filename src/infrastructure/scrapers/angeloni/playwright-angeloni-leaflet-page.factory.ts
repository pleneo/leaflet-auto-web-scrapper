import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import {
  PlaywrightVisualActionTarget,
  PlaywrightVisualDatasetPage,
} from '../../playwright/playwright-visual-dataset-page';
import type {
  AngeloniLeafletLink,
  AngeloniLeafletPage,
  AngeloniLeafletPageFactory,
  AngeloniLeafletVisualTarget,
  OpenAngeloniLeafletPageInput,
} from './angeloni-leaflet-page';
import type { AngeloniMonitoredRegion } from './angeloni-targets';

interface RawAngeloniLeafletLink {
  readonly title: string;
  readonly cardIndex: number;
  readonly pdfUrl: string;
}

export class PlaywrightAngeloniLeafletPageFactory implements AngeloniLeafletPageFactory {
  async openPage(input: OpenAngeloniLeafletPageInput): Promise<AngeloniLeafletPage> {
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
        url.includes('doubleclick.net')
      ) {
        await route.abort();
        return;
      }

      await route.continue();
    });
    const page = await context.newPage();

    return new PlaywrightAngeloniLeafletPage(browser, context, page, input.timeoutMs);
  }
}

class PlaywrightAngeloniLeafletPage implements AngeloniLeafletPage {
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
    const button = this.page
      .getByRole('button', {
        name: /aceitar|entendi|estou ciente|ok/i,
      })
      .first();

    if (await button.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await button.click({
        timeout: this.timeoutMs,
      });
    }
  }

  getRegionLinkVisualTarget(region: AngeloniMonitoredRegion): Promise<AngeloniLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(
        this.regionLinkLocator(region),
        `Angeloni region ${region.regionName}`,
      ),
    );
  }

  async openRegion(region: AngeloniMonitoredRegion): Promise<void> {
    await Promise.all([
      this.page
        .waitForURL(region.regionUrl, {
          timeout: this.timeoutMs,
          waitUntil: 'domcontentloaded',
        })
        .catch(() => undefined),
      this.regionLinkLocator(region).click({
        timeout: this.timeoutMs,
      }),
    ]);
  }

  async waitForRegionLeaflets(region: AngeloniMonitoredRegion): Promise<void> {
    await this.page
      .waitForURL(region.regionUrl, {
        timeout: this.timeoutMs,
        waitUntil: 'domcontentloaded',
      })
      .catch(() => undefined);
    await this.offerSectionLocator().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
    await this.pdfLinkLocator().first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
  }

  async discoverLeafletLinks(): Promise<readonly AngeloniLeafletLink[]> {
    await this.offerSectionLocator().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });

    return this.pdfLinkLocator().evaluateAll((elements): RawAngeloniLeafletLink[] => {
      const seenUrls = new Set<string>();

      return elements
        .map((element, index): RawAngeloniLeafletLink | null => {
          const anchor = element instanceof HTMLAnchorElement ? element : null;
          const href = anchor?.href.trim() ?? '';

          if (anchor === null || href.length === 0 || seenUrls.has(href)) {
            return null;
          }

          seenUrls.add(href);

          const title = anchor.textContent.replace(/\s+/g, ' ').trim();

          return {
            title: title.length === 0 ? 'Angeloni leaflet' : title,
            cardIndex: index,
            pdfUrl: href,
          };
        })
        .filter((link): link is RawAngeloniLeafletLink => link !== null);
    });
  }

  getLeafletLinkVisualTarget(cardIndex: number): Promise<AngeloniLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(
        this.leafletLinkLocator(cardIndex),
        `Angeloni leaflet link ${String(cardIndex + 1)}`,
      ),
    );
  }

  async resolveLeafletPdfUrl(cardIndex: number): Promise<string> {
    const href = await this.leafletLinkLocator(cardIndex).getAttribute('href', {
      timeout: this.timeoutMs,
    });

    if (href === null || href.trim().length === 0) {
      return '';
    }

    const url = new URL(href, this.page.url());
    url.hash = '';

    return url.toString();
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  private regionLinkLocator(region: AngeloniMonitoredRegion): Locator {
    const byRole = this.page.getByRole('link', {
      name: new RegExp(`^\\s*${escapeRegExp(region.regionName)}\\s*$`, 'i'),
    });
    const byHref = this.page.locator(`a[href="${cssString(new URL(region.regionUrl).pathname)}"]`);

    return byRole.or(byHref).first();
  }

  private offerSectionLocator(): Locator {
    return this.page
      .locator('section, main, div')
      .filter({ hasText: /Escolha a Oferta/i })
      .first();
  }

  private pdfLinkLocator(): Locator {
    return this.page.locator('a[href$=".pdf"]:visible, a[href*=".pdf?"]:visible').filter({
      hasText: /.+/,
    });
  }

  private leafletLinkLocator(cardIndex: number): Locator {
    return this.pdfLinkLocator().nth(cardIndex);
  }

  private createVisualTarget(locator: Locator, description: string): AngeloniLeafletVisualTarget {
    return {
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(locator, description, this.timeoutMs),
    };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
