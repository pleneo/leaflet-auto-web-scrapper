import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AssaiOfferCatalogError,
  FetchAssaiOfferCatalogClient,
  findAssaiCatalogStore,
  listAssaiLeafletsForStore,
  parseAssaiOfferCatalogResponse,
} from './assai-offer-catalog';
import type { AssaiMonitoredStore } from './assai-targets';

describe('Assai offer catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses stores and deduplicated leaflet images', () => {
    const catalog = parseAssaiOfferCatalogResponse({
      lojas: [
        {
          loja_id: 10,
          tid: 20,
          nid: 30,
          name: 'Assaí Parangaba',
          url: '/ofertas/ceara/assai-parangaba',
        },
      ],
      ofertas: [
        {
          id: 100,
          id_oferta: 200,
          title: 'Jornal de Ofertas 1',
          start_date: '2026-07-20',
          end_date: '2026-07-23',
          lojas: [{ loja_id: 10, tid: 20, nid: 30 }],
          images: [
            { url: 'https://cdn.example/page-1.jpeg' },
            { url: 'https://cdn.example/page-1.jpeg' },
          ],
        },
      ],
    });

    expect(catalog.stores).toEqual([
      {
        lojaId: 10,
        tid: 20,
        nid: 30,
        name: 'Assaí Parangaba',
        offerUrlPath: '/ofertas/ceara/assai-parangaba',
        storeSlug: 'assai-parangaba',
      },
    ]);
    expect(catalog.leaflets[0]?.imageUrls).toEqual(['https://cdn.example/page-1.jpeg']);
  });

  it('finds the catalog store for a monitored target and lists assigned leaflets', () => {
    const target: AssaiMonitoredStore = {
      stateCode: 'CE',
      stateName: 'Ceara',
      cityName: 'Fortaleza',
      storeSlug: 'assai-parangaba',
      storeName: 'Assai Atacadista Parangaba',
      initialPageUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
    };
    const catalog = parseAssaiOfferCatalogResponse({
      lojas: [
        {
          loja_id: 10,
          tid: 20,
          nid: 30,
          name: 'Assaí Parangaba',
          url: '/ofertas/ceara/assai-parangaba',
        },
      ],
      ofertas: [
        {
          id: 100,
          title: 'Jornal de Ofertas 1',
          lojas: [{ loja_id: 10 }],
          images: [{ url: 'https://cdn.example/page-1.jpeg' }],
        },
        {
          id: 101,
          title: 'Jornal de Ofertas 2',
          lojas: [{ loja_id: 99 }],
          images: [{ url: 'https://cdn.example/page-2.jpeg' }],
        },
      ],
    });

    const store = findAssaiCatalogStore(catalog, target);

    expect(store?.lojaId).toBe(10);
    expect(store === null ? [] : listAssaiLeafletsForStore(catalog, store)).toEqual([
      {
        leafletId: '100',
        title: 'Jornal de Ofertas 1',
        startDateIso: null,
        endDateIso: null,
        imageUrls: ['https://cdn.example/page-1.jpeg'],
      },
    ]);
  });

  it('finds a catalog store by normalized display name when the slug differs', () => {
    const target: AssaiMonitoredStore = {
      stateCode: 'CE',
      stateName: 'Ceara',
      cityName: 'Fortaleza',
      storeSlug: 'assai-parangaba-renamed',
      storeName: 'Assai Parangaba',
      initialPageUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba-renamed',
    };
    const catalog = parseAssaiOfferCatalogResponse({
      lojas: [
        {
          loja_id: 10,
          tid: 20,
          nid: 30,
          name: 'Assaí Parangaba',
          url: '/ofertas/ceara/assai-parangaba',
        },
      ],
      ofertas: [
        {
          id: 100,
          title: 'Jornal de Ofertas',
          lojas: [{ loja_id: 10 }],
          images: [{ url: 'https://cdn.example/page-1.jpeg' }],
        },
      ],
    });

    expect(findAssaiCatalogStore(catalog, target)?.storeSlug).toBe('assai-parangaba');
  });

  it('returns null when a catalog store cannot be matched', () => {
    const target: AssaiMonitoredStore = {
      stateCode: 'CE',
      stateName: 'Ceara',
      cityName: 'Fortaleza',
      storeSlug: 'assai-missing',
      storeName: 'Assai Missing',
      initialPageUrl: 'https://www.assai.com.br/ofertas/ceara/assai-missing',
    };
    const catalog = parseAssaiOfferCatalogResponse({
      lojas: [
        {
          loja_id: 10,
          tid: 20,
          nid: 30,
          name: 'Assaí Parangaba',
          url: '/ofertas/ceara/assai-parangaba',
        },
      ],
      ofertas: [
        {
          id: 100,
          title: 'Jornal de Ofertas',
          lojas: [{ loja_id: 10 }],
          images: [{ url: 'https://cdn.example/page-1.jpeg' }],
        },
      ],
    });

    expect(findAssaiCatalogStore(catalog, target)).toBeNull();
  });

  it('lists leaflets assigned by tid or nid', () => {
    const catalog = parseAssaiOfferCatalogResponse({
      lojas: [
        {
          loja_id: 10,
          tid: 20,
          nid: 30,
          name: 'Assaí Parangaba',
          url: '/ofertas/ceara/assai-parangaba/',
        },
      ],
      ofertas: [
        {
          id: 100,
          title: 'Jornal de Ofertas 1',
          lojas: [{ tid: 20 }],
          images: [{ url: 'https://cdn.example/page-1.jpeg' }],
        },
        {
          id: 101,
          title: 'Jornal de Ofertas 2',
          lojas: [{ nid: 30 }],
          images: [{ url: 'https://cdn.example/page-2.jpeg' }],
        },
        {
          id: 102,
          title: 'Jornal de Ofertas 3',
          lojas: [{ tid: 99, nid: 98 }],
          images: [{ url: 'https://cdn.example/page-3.jpeg' }],
        },
      ],
    });

    expect(listAssaiLeafletsForStore(catalog, catalog.stores[0] ?? failTest())).toHaveLength(2);
    expect(catalog.stores[0]?.storeSlug).toBe('assai-parangaba');
  });

  it('uses a default leaflet title when the catalog title is blank', () => {
    const catalog = parseAssaiOfferCatalogResponse({
      lojas: [
        {
          loja_id: 10,
          tid: 20,
          nid: 30,
          name: 'Assaí Parangaba',
          url: '/ofertas/ceara/assai-parangaba',
        },
      ],
      ofertas: [
        {
          id: 100,
          title: ' ',
          lojas: [{ loja_id: 10 }],
          images: [{ url: 'https://cdn.example/page-1.jpeg' }],
        },
      ],
    });

    expect(catalog.leaflets[0]?.title).toBe('Jornal de Ofertas');
  });

  it('rejects a catalog response without stores or leaflets', () => {
    expect(() => parseAssaiOfferCatalogResponse({})).toThrow(AssaiOfferCatalogError);
  });

  it('creates a deterministic leaflet id when the catalog id is absent', () => {
    const catalog = parseAssaiOfferCatalogResponse({
      lojas: [
        {
          loja_id: 10,
          tid: 20,
          nid: 30,
          name: 'Assaí Parangaba',
          url: '/ofertas/ceara/assai-parangaba',
        },
      ],
      ofertas: [
        {
          title: 'Preços válidos para Ceará',
          lojas: [{ loja_id: 10 }],
          images: [{ url: 'https://cdn.example/page-1.jpeg' }],
        },
      ],
    });

    expect(catalog.leaflets[0]?.leafletId).toBe('precos-validos-para-ceara');
  });

  it('uses the default leaflet id when catalog id and title are absent', () => {
    const catalog = parseAssaiOfferCatalogResponse({
      lojas: [
        {
          loja_id: 10,
          tid: 20,
          nid: 30,
          name: 'Assaí Parangaba',
          url: '/ofertas/ceara/assai-parangaba',
        },
      ],
      ofertas: [
        {
          lojas: [{ loja_id: 10 }],
          images: [{ url: 'https://cdn.example/page-1.jpeg' }],
        },
      ],
    });

    expect(catalog.leaflets[0]?.leafletId).toBe('jornal-de-ofertas');
    expect(catalog.leaflets[0]?.title).toBe('Jornal de Ofertas');
  });

  it('uses the default leaflet id when the title cannot be slugified', () => {
    const catalog = parseAssaiOfferCatalogResponse({
      lojas: [
        {
          loja_id: 10,
          tid: 20,
          nid: 30,
          name: 'Assaí Parangaba',
          url: '/ofertas/ceara/assai-parangaba',
        },
      ],
      ofertas: [
        {
          title: '!!!',
          lojas: [{ loja_id: 10 }],
          images: [{ url: 'https://cdn.example/page-1.jpeg' }],
        },
      ],
    });

    expect(catalog.leaflets[0]?.leafletId).toBe('jornal-de-ofertas');
    expect(catalog.leaflets[0]?.title).toBe('!!!');
  });

  it('rejects invalid store and leaflet entries', () => {
    expect(() =>
      parseAssaiOfferCatalogResponse({
        lojas: [
          {
            loja_id: 10,
            tid: 20,
            nid: 30,
            name: 'Assaí Parangaba',
          },
        ],
        ofertas: [],
      }),
    ).toThrow(AssaiOfferCatalogError);
    expect(() =>
      parseAssaiOfferCatalogResponse({
        lojas: [
          {
            loja_id: 10,
            tid: 20,
            nid: 30,
            name: 'Assaí Parangaba',
            url: '/ofertas/ceara/assai-parangaba',
          },
        ],
        ofertas: [
          {
            id: 100,
            title: 'Jornal de Ofertas',
            lojas: [{ loja_id: 10 }],
          },
        ],
      }),
    ).toThrow(AssaiOfferCatalogError);
    expect(() =>
      parseAssaiOfferCatalogResponse({
        lojas: [
          {
            loja_id: 10,
            tid: 20,
            nid: 30,
            name: 'Assaí Parangaba',
            url: '/ofertas/ceara/assai-parangaba',
          },
        ],
        ofertas: [
          {
            id: 100,
            title: 'Jornal de Ofertas',
            lojas: [{ loja_id: 10 }],
            images: [{ url: ' ' }],
          },
        ],
      }),
    ).toThrow(AssaiOfferCatalogError);
  });

  it('fetches the offer catalog through HTTP', async () => {
    const response = new Response(
      JSON.stringify({
        lojas: [
          {
            loja_id: 10,
            tid: 20,
            nid: 30,
            name: 'Assaí Parangaba',
            url: '/ofertas/ceara/assai-parangaba',
          },
        ],
        ofertas: [
          {
            id: 100,
            title: 'Jornal de Ofertas',
            lojas: [{ loja_id: 10 }],
            images: [{ url: 'https://cdn.example/page-1.jpeg' }],
          },
        ],
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      },
    );
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response));
    vi.stubGlobal('fetch', fetchMock);

    const catalog = await new FetchAssaiOfferCatalogClient({
      catalogUrl: 'https://www.assai.com.br/catalog.json',
    }).fetchCatalog();

    expect(catalog.leaflets).toHaveLength(1);
    const fetchCall = fetchMock.mock.calls[0] ?? failTest();
    expect(fetchCall[0]).toBe('https://www.assai.com.br/catalog.json');
    expect(fetchCall[1]?.headers).toEqual({
      Accept: 'application/json',
      Referer: 'https://www.assai.com.br/ofertas',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    });
  });

  it('rejects failed catalog HTTP responses', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new FetchAssaiOfferCatalogClient({
        catalogUrl: 'https://www.assai.com.br/catalog.json',
      }).fetchCatalog(),
    ).rejects.toThrow(AssaiOfferCatalogError);
  });
});

function failTest(): never {
  throw new Error('Expected test fixture to include a catalog store.');
}
