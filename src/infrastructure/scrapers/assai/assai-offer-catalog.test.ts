import { describe, expect, it } from 'vitest';
import {
  AssaiOfferCatalogError,
  findAssaiCatalogStore,
  listAssaiLeafletsForStore,
  parseAssaiOfferCatalogResponse,
} from './assai-offer-catalog';
import type { AssaiMonitoredStore } from './assai-targets';

describe('Assai offer catalog', () => {
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

  it('rejects a catalog response without stores or leaflets', () => {
    expect(() => parseAssaiOfferCatalogResponse({})).toThrow(AssaiOfferCatalogError);
  });
});
