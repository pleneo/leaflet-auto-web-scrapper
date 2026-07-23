import { chromium } from 'playwright';
import type { SuperDoPovoAuthTokenProvider } from './superdopovo-api-client';

export interface PlaywrightSuperDoPovoAuthTokenProviderConfig {
  readonly bootstrapUrl: string;
  readonly timeoutMs: number;
}

export class PlaywrightSuperDoPovoAuthTokenProvider implements SuperDoPovoAuthTokenProvider {
  private readonly bootstrapUrl: string;

  private readonly timeoutMs: number;

  private authorizationHeader: string | null = null;

  constructor(config: PlaywrightSuperDoPovoAuthTokenProviderConfig) {
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

      const request = await authorizationHeaderPromise;
      const authorizationHeader = request.headers()['authorization'];

      if (authorizationHeader === undefined) {
        throw new Error('Super do Povo authorization header was not captured.');
      }

      this.authorizationHeader = authorizationHeader;
      return authorizationHeader;
    } finally {
      await browser.close();
    }
  }
}
