import {
  chromium,
  type Browser,
  type BrowserContext,
  type FrameLocator,
  type Locator,
  type Page,
  type Response,
} from 'playwright';
import {
  PlaywrightVisualActionTarget,
  PlaywrightVisualDatasetPage,
} from '../../playwright/playwright-visual-dataset-page';
import { parseLeafletImageContentType } from '../../storage/fetch-leaflet-image-http-client';
import { createTaustePublicationId } from './tauste-api-client';
import type { DownloadedTausteImageGalleryImage, TaustePublication } from './tauste-pdf-leaflet';
import type {
  OpenTausteLeafletPageInput,
  TausteLeafletPage,
  TausteLeafletPageFactory,
  TausteLeafletVisualTarget,
  TausteOpenedPublicationPage,
} from './tauste-leaflet-page';

const TAUSTE_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

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
        sourceCardIndex: index,
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
    const previousUrl = this.page.url();
    const popupPromise = this.context
      .waitForEvent('page', {
        timeout: Math.min(this.timeoutMs, 2_000),
      })
      .catch(() => null);
    await card.scrollIntoViewIfNeeded({
      timeout: this.timeoutMs,
    });
    await Promise.all([
      this.page
        .waitForURL((url) => url.toString() !== previousUrl, {
          timeout: this.timeoutMs,
          waitUntil: 'domcontentloaded',
        })
        .catch(() => undefined),
      card.click({
        timeout: this.timeoutMs,
      }),
    ]);
    const popup = await popupPromise;
    const publicationPage = popup ?? this.page;
    await publicationPage.waitForLoadState('domcontentloaded', {
      timeout: this.timeoutMs,
    });

    return new PlaywrightTausteOpenedPublicationPage(
      publicationPage,
      publicationPage !== this.page,
      publicationPage === this.page ? previousUrl : null,
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

interface TausteFlipsnackDataJson {
  readonly pageIds: readonly string[];
}

export function readTausteFlipsnackPublicationSegment(url: string): string | null {
  const pathSegments = new URL(url).pathname.split('/').filter((segment) => segment.length > 0);
  const publicationSegment =
    pathSegments.at(-1) === 'full-view.html' ? pathSegments.at(-2) : pathSegments.at(-1);

  if (publicationSegment === undefined || publicationSegment.length === 0) {
    return null;
  }

  return publicationSegment.replace(/\.html$/i, '');
}

function isFlipsnackDataJsonUrl(url: string, expectedPublicationSegment: string | null): boolean {
  if (!/\/collections\/[^/]+\/data\.json(?:\?|$)/i.test(url)) {
    return false;
  }

  if (expectedPublicationSegment === null) {
    return true;
  }

  const match = /\/collections\/([^/]+)\/data\.json(?:\?|$)/i.exec(url);
  const collectionId = match?.[1] ?? null;

  return collectionId !== null && expectedPublicationSegment.endsWith(collectionId);
}

function isFlipsnackDataJsonUrlForCollection(url: string, collectionId: string | null): boolean {
  if (collectionId === null) {
    return false;
  }

  return new URL(url).pathname.includes(`/collections/${collectionId}/data.json`);
}

function parseTausteFlipsnackDataJson(value: JsonValue): TausteFlipsnackDataJson {
  if (!isJsonObject(value)) {
    return { pageIds: [] };
  }

  const pages = value['pages'] ?? null;

  if (!isJsonObject(pages) || !Array.isArray(pages['order'])) {
    return { pageIds: [] };
  }

  return {
    pageIds: pages['order'].filter((pageId): pageId is string => typeof pageId === 'string'),
  };
}

function createImageGalleryUrls(
  dataJsonUrl: string,
  dataJson: TausteFlipsnackDataJson,
): readonly string[] {
  const url = new URL(dataJsonUrl);
  const directoryPath = url.pathname.replace(/\/data\.json$/i, '');
  const query = url.search;

  return dataJson.pageIds.map((pageId) => {
    const imageUrl = new URL(`${directoryPath}/covers/${encodeURIComponent(pageId)}/original`, url);
    imageUrl.search = query;
    return imageUrl.toString();
  });
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class PlaywrightTausteOpenedPublicationPage implements TausteOpenedPublicationPage {
  private readonly page: Page;

  private readonly closeOnDone: boolean;

  private readonly returnUrl: string | null;

  private readonly timeoutMs: number;

  private dataJson: TausteFlipsnackDataJson | null = null;

  private dataJsonUrl: string | null = null;

  private fallbackDataJson: TausteFlipsnackDataJson | null = null;

  private fallbackDataJsonUrl: string | null = null;

  private readonly responseListener: (response: Response) => void;

  private readonly expectedPublicationSegment: string | null;

  private expectedCollectionId: string | null = null;

  constructor(page: Page, closeOnDone: boolean, returnUrl: string | null, timeoutMs: number) {
    this.page = page;
    this.closeOnDone = closeOnDone;
    this.returnUrl = returnUrl;
    this.timeoutMs = timeoutMs;
    this.expectedPublicationSegment = readTausteFlipsnackPublicationSegment(page.url());
    this.responseListener = (response) => {
      if (!isFlipsnackDataJsonUrl(response.url(), null)) {
        return;
      }

      void response
        .json()
        .then((value: JsonValue) => {
          const dataJson = parseTausteFlipsnackDataJson(value);

          if (isFlipsnackDataJsonUrl(response.url(), this.expectedPublicationSegment)) {
            this.dataJson = dataJson;
            this.dataJsonUrl = response.url();
            return;
          }

          this.fallbackDataJson = dataJson;
          this.fallbackDataJsonUrl = response.url();
        })
        .catch(() => undefined);
    };
    this.page.on('response', this.responseListener);
  }

  async waitForPublicationPlayer(): Promise<void> {
    await this.page.locator('iframe#player-iframe').first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
    await this.playerFrame().locator('img, canvas, [role="button"], button').first().waitFor({
      state: 'visible',
      timeout: this.timeoutMs,
    });
    this.expectedCollectionId = await this.readFlipbookHash();
  }

  getPdfDownloadVisualTarget(): Promise<TausteLeafletVisualTarget> {
    return Promise.resolve(
      this.createVisualTarget(this.pdfDownloadLocator(), 'Tauste PDF download button'),
    );
  }

  async resolvePdfDownloadUrl(): Promise<string> {
    const link = this.pdfDownloadLinkLocator();
    const href =
      (await link.count()) === 0
        ? null
        : await link.getAttribute('href', {
            timeout: Math.min(this.timeoutMs, 5_000),
          });

    if (href === null || href.trim().length === 0) {
      return '';
    }

    return new URL(href, this.page.url()).toString();
  }

  async resolveImageGalleryUrls(): Promise<readonly string[]> {
    const dataJson = await this.waitForDataJson();
    const dataJsonUrl = this.dataJsonUrl;

    if (dataJsonUrl !== null && dataJson.pageIds.length > 0) {
      return createImageGalleryUrls(dataJsonUrl, dataJson);
    }

    return this.readVisibleImageGalleryUrls();
  }

  async downloadImageGalleryUrls(
    imageUrls: readonly string[],
  ): Promise<readonly DownloadedTausteImageGalleryImage[]> {
    const downloadedImages: DownloadedTausteImageGalleryImage[] = [];

    for (const imageUrl of imageUrls) {
      const response = await this.page.request.get(imageUrl, {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          Referer: this.page.url(),
        },
        timeout: this.timeoutMs,
      });

      if (!response.ok()) {
        throw new Error(
          `Failed to download Tauste image page from ${imageUrl}: ${String(response.status())} ${response.statusText()}`,
        );
      }

      const body = await response.body();

      if (body.byteLength === 0) {
        throw new Error(`Downloaded Tauste image page cannot be empty: ${imageUrl}`);
      }

      downloadedImages.push({
        sourceUrl: imageUrl,
        body,
        contentType: parseLeafletImageContentType(
          response.headers()['content-type'] ?? null,
          imageUrl,
        ),
      });
    }

    return downloadedImages;
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(this.page.url());
  }

  async close(): Promise<void> {
    this.page.off('response', this.responseListener);

    if (this.closeOnDone) {
      await this.page.close();
      return;
    }

    if (this.returnUrl !== null) {
      await this.page.goto(this.returnUrl, {
        timeout: this.timeoutMs,
        waitUntil: 'domcontentloaded',
      });
    }
  }

  private pdfDownloadLocator(): Locator {
    return this.pdfDownloadLinkLocator().or(this.pdfDownloadButtonLocator()).first();
  }

  private pdfDownloadLinkLocator(): Locator {
    return this.playerFrame()
      .getByRole('link', { name: /download|baixar|pdf/i })
      .or(this.page.getByRole('link', { name: /download|baixar|pdf/i }))
      .or(this.playerFrame().locator('a[href*=".pdf"], a[href*="download"]'))
      .or(this.page.locator('a[href*=".pdf"], a[href*="download"]'))
      .first();
  }

  private pdfDownloadButtonLocator(): Locator {
    return this.playerFrame()
      .getByRole('button', { name: /download|baixar|pdf/i })
      .or(this.page.getByRole('button', { name: /download|baixar|pdf/i }))
      .first();
  }

  private playerFrame(): FrameLocator {
    return this.page.frameLocator('iframe#player-iframe');
  }

  private async waitForDataJson(): Promise<TausteFlipsnackDataJson> {
    if (this.dataJson !== null) {
      return this.dataJson;
    }

    this.expectedCollectionId = this.expectedCollectionId ?? (await this.readFlipbookHash());
    const response = await this.waitForExpectedDataJsonResponse();

    if (response === null) {
      const fallbackDataJson = this.fallbackDataJson;
      const fallbackDataJsonUrl = this.fallbackDataJsonUrl;

      if (fallbackDataJson === null || fallbackDataJsonUrl === null) {
        return { pageIds: [] };
      }

      this.dataJson = fallbackDataJson;
      this.dataJsonUrl = fallbackDataJsonUrl;

      return fallbackDataJson;
    }

    const value = (await response.json()) as JsonValue;
    const dataJson = parseTausteFlipsnackDataJson(value);
    this.dataJson = dataJson;
    this.dataJsonUrl = response.url();

    return dataJson;
  }

  private async waitForExpectedDataJsonResponse(): Promise<Response | null> {
    const collectionId = this.expectedCollectionId;

    if (
      collectionId !== null &&
      this.fallbackDataJson !== null &&
      this.fallbackDataJsonUrl !== null &&
      isFlipsnackDataJsonUrlForCollection(this.fallbackDataJsonUrl, collectionId)
    ) {
      this.dataJson = this.fallbackDataJson;
      this.dataJsonUrl = this.fallbackDataJsonUrl;

      return null;
    }

    if (collectionId !== null) {
      const collectionResponse = await this.page
        .waitForResponse(
          (candidateResponse) =>
            isFlipsnackDataJsonUrlForCollection(candidateResponse.url(), collectionId),
          {
            timeout: Math.min(this.timeoutMs, 5_000),
          },
        )
        .catch(() => null);

      if (collectionResponse !== null) {
        return collectionResponse;
      }
    }

    if (this.expectedPublicationSegment !== null) {
      const expectedResponse = await this.page
        .waitForResponse(
          (candidateResponse) =>
            isFlipsnackDataJsonUrl(candidateResponse.url(), this.expectedPublicationSegment),
          {
            timeout: Math.min(this.timeoutMs, 5_000),
          },
        )
        .catch(() => null);

      if (expectedResponse !== null) {
        return expectedResponse;
      }
    }

    const response = await this.page
      .waitForResponse(
        (candidateResponse) => isFlipsnackDataJsonUrl(candidateResponse.url(), null),
        {
          timeout: Math.min(this.timeoutMs, 5_000),
        },
      )
      .catch(() => null);

    return response;
  }

  private async readFlipbookHash(): Promise<string | null> {
    const scriptText = await this.page
      .locator('script')
      .evaluateAll((scripts) => scripts.map((script) => script.textContent).join('\n'))
      .catch(() => '');
    const match = /window\.flipbookHash\s*=\s*['"]([^'"]+)['"]/i.exec(scriptText);

    return match?.[1] ?? null;
  }

  private async readVisibleImageGalleryUrls(): Promise<readonly string[]> {
    const urls = await this.playerFrame()
      .locator('img')
      .evaluateAll((images) =>
        images
          .map((image) => {
            const htmlImage = image as HTMLImageElement;

            return htmlImage.currentSrc.length > 0 ? htmlImage.currentSrc : htmlImage.src;
          })
          .filter((url) => /\/collections\/[^/]+\/covers\/[^/]+\/original(?:\?|$)/i.test(url)),
      )
      .catch((): string[] => []);

    return [...new Set(urls)];
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
