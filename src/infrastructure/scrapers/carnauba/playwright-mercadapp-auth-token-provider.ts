import { chromium } from 'playwright';
import type { MercadappAuthTokenProvider } from './mercadapp-api-client';

export interface PlaywrightMercadappAuthTokenProviderConfig {
  readonly bootstrapUrl: string;
  readonly timeoutMs: number;
}

export class PlaywrightMercadappAuthTokenProvider implements MercadappAuthTokenProvider {
  private readonly bootstrapUrl: string;

  private readonly timeoutMs: number;

  private authorizationHeader: string | null = null;

  constructor(config: PlaywrightMercadappAuthTokenProviderConfig) {
    this.bootstrapUrl = config.bootstrapUrl;
    this.timeoutMs = config.timeoutMs;
  }

  async getAuthorizationHeader(): Promise<string> {
    if (this.authorizationHeader !== null) {
      return this.authorizationHeader;
    }

    const browser = await chromium.launch({
      headless: true,
    });
    const page = await browser.newPage();

    try {
      const authorizationHeaderPromise = page.waitForRequest(
        (request) =>
          request.url().includes('merconnect.mercadapp.com.br/mapp/v2/markets?brand_id=') &&
          request.headers()['authorization']?.startsWith('Bearer ') === true,
        {
          timeout: this.timeoutMs,
        },
      );

      await page.goto(this.bootstrapUrl, {
        timeout: this.timeoutMs,
        waitUntil: 'domcontentloaded',
      });

      const request = await authorizationHeaderPromise;
      const authorizationHeader = request.headers()['authorization'];

      if (authorizationHeader === undefined) {
        throw new Error('Mercadapp authorization header was not captured.');
      }

      this.authorizationHeader = authorizationHeader;
      return authorizationHeader;
    } finally {
      await browser.close();
    }
  }
}
