import { describe, expect, it, vi } from 'vitest';
import {
  ComboAtacadistaApiClient,
  parseComboAtacadistaLeafletCards,
  parseComboAtacadistaLeafletImageUrls,
  parseComboAtacadistaPageTitle,
} from './combo-atacadista-api-client';

describe('ComboAtacadistaApiClient', () => {
  it('fetches same-origin HTML', async () => {
    const fetcher = createHtmlFetcher('<html>ok</html>');
    const client = new ComboAtacadistaApiClient({
      baseUrl: 'https://www.comboatacadista.com.br/',
      fetcher,
    });

    await expect(client.fetchHtml('/ofertas')).resolves.toBe('<html>ok</html>');
    expect(getFetchUrl(fetcher, 0)).toBe('https://www.comboatacadista.com.br/ofertas');
  });

  it('uses global fetch when no fetcher is provided', async () => {
    const originalFetch = globalThis.fetch;
    const fetcher = createHtmlFetcher('<html>global</html>');
    globalThis.fetch = fetcher;

    try {
      const client = new ComboAtacadistaApiClient({
        baseUrl: 'https://www.comboatacadista.com.br/',
      });

      await expect(client.fetchHtml('/ofertas')).resolves.toBe('<html>global</html>');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('parses all offer cards without hardcoded leaflet links', () => {
    const cards = parseComboAtacadistaLeafletCards(
      'https://www.comboatacadista.com.br/ofertas',
      `
        <div class="col-md-4 tag-green item-topic">
          <h2>Ofertas do dia</h2>
          <span class="date">Válido até 13/08/2026</span>
          <p>Confira as ofertas.</p>
          <a href="/ofertas-dia">Ver ofertas</a>
        </div>
        <div class="col-md-4 tag-green item-topic">
          <h2>Encarte Combo</h2>
          <a href="/ofertascombo#top">Ver ofertas</a>
        </div>
        <div class="item-topic">
          <h2>Duplicado</h2>
          <a href="/ofertas-dia">Ver ofertas</a>
        </div>
        <div class="item-topic">
          <h2>Ignore</h2>
          <a href="/noticias">Ler mais</a>
        </div>
        <div class="item-topic">
          <h2>Broken</h2>
          <a href="http://[broken">Ver ofertas</a>
        </div>
        <div class="item-topic">
          <h2>External</h2>
          <a href="https://example.com/ofertas">Ver ofertas</a>
        </div>
        <div class="item-topic">
          <h2>No href</h2>
          <a>Ver ofertas</a>
        </div>
        <div class="item-topic">
          <h2>No anchor</h2>
          <p>Ver ofertas</p>
        </div>
        <div class="item-topic">
          <h2>Blank href</h2>
          <a href="">Ver ofertas</a>
        </div>
        <div class="item-topic">
          <h2>Root</h2>
          <a href="/">Ver ofertas</a>
        </div>
      `,
    );

    expect(cards).toEqual([
      {
        leafletId: 'comboatacadista-ofertas-dia',
        title: 'Ofertas do dia',
        href: 'https://www.comboatacadista.com.br/ofertas-dia',
        sourcePageUrl: 'https://www.comboatacadista.com.br/ofertas',
        validUntilIso: '2026-08-13',
        cardIndex: 0,
      },
      {
        leafletId: 'comboatacadista-ofertascombo',
        title: 'Encarte Combo',
        href: 'https://www.comboatacadista.com.br/ofertascombo',
        sourcePageUrl: 'https://www.comboatacadista.com.br/ofertas',
        validUntilIso: null,
        cardIndex: 1,
      },
      {
        leafletId: 'comboatacadista-leaflet',
        title: 'Root',
        href: 'https://www.comboatacadista.com.br/',
        sourcePageUrl: 'https://www.comboatacadista.com.br/ofertas',
        validUntilIso: null,
        cardIndex: 2,
      },
    ]);
  });

  it('falls back to URL titles when card headings are blank and reads unquoted hrefs', () => {
    const cards = parseComboAtacadistaLeafletCards(
      'https://www.comboatacadista.com.br/ofertas',
      `
        <div class="item-topic">
          <h2>   </h2>
          <a href=/ofertas-especiais>Ver ofertas</a>
        </div>
      `,
    );

    expect(cards).toEqual([
      {
        leafletId: 'comboatacadista-ofertas-especiais',
        title: 'ofertas especiais',
        href: 'https://www.comboatacadista.com.br/ofertas-especiais',
        sourcePageUrl: 'https://www.comboatacadista.com.br/ofertas',
        validUntilIso: null,
        cardIndex: 0,
      },
    ]);
  });

  it('parses original gallery image URLs and falls back to leaflet image tags', () => {
    expect(
      parseComboAtacadistaLeafletImageUrls(
        'https://www.comboatacadista.com.br/ofertas-dia',
        `
          <a href="upload/weekend_image/pagina-1.jpeg" itemprop="contentUrl">
            <img src="/slir/w100/upload/weekend_image/pagina-1.jpeg" itemprop="thumbnail">
          </a>
          <a itemprop="contentUrl"></a>
          <a itemprop="contentUrl" href="/upload/weekend_image/pagina-2.png"></a>
          <a itemprop="contentUrl" href="/upload/weekend_image/pagina-2.png"></a>
        `,
      ),
    ).toEqual([
      'https://www.comboatacadista.com.br/upload/weekend_image/pagina-1.jpeg',
      'https://www.comboatacadista.com.br/upload/weekend_image/pagina-2.png',
    ]);

    expect(
      parseComboAtacadistaLeafletImageUrls(
        'https://www.comboatacadista.com.br/ofertascombo',
        `
          <img data-src="/upload/offer_image/pagina-1.webp">
          <img data-lazy-src="/upload/offer_image/pagina-2.jpg">
          <img>
          <img src="/img/logotipo-combo.png">
          <img src="http://[broken">
          <img src="mailto:test@example.com">
        `,
      ),
    ).toEqual([
      'https://www.comboatacadista.com.br/upload/offer_image/pagina-1.webp',
      'https://www.comboatacadista.com.br/upload/offer_image/pagina-2.jpg',
    ]);
  });

  it('parses page titles and rejects invalid inputs', async () => {
    expect(parseComboAtacadistaPageTitle('<h1>Encarte <strong>Combo</strong></h1>', '/x')).toBe(
      'Encarte Combo',
    );
    expect(parseComboAtacadistaPageTitle('<title>Ofertas &amp; Combo</title>', '/x')).toBe(
      'Ofertas & Combo',
    );
    expect(
      parseComboAtacadistaPageTitle('<title>&#65;&#x42; &quot;Combo&#039;</title>', '/x'),
    ).toBe('AB "Combo\'');
    expect(parseComboAtacadistaPageTitle('<html></html>', 'https://site/ofertas-dia')).toBe(
      'ofertas dia',
    );
    expect(parseComboAtacadistaPageTitle('<html></html>', 'https://site/')).toBe(
      'Combo Atacadista',
    );
    expect(
      parseComboAtacadistaLeafletCards(
        'https://www.comboatacadista.com.br/ofertas',
        '<div class="item-topic"><h2>Sem data</h2><span class="date">Válido esta semana</span><a href="/x">Ver ofertas</a></div>',
      )[0]?.validUntilIso,
    ).toBeNull();
    expect(() => parseComboAtacadistaLeafletCards('', '<div></div>')).toThrow(
      'offersPageUrl cannot be blank.',
    );
    expect(() =>
      parseComboAtacadistaLeafletImageUrls('', '<img src="/upload/offer_image/pagina.png">'),
    ).toThrow('leafletPageUrl cannot be blank.');
    expect(() =>
      parseComboAtacadistaLeafletImageUrls('https://www.comboatacadista.com.br/ofertas', ' '),
    ).toThrow('html cannot be blank.');

    expect(() => new ComboAtacadistaApiClient({ baseUrl: 'invalid' })).toThrow(
      'baseUrl must be absolute and valid.',
    );
    expect(() => new ComboAtacadistaApiClient({ baseUrl: 'ftp://example.com' })).toThrow(
      'baseUrl must be an absolute http(s) URL without credentials, query, or fragment.',
    );

    const client = new ComboAtacadistaApiClient({
      baseUrl: 'https://www.comboatacadista.com.br/',
      fetcher: createHtmlFetcher(''),
    });
    await expect(client.fetchHtml('https://example.com/ofertas')).rejects.toThrow(
      'url must belong to the configured Combo Atacadista origin.',
    );
    await expect(client.fetchHtml('http://[broken')).rejects.toThrow(
      'url must be absolute and valid.',
    );
  });

  it('rejects HTTP failures', async () => {
    const client = new ComboAtacadistaApiClient({
      baseUrl: 'https://www.comboatacadista.com.br/',
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response('', {
          status: 503,
          statusText: 'Unavailable',
        }),
      ),
    });

    await expect(client.fetchHtml('/ofertas')).rejects.toThrow(
      'Combo Atacadista page request failed: 503 Unavailable',
    );
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
