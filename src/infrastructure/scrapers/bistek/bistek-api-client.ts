export interface BistekApiClientConfig {
  readonly baseUrl: string;
  readonly fetcher?: typeof fetch;
}

export interface BistekApiSession {
  fetchOffersHtml(): Promise<string>;
  selectStore(storeId: string): Promise<void>;
}

export interface BistekApiSessionFactory {
  createSession(): BistekApiSession;
}

export class BistekApiClient implements BistekApiSessionFactory {
  private readonly baseUrl: string;

  private readonly fetcher: typeof fetch;

  constructor(config: BistekApiClientConfig) {
    this.baseUrl = parseBaseUrl(config.baseUrl);
    this.fetcher = config.fetcher ?? fetch;
  }

  createSession(): BistekApiSession {
    return new FetchBistekApiSession(this.baseUrl, this.fetcher);
  }
}

class FetchBistekApiSession implements BistekApiSession {
  private readonly baseUrl: string;

  private readonly fetcher: typeof fetch;

  private readonly cookies = new Map<string, string>();

  constructor(baseUrl: string, fetcher: typeof fetch) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  async fetchOffersHtml(): Promise<string> {
    const response = await this.fetchSameOrigin('/ofertas', {
      headers: this.createHeaders('text/html,application/xhtml+xml'),
      method: 'GET',
    });
    this.storeCookies(response.headers);

    if (!response.ok) {
      throw new Error(
        `Bistek offers request failed: ${String(response.status)} ${response.statusText}`,
      );
    }

    return response.text();
  }

  async selectStore(storeId: string): Promise<void> {
    if (storeId.trim().length === 0) {
      throw new Error('storeId cannot be blank.');
    }

    const response = await this.fetchSameOrigin(
      `/lojas/loja_selecionada/${encodeURIComponent(storeId)}`,
      {
        headers: this.createHeaders('text/html,application/xhtml+xml,*/*'),
        method: 'POST',
      },
    );
    this.storeCookies(response.headers);

    if (!response.ok) {
      throw new Error(
        `Bistek store selection failed: ${String(response.status)} ${response.statusText}`,
      );
    }
  }

  private fetchSameOrigin(path: string, init: RequestInit): Promise<Response> {
    return this.fetcher(new URL(path, this.baseUrl), init);
  }

  private createHeaders(accept: string): Headers {
    const headers = new Headers({
      Accept: accept,
      Referer: `${this.baseUrl}/ofertas`,
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    });
    const cookie = this.cookieHeader();

    if (cookie.length > 0) {
      headers.set('Cookie', cookie);
    }

    return headers;
  }

  private storeCookies(headers: Headers): void {
    for (const setCookie of readSetCookieHeaders(headers)) {
      const pair = setCookie.split(';', 1)[0]?.trim() ?? '';
      const separatorIndex = pair.indexOf('=');

      if (separatorIndex <= 0) {
        continue;
      }

      this.cookies.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
    }
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

function readSetCookieHeaders(headers: Headers): readonly string[] {
  return headers.getSetCookie();
}

function parseBaseUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('baseUrl must be absolute and valid.');
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(
      'baseUrl must be an absolute http(s) URL without credentials, query, or fragment.',
    );
  }

  return url.toString().replace(/\/+$/, '');
}
