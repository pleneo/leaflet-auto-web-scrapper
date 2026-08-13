import { describe, expect, it, vi } from 'vitest';
import {
  CoopApiClient,
  parseCoopLeafletCards,
  parseCoopLeafletImageUrls,
  parseCoopPageTitle,
  parseCoopStorePageLinks,
} from './coop-api-client';
import { listCoopMonitoredStores } from './coop-targets';

describe('CoopApiClient', () => {
  it('fetches same-origin HTML', async () => {
    const fetcher = createHtmlFetcher('<html>ok</html>');
    const client = new CoopApiClient({
      baseUrl: 'https://www.cooper.coop.br/',
      fetcher,
    });

    await expect(client.fetchHtml('/ofertas')).resolves.toBe('<html>ok</html>');
    expect(getFetchUrl(fetcher, 0)).toBe('https://www.cooper.coop.br/ofertas');
  });

  it('uses global fetch when no fetcher is provided', async () => {
    const originalFetch = globalThis.fetch;
    const fetcher = createHtmlFetcher('<html>global</html>');
    globalThis.fetch = fetcher;

    try {
      const client = new CoopApiClient({
        baseUrl: 'https://www.cooper.coop.br/',
      });

      await expect(client.fetchHtml('/ofertas')).resolves.toBe('<html>global</html>');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('parses monitored store links from the offers page', () => {
    const links = parseCoopStorePageLinks(
      'https://www.cooper.coop.br/ofertas',
      `
        <a title="AGUA VERDE" href="https://www.cooper.coop.br/ofertas/blumenau/agua-verde">
          <span>cooper super</span> AGUA VERDE
        </a>
        <a title="JOINVILLE" href="https://www.cooper.coop.br/ofertas/atacarejo-joinville/">
          <span>COOPER ATACAREJO</span> BOA VISTA
        </a>
        <a href="">Blank</a>
        <a href="https://example.com/ofertas/atacarejo-joinville/">External</a>
        <a href="http://[broken">Broken</a>
        <a>No href</a>
      `,
      listCoopMonitoredStores(),
    );

    expect(links).toEqual([
      {
        storeSlug: 'coop-super-agua-verde',
        href: 'https://www.cooper.coop.br/ofertas/blumenau/agua-verde',
        text: 'cooper super AGUA VERDE',
      },
      {
        storeSlug: 'coop-atacarejo-boa-vista',
        href: 'https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
        text: 'COOPER ATACAREJO BOA VISTA',
      },
    ]);
  });

  it('parses Coop magazine cards from final store pages', () => {
    const cards = parseCoopLeafletCards(
      'https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
      `
        <div class="ofertas">
          <a href="https://www.cooper.coop.br/revista/?id=TkRVeU9UYz1UZEY=" title="atacarejo semanal">
            <h3>atacarejo semanal</h3>
            <img src="/image/30539/250/0/atacarejo-semanal.jpg" alt="atacarejo semanal" />
          </a>
        </div>
        <div class="ofertas">
          <a href="/revista/?id=TkRVeU9UYz1UZEY=" title="duplicado">
            <h3>duplicado</h3>
          </a>
        </div>
        <div class="ofertas">
          <a href="/noticias" title="ignore"><h3>Ignore</h3></a>
        </div>
        <div class="ofertas">
          <a href="https://example.com/revista/?id=x"><h3>External</h3></a>
        </div>
        <div class="ofertas">
          <a href="/revista/"><h3>Especial Café</h3></a>
        </div>
        <div class="ofertas">
          <a href="/revista/?blank-title=1"><h3>!!!</h3></a>
        </div>
        <div class="ofertas">
          <a href=/revista/?no-heading=1>Apenas texto</a>
        </div>
        <div class="ofertas">
          <a href="http://[broken"><h3>Broken</h3></a>
        </div>
        <div class="ofertas">
          <a>No href</a>
        </div>
        <div class="voltar_ofertas"></div>
      `,
    );

    expect(cards).toEqual([
      {
        leafletId: 'coop-tkrveu9uyz1uzey',
        title: 'atacarejo semanal',
        href: 'https://www.cooper.coop.br/revista/?id=TkRVeU9UYz1UZEY=',
        sourcePageUrl: 'https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
        validUntilIso: null,
        cardIndex: 0,
      },
      {
        leafletId: 'coop-especial-cafe',
        title: 'Especial Café',
        href: 'https://www.cooper.coop.br/revista/',
        sourcePageUrl: 'https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
        validUntilIso: null,
        cardIndex: 1,
      },
      {
        leafletId: 'coop-leaflet',
        title: '!!!',
        href: 'https://www.cooper.coop.br/revista/?blank-title=1',
        sourcePageUrl: 'https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
        validUntilIso: null,
        cardIndex: 2,
      },
      {
        leafletId: 'coop-apenas-texto',
        title: 'Apenas texto',
        href: 'https://www.cooper.coop.br/revista/?no-heading=1',
        sourcePageUrl: 'https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
        validUntilIso: null,
        cardIndex: 3,
      },
    ]);
  });

  it('parses Coop leaflet image URLs from thumbnails and JavaScript fallback', () => {
    expect(
      parseCoopLeafletImageUrls(
        'https://www.cooper.coop.br/revista/?id=x',
        `
          <img src="imagens/5033/1.jpg" class="page-1">
          <img src="imagens/5033/2.jpg" class="page-2">
          <img src="../image/favicon.png">
          <img src="http://[broken">
          <img src="mailto:test@example.com">
          <img>
        `,
      ),
    ).toEqual([
      'https://www.cooper.coop.br/revista/imagens/5033/1.jpg',
      'https://www.cooper.coop.br/revista/imagens/5033/2.jpg',
    ]);

    expect(
      parseCoopLeafletImageUrls(
        'https://www.cooper.coop.br/revista/?id=x',
        `
          <script>
            $('.magazine').turn({
              pages: 2,
            });
            var pasta = 'imagens/5040';
          </script>
        `,
      ),
    ).toEqual([
      'https://www.cooper.coop.br/revista/imagens/5040/1.jpg',
      'https://www.cooper.coop.br/revista/imagens/5040/2.jpg',
    ]);
  });

  it('parses page titles and rejects invalid inputs', async () => {
    expect(parseCoopPageTitle('<h1>Revista <strong>Coop</strong></h1>', '/x')).toBe('Revista Coop');
    expect(parseCoopPageTitle('<h2>OFERTAS PARA: AGUA VERDE</h2>', '/x')).toBe(
      'OFERTAS PARA: AGUA VERDE',
    );
    expect(parseCoopPageTitle('<title>Ofertas &amp; Coop</title>', '/x')).toBe('Ofertas & Coop');
    expect(parseCoopPageTitle('<title>&#65;&#x42; &quot;Coop&#039;</title>', '/x')).toBe(
      'AB "Coop\'',
    );
    expect(parseCoopPageTitle('<html></html>', 'https://site/revista/')).toBe('revista');
    expect(parseCoopPageTitle('<html></html>', 'https://site/')).toBe('leaflet');

    expect(() => parseCoopStorePageLinks('', '<a></a>', [])).toThrow(
      'offersPageUrl cannot be blank.',
    );
    expect(() => parseCoopStorePageLinks('https://www.cooper.coop.br/ofertas', ' ', [])).toThrow(
      'html cannot be blank.',
    );
    expect(() => parseCoopLeafletCards('', '<div></div>')).toThrow('storePageUrl cannot be blank.');
    expect(() => parseCoopLeafletImageUrls('', '<img src="imagens/1/1.jpg">')).toThrow(
      'leafletPageUrl cannot be blank.',
    );
    expect(() =>
      parseCoopLeafletImageUrls('https://www.cooper.coop.br/revista/?id=x', ' '),
    ).toThrow('html cannot be blank.');

    expect(() => new CoopApiClient({ baseUrl: 'invalid' })).toThrow(
      'baseUrl must be absolute and valid.',
    );
    expect(() => new CoopApiClient({ baseUrl: 'ftp://example.com' })).toThrow(
      'baseUrl must be an absolute http(s) URL without credentials, query, or fragment.',
    );

    const client = new CoopApiClient({
      baseUrl: 'https://www.cooper.coop.br/',
      fetcher: createHtmlFetcher(''),
    });
    await expect(client.fetchHtml('https://example.com/ofertas')).rejects.toThrow(
      'url must belong to the configured Coop origin.',
    );
    await expect(client.fetchHtml('http://[broken')).rejects.toThrow(
      'url must be absolute and valid.',
    );
  });

  it('rejects HTTP failures', async () => {
    const client = new CoopApiClient({
      baseUrl: 'https://www.cooper.coop.br/',
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response('', {
          status: 503,
          statusText: 'Unavailable',
        }),
      ),
    });

    await expect(client.fetchHtml('/ofertas')).rejects.toThrow(
      'Coop page request failed: 503 Unavailable',
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
