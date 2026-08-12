import { describe, expect, it, vi } from 'vitest';
import { AngeloniApiClient, parseAngeloniRegionLeaflets } from './angeloni-api-client';

describe('AngeloniApiClient', () => {
  it('fetches regional HTML and extracts unique PDF leaflets', async () => {
    const fetcher = createHtmlFetcher(`
      <a class="elementor-button" href="https://statics.angeloni.com.br/encartes/Tematica/SemanalAngeloni_SC34.pdf">
        <span class="elementor-button-text">Semanal Angeloni SC 34</span>
      </a>
      <a href="http://statics.angeloni.com.br/encartes/Tematica/SemanalAngeloni_SC34.pdf">
        <span class="elementor-button-text">Duplicate</span>
      </a>
      <a href="https://statics.angeloni.com.br/encartes/Tematica/lamina_clienteSC.pdf">
        <span class="elementor-button-text">Lâmina Cliente SC</span>
      </a>
    `);
    const client = new AngeloniApiClient({
      baseUrl: 'https://encartes.angeloni.com.br/',
      fetcher,
    });

    await expect(
      client.listRegionLeaflets({
        regionUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
      }),
    ).resolves.toEqual([
      {
        leafletId: 'angeloni-encartes-tematica-semanalangeloni-sc34',
        title: 'Semanal Angeloni SC 34',
        pdfUrl: 'https://statics.angeloni.com.br/encartes/Tematica/SemanalAngeloni_SC34.pdf',
        sourcePageUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
      },
      {
        leafletId: 'angeloni-encartes-tematica-lamina-clientesc',
        title: 'Lâmina Cliente SC',
        pdfUrl: 'https://statics.angeloni.com.br/encartes/Tematica/lamina_clienteSC.pdf',
        sourcePageUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
      },
    ]);
    expect(getFetchUrl(fetcher, 0)).toBe(
      'https://encartes.angeloni.com.br/regiao-florianopolis/',
    );
  });

  it('parses fallback titles from PDF filenames and decodes HTML entities', () => {
    const leaflets = parseAngeloniRegionLeaflets(
      'https://encartes.angeloni.com.br/regiao-florianopolis/',
      `
        <a href="/downloads/Ofertas%20Angeloni.pdf"></a>
        <a href="https://statics.angeloni.com.br/encartes/Bazar/BlackFridayAngeloni.pdf">
          Ofertas &amp; Bazar &#8211; SC
        </a>
      `,
    );

    expect(leaflets).toEqual([
      {
        leafletId: 'angeloni-downloads-ofertas-angeloni',
        title: 'Ofertas Angeloni',
        pdfUrl: 'https://encartes.angeloni.com.br/downloads/Ofertas%20Angeloni.pdf',
        sourcePageUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
      },
      {
        leafletId: 'angeloni-encartes-bazar-blackfridayangeloni',
        title: 'Ofertas & Bazar – SC',
        pdfUrl: 'https://statics.angeloni.com.br/encartes/Bazar/BlackFridayAngeloni.pdf',
        sourcePageUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
      },
    ]);
  });

  it('ignores malformed, non-http, and non-PDF hrefs', () => {
    const leaflets = parseAngeloniRegionLeaflets(
      'https://encartes.angeloni.com.br/regiao-florianopolis/',
      `
        <a href="nota-fiscal.html">HTML</a>
        <a href="mailto:test@example.com">Email</a>
        <a href="https://statics.angeloni.com.br/encartes/image.png">Image</a>
        <a href="">Blank</a>
        <a href="https://statics.angeloni.com.br/encartes/Oferta.pdf#page=1">PDF</a>
      `,
    );

    expect(leaflets).toEqual([
      {
        leafletId: 'angeloni-encartes-oferta',
        title: 'PDF',
        pdfUrl: 'https://statics.angeloni.com.br/encartes/Oferta.pdf',
        sourcePageUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
      },
    ]);
  });

  it('rejects invalid constructor and query URLs', async () => {
    expect(() => new AngeloniApiClient({ baseUrl: 'invalid-url' })).toThrow(
      'baseUrl must be absolute and valid.',
    );
    expect(() => new AngeloniApiClient({ baseUrl: 'ftp://encartes.angeloni.com.br' })).toThrow(
      'baseUrl must be an absolute http(s) URL without credentials, query, or fragment.',
    );
    expect(
      () => new AngeloniApiClient({ baseUrl: 'https://user@encartes.angeloni.com.br' }),
    ).toThrow('baseUrl must be an absolute http(s) URL without credentials, query, or fragment.');
    expect(
      () => new AngeloniApiClient({ baseUrl: 'https://encartes.angeloni.com.br?debug=1' }),
    ).toThrow('baseUrl must be an absolute http(s) URL without credentials, query, or fragment.');

    const client = new AngeloniApiClient({
      baseUrl: 'https://encartes.angeloni.com.br/',
      fetcher: createHtmlFetcher('<a href="/oferta.pdf">Oferta</a>'),
    });

    await expect(client.listRegionLeaflets({ regionUrl: ' ' })).rejects.toThrow(
      'regionUrl cannot be blank.',
    );
    await expect(client.listRegionLeaflets({ regionUrl: 'invalid-url' })).rejects.toThrow(
      'regionUrl must be absolute and valid.',
    );
    await expect(
      client.listRegionLeaflets({ regionUrl: 'https://example.com/regiao-florianopolis/' }),
    ).rejects.toThrow('regionUrl must belong to the configured Angeloni origin.');
  });

  it('rejects regional page HTTP failures and blank parser inputs', async () => {
    const client = new AngeloniApiClient({
      baseUrl: 'https://encartes.angeloni.com.br/',
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response('', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      ),
    });

    await expect(
      client.listRegionLeaflets({
        regionUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
      }),
    ).rejects.toThrow('Angeloni region page request failed: 503 Service Unavailable');
    expect(() => parseAngeloniRegionLeaflets('', '<a href="/oferta.pdf">Oferta</a>')).toThrow(
      'sourcePageUrl cannot be blank.',
    );
    expect(() =>
      parseAngeloniRegionLeaflets(
        'https://encartes.angeloni.com.br/regiao-florianopolis/',
        ' ',
      ),
    ).toThrow('html cannot be blank.');
  });
});

function createHtmlFetcher(html: string): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
    }),
  );
}

function getFetchUrl(fetcher: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number): string {
  const request = fetcher.mock.calls[callIndex]?.[0];

  if (request instanceof URL) {
    return request.toString();
  }

  if (request instanceof Request) {
    return request.url;
  }

  if (typeof request === 'string') {
    return request;
  }

  throw new Error('Missing fetch call.');
}
