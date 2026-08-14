import { describe, expect, it, vi } from 'vitest';
import { BistekApiClient } from './bistek-api-client';

describe('BistekApiClient', () => {
  it('keeps session cookies while fetching offers and selecting a store', async () => {
    const fetcher = new FixtureFetch([
      new Response('<html>initial</html>', {
        headers: {
          'set-cookie': 'invalid-cookie; path=/, CAKEPHP=session-1; path=/',
        },
      }),
      new Response('', {
        headers: {
          'set-cookie': 'bistek[loja_selecionada]=2; path=/',
        },
      }),
      new Response('<html>selected</html>'),
    ]);
    const session = new BistekApiClient({
      baseUrl: 'https://institucional.bistek.com.br/',
      fetcher: fetcher.fetch,
    }).createSession();

    await expect(session.fetchOffersHtml()).resolves.toBe('<html>initial</html>');
    await session.selectStore('2');
    await expect(session.fetchOffersHtml()).resolves.toBe('<html>selected</html>');

    expect(fetcher.requests.map((request) => [request.method, request.url])).toEqual([
      ['GET', 'https://institucional.bistek.com.br/ofertas'],
      ['POST', 'https://institucional.bistek.com.br/lojas/loja_selecionada/2'],
      ['GET', 'https://institucional.bistek.com.br/ofertas'],
    ]);
    expect(fetcher.requests[1]?.cookie).toContain('CAKEPHP=session-1');
    expect(fetcher.requests[2]?.cookie).toContain('bistek[loja_selecionada]=2');
  });

  it('rejects invalid config, blank store ids, and non-success responses', async () => {
    expect(() => new BistekApiClient({ baseUrl: 'not-a-url' })).toThrow(
      'baseUrl must be absolute and valid.',
    );
    expect(() => new BistekApiClient({ baseUrl: 'https://user@example.com' })).toThrow(
      'baseUrl must be an absolute http(s) URL without credentials, query, or fragment.',
    );

    const failedOffersSession = new BistekApiClient({
      baseUrl: 'https://institucional.bistek.com.br',
      fetcher: new FixtureFetch([
        new Response('failed', {
          status: 503,
          statusText: 'Unavailable',
        }),
      ]).fetch,
    }).createSession();
    await expect(failedOffersSession.fetchOffersHtml()).rejects.toThrow(
      'Bistek offers request failed: 503 Unavailable',
    );

    const failedSelectionSession = new BistekApiClient({
      baseUrl: 'https://institucional.bistek.com.br',
      fetcher: new FixtureFetch([
        new Response('failed', {
          status: 500,
          statusText: 'Error',
        }),
      ]).fetch,
    }).createSession();
    await expect(failedSelectionSession.selectStore(' ')).rejects.toThrow(
      'storeId cannot be blank.',
    );
    await expect(failedSelectionSession.selectStore('2')).rejects.toThrow(
      'Bistek store selection failed: 500 Error',
    );
  });

  it('uses the global fetch implementation by default', async () => {
    const fetcher = new FixtureFetch([new Response('<html>default fetch</html>')]);
    vi.stubGlobal('fetch', fetcher.fetch);

    try {
      const session = new BistekApiClient({
        baseUrl: 'https://institucional.bistek.com.br',
      }).createSession();

      await expect(session.fetchOffersHtml()).resolves.toBe('<html>default fetch</html>');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly cookie: string | null;
}

class FixtureFetch {
  readonly requests: RecordedRequest[] = [];

  private readonly responses: Response[];

  constructor(responses: Response[]) {
    this.responses = responses;
  }

  readonly fetch: typeof fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const headers = new Headers(init?.headers);
    this.requests.push({
      url,
      method: init?.method ?? 'GET',
      cookie: headers.get('Cookie'),
    });
    const response = this.responses.shift();

    if (response === undefined) {
      throw new Error(`Missing fixture response for ${url}.`);
    }

    return Promise.resolve(response);
  };
}
