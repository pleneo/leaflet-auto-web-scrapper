import { chromium, type Browser, type Page } from 'playwright';
import type {
  SuperDoPovoBooklet,
  SuperDoPovoBookletProvider,
  SuperDoPovoShop,
  SuperDoPovoShopCatalogProvider,
} from './superdopovo-api-types';
import {
  parseSuperDoPovoBookletResponse,
  parseSuperDoPovoShopResponse,
  type SuperDoPovoBookletResponse,
  type SuperDoPovoShopResponse,
} from './superdopovo-api-client';

export interface PlaywrightSuperDoPovoApiClientConfig {
  readonly bootstrapUrl: string;
  readonly apiBaseUrl: string;
  readonly timeoutMs: number;
}

interface BrowserApiSession {
  readonly browser: Browser;
  readonly page: Page;
  readonly authorizationHeader: string;
}

export class PlaywrightSuperDoPovoApiClient
  implements SuperDoPovoShopCatalogProvider, SuperDoPovoBookletProvider
{
  private readonly bootstrapUrl: string;

  private readonly apiBaseUrl: string;

  private readonly timeoutMs: number;

  private session: BrowserApiSession | null = null;

  constructor(config: PlaywrightSuperDoPovoApiClientConfig) {
    this.bootstrapUrl = config.bootstrapUrl;
    this.apiBaseUrl = config.apiBaseUrl.replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs;
  }

  async listShops(): Promise<readonly SuperDoPovoShop[]> {
    const response = await this.fetchJsonArray<SuperDoPovoShopResponse>('/shops/addresses');

    return response.map(parseSuperDoPovoShopResponse);
  }

  async listBooklets(shopId: number): Promise<readonly SuperDoPovoBooklet[]> {
    validatePositiveInteger(shopId, 'shopId');
    const response = await this.fetchJsonArray<SuperDoPovoBookletResponse>(
      `/booklets/${String(shopId)}`,
    );

    return response.map((booklet) => parseSuperDoPovoBookletResponse(booklet, shopId));
  }

  async close(): Promise<void> {
    if (this.session === null) {
      return;
    }

    await this.session.browser.close();
    this.session = null;
  }

  private async fetchJsonArray<TResponse>(path: string): Promise<readonly TResponse[]> {
    const session = await this.ensureSession();
    const url = `${this.apiBaseUrl}${path}`;
    const payload = await session.page.evaluate(
      async (input): Promise<readonly TResponse[]> => {
        const response = await fetch(input.url, {
          headers: {
            Accept: 'application/json',
            Authorization: input.authorizationHeader,
          },
        });

        if (!response.ok) {
          throw new Error(
            `Super do Povo browser request failed: ${String(response.status)} ${response.statusText}`,
          );
        }

        const json = (await response.json()) as readonly TResponse[];

        if (Object.prototype.toString.call(json) !== '[object Array]') {
          throw new Error(`Expected Super do Povo response at ${input.path} to be an array.`);
        }

        return json;
      },
      {
        url,
        path,
        authorizationHeader: session.authorizationHeader,
      },
    );

    return payload;
  }

  private async ensureSession(): Promise<BrowserApiSession> {
    if (this.session !== null) {
      return this.session;
    }

    const browser = await chromium.launch({
      headless: true,
    });
    const page = await browser.newPage();

    try {
      const authorizationRequest = page.waitForRequest(
        (request) =>
          request.url().includes('/api/v1/') &&
          request.headers()['authorization']?.startsWith('Bearer ') === true,
        {
          timeout: this.timeoutMs,
        },
      );

      await page.goto(this.bootstrapUrl, {
        timeout: this.timeoutMs,
        waitUntil: 'domcontentloaded',
      });

      const request = await authorizationRequest;
      const authorizationHeader = request.headers()['authorization'];

      if (authorizationHeader === undefined) {
        throw new Error('Super do Povo authorization header was not captured.');
      }

      this.session = {
        browser,
        page,
        authorizationHeader,
      };

      return this.session;
    } catch (error) {
      await browser.close();
      throw error;
    }
  }
}

function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
}
