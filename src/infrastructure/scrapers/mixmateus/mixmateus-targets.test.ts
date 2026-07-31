import { describe, expect, it } from 'vitest';
import {
  findMixMateusMonitoredStore,
  listMixMateusMonitoredStores,
  MIX_MATEUS_HOME_URL,
} from './mixmateus-targets';

describe('Mix Mateus monitored stores', () => {
  it('lists the monitored stores provided by the business scope', () => {
    const stores = listMixMateusMonitoredStores();

    expect(MIX_MATEUS_HOME_URL).toBe('https://ofertasmateus.com/');
    expect(stores).toHaveLength(24);
    expect(stores[0]).toEqual({
      stateCode: 'CE',
      stateName: 'Ceará',
      cityName: 'Aracati',
      storeSlug: 'mix-aracati',
      storeName: 'Mix Mateus Aracati',
      finalPageUrl: 'https://ofertasmateus.com/ce/aracati/mix-aracati',
    });
    expect(stores.at(-1)).toEqual({
      stateCode: 'CE',
      stateName: 'Ceará',
      cityName: 'Crateús',
      storeSlug: 'mateus-crateus',
      storeName: 'Mateus Crateús',
      finalPageUrl: 'https://ofertasmateus.com/ce/crateus/mateus-crateus',
    });
  });

  it('keeps final page urls unique and absolute', () => {
    const stores = listMixMateusMonitoredStores();
    const urls = stores.map((store) => store.finalPageUrl);

    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((url) => new URL(url).origin === 'https://ofertasmateus.com')).toBe(true);
  });

  it('finds monitored stores by final page url ignoring trailing slashes', () => {
    const store = findMixMateusMonitoredStore(
      'https://ofertasmateus.com/ce/fortaleza/mix-henrique-jorge/',
    );

    expect(store).toMatchObject({
      stateCode: 'CE',
      cityName: 'Fortaleza',
      storeSlug: 'mix-henrique-jorge',
    });
    expect(
      findMixMateusMonitoredStore('https://ofertasmateus.com/ce/fortaleza/unknown'),
    ).toBeNull();
  });
});
