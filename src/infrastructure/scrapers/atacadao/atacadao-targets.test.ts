import { describe, expect, it } from 'vitest';
import { findAtacadaoMonitoredStore, listAtacadaoMonitoredStores } from './atacadao-targets';

describe('Atacadao monitored stores', () => {
  it('lists the monitored store URLs supplied for Atacadao extraction', () => {
    const stores = listAtacadaoMonitoredStores();

    expect(stores.length).toBeGreaterThan(90);
    expect(stores).toContainEqual({
      stateCode: 'SP',
      cityName: 'Sao Paulo',
      storeSlug: 'ipiranga',
      storeName: 'Ipiranga',
      finalPageUrl: 'https://www.atacadao.com.br/loja/ipiranga',
    });
    expect(stores).toContainEqual({
      stateCode: 'CE',
      cityName: 'Fortaleza',
      storeSlug: 'fortaleza-papicu',
      storeName: 'Fortaleza Papicu',
      finalPageUrl: 'https://www.atacadao.com.br/loja/fortaleza-papicu',
    });
    expect(stores).toContainEqual({
      stateCode: 'CE',
      cityName: 'Juazeiro do Norte',
      storeSlug: 'juzeiro-do-norte-triangulo',
      storeName: 'Juazeiro Do Norte Triangulo',
      finalPageUrl: 'https://www.atacadao.com.br/loja/juzeiro-do-norte-triangulo',
    });
    expect(stores).toContainEqual({
      stateCode: 'BA',
      cityName: 'Salvador',
      storeSlug: 'savador-pau-da-lima',
      storeName: 'Salvador Pau Da Lima',
      finalPageUrl: 'https://www.atacadao.com.br/loja/savador-pau-da-lima',
    });
  });

  it('finds monitored stores by normalized final URL', () => {
    const store = findAtacadaoMonitoredStore('https://www.atacadao.com.br/loja/ipiranga/');

    expect(store?.storeSlug).toBe('ipiranga');
  });

  it('returns null when the final URL is not monitored', () => {
    expect(findAtacadaoMonitoredStore('https://www.atacadao.com.br/loja/not-monitored')).toBeNull();
  });
});
