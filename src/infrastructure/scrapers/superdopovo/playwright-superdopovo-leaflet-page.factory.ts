import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import {
  PlaywrightVisualActionTarget,
  PlaywrightVisualDatasetPage,
} from '../../playwright/playwright-visual-dataset-page';
import type {
  OpenedSuperDoPovoLeaflet,
  OpenSuperDoPovoLeafletPageInput,
  SuperDoPovoLeafletCard,
  SuperDoPovoLeafletPage,
  SuperDoPovoLeafletPageFactory,
  SuperDoPovoLeafletVisualTarget,
} from './superdopovo-leaflet-page';

interface RawSuperDoPovoLeafletCard {
  readonly title: string;
  readonly coverImageUrl: string;
}

export class PlaywrightSuperDoPovoLeafletPageFactory implements SuperDoPovoLeafletPageFactory {
  async openPage(input: OpenSuperDoPovoLeafletPageInput): Promise<SuperDoPovoLeafletPage> {
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

    return new PlaywrightSuperDoPovoLeafletPage(browser, context, page, input.timeoutMs);
  }
}

class PlaywrightSuperDoPovoLeafletPage implements SuperDoPovoLeafletPage {
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

  async dismissCookieBanner(): Promise<void> {
    const consentButton = this.page
      .getByRole('button', {
        name: /estou ciente/i,
      })
      .first();

    if (await consentButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await consentButton.click({
        timeout: this.timeoutMs,
      });
    }
  }

  getSectionsMenuVisualTarget(): Promise<SuperDoPovoLeafletVisualTarget> {
    return Promise.resolve({
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(
        this.sectionsMenuLocator(),
        'Super do Povo sections menu',
        this.timeoutMs,
      ),
    });
  }

  async openSectionsMenu(): Promise<void> {
    const menu = this.sectionsMenuLocator();
    await menu.scrollIntoViewIfNeeded({
      timeout: this.timeoutMs,
    });
    await menu.hover({
      timeout: this.timeoutMs,
    });
    await this.page.waitForTimeout(300);
  }

  getLeafletsLinkVisualTarget(): Promise<SuperDoPovoLeafletVisualTarget> {
    return Promise.resolve({
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(
        this.visibleLeafletsLinkLocator(),
        'Super do Povo leaflets menu link',
        this.timeoutMs,
      ),
    });
  }

  async openLeafletsPage(expectedUrl: string): Promise<void> {
    const visibleLink = this.visibleLeafletsLinkLocator();

    if (await visibleLink.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await Promise.all([
        this.page.waitForURL(expectedUrl, {
          timeout: this.timeoutMs,
          waitUntil: 'domcontentloaded',
        }),
        visibleLink.click({
          timeout: this.timeoutMs,
        }),
      ]);
      return;
    }

    await this.goto(expectedUrl);
  }

  async discoverCards(): Promise<readonly SuperDoPovoLeafletCard[]> {
    await this.cardLocator().first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });

    return this.cardLocator().evaluateAll((elements): RawSuperDoPovoLeafletCard[] => {
      return elements
        .map((element, index): RawSuperDoPovoLeafletCard | null => {
          const image = element.querySelector('img[src*="botvendasstorage1"]');
          const coverImageUrl = image?.getAttribute('src')?.trim() ?? '';

          if (coverImageUrl.length === 0) {
            return null;
          }

          const text = element.textContent.replace(/\s+/g, ' ').trim();
          const title = text.length > 0 ? text : `Super do Povo booklet ${String(index + 1)}`;

          return {
            title,
            coverImageUrl,
          };
        })
        .filter((card): card is RawSuperDoPovoLeafletCard => card !== null);
    });
  }

  getLeafletCardVisualTarget(cardIndex: number): Promise<SuperDoPovoLeafletVisualTarget> {
    return Promise.resolve({
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(
        this.cardLocator().nth(cardIndex),
        `Super do Povo leaflet card ${String(cardIndex + 1)}`,
        this.timeoutMs,
      ),
    });
  }

  async openLeafletAt(cardIndex: number): Promise<OpenedSuperDoPovoLeaflet> {
    const card = this.cardLocator().nth(cardIndex);
    await this.deactivateBackgroundOverlay();
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

  getLeafletModalImageVisualTarget(imageIndex: number): Promise<SuperDoPovoLeafletVisualTarget> {
    return Promise.resolve({
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(
        this.modalImageLocator(imageIndex),
        `Super do Povo leaflet modal visible image ${String(imageIndex + 1)}`,
        this.timeoutMs,
      ),
    });
  }

  getLeafletModalCloseVisualTarget(): Promise<SuperDoPovoLeafletVisualTarget> {
    return Promise.resolve({
      page: new PlaywrightVisualDatasetPage(this.page),
      target: new PlaywrightVisualActionTarget(
        this.modalCloseButtonLocator(),
        'Super do Povo leaflet modal close button',
        this.timeoutMs,
      ),
    });
  }

  async closeLeafletModal(): Promise<void> {
    await this.modalCloseButtonLocator().click({
      timeout: this.timeoutMs,
    });
    await this.modalLocator().waitFor({
      state: 'hidden',
      timeout: this.timeoutMs,
    });
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  private sectionsMenuLocator(): Locator {
    return this.page
      .locator('button:visible, [role="button"]:visible, a:visible, span:visible')
      .filter({
        hasText: /^\s*Seções\s*$/,
      })
      .first();
  }

  private visibleLeafletsLinkLocator(): Locator {
    return this.page
      .locator('a[href="/booklets"]:visible, a[href$="/booklets"]:visible')
      .filter({
        hasText: /^\s*Encartes\s*$/,
      })
      .first();
  }

  private cardLocator(): Locator {
    return this.page.locator('.image-container:visible').filter({
      has: this.page.locator('img[src*="botvendasstorage1"]'),
    });
  }

  private modalLocator(): Locator {
    return this.page.locator('.modal.show[role="dialog"], .modal[role="dialog"]:visible').first();
  }

  private modalImageLocator(imageIndex: number): Locator {
    return this.modalLocator().locator('img.booklet-image:visible, img.img-fluid:visible').nth(imageIndex);
  }

  private modalCloseButtonLocator(): Locator {
    return this.modalLocator().locator('button.close, [aria-label="Close"]').first();
  }

  private async deactivateBackgroundOverlay(): Promise<void> {
    await this.page.evaluate(() => {
      for (const overlay of document.querySelectorAll('.background-overlay.active')) {
        overlay.classList.remove('active');
      }
    });
  }
}

async function extractModalImageUrls(modal: Locator): Promise<readonly string[]> {
  const imageUrls = await modal.evaluate((modalElement): string[] => {
    return [...modalElement.querySelectorAll('img')]
      .map((image) => image.getAttribute('src')?.trim() ?? '')
      .filter((source) => source.length > 0);
  });

  return [...new Set(imageUrls)];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
