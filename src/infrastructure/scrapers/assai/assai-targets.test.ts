import { describe, expect, it } from 'vitest';
import {
  ASSAI_HOME_URL,
  ASSAI_OFFERS_URL,
  findAssaiMonitoredStoreBySlug,
  listAssaiMonitoredStores,
} from './assai-targets';

describe('Assai targets', () => {
  it('lists the deduplicated monitored stores', () => {
    const stores = listAssaiMonitoredStores();
    const slugs = new Set(stores.map((store) => store.storeSlug));

    expect(stores).toHaveLength(84);
    expect(slugs.size).toBe(stores.length);
  });

  it('keeps stable home and offers anchors', () => {
    expect(ASSAI_HOME_URL).toBe('https://www.assai.com.br/');
    expect(ASSAI_OFFERS_URL).toBe('https://www.assai.com.br/ofertas');
  });

  it('finds a monitored store by slug', () => {
    const store = findAssaiMonitoredStoreBySlug('assai-parangaba');

    expect(store).toEqual({
      stateCode: 'CE',
      stateName: 'Ceara',
      cityName: 'Fortaleza',
      storeSlug: 'assai-parangaba',
      storeName: 'Assai Atacadista Parangaba',
      initialPageUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
    });
  });

  it('preserves monitored store URLs that start from the store page', () => {
    const store = findAssaiMonitoredStoreBySlug('assai-taguatinga');

    expect(store?.initialPageUrl).toBe('https://www.assai.com.br/loja/assai-taguatinga');
  });

  it('returns null when the slug is not monitored', () => {
    expect(findAssaiMonitoredStoreBySlug('missing-store')).toBeNull();
  });
});
