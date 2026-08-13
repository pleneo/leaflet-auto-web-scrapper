import { describe, expect, it } from 'vitest';
import {
  COOP_HOME_URL,
  COOP_OFFERS_URL,
  findCoopMonitoredStoreBySlug,
  findCoopMonitoredStoreByUrl,
  listCoopMonitoredStores,
} from './coop-targets';

describe('Coop targets', () => {
  it('keeps stable anchors and monitored stores', () => {
    const stores = listCoopMonitoredStores();

    expect(COOP_HOME_URL).toBe('https://www.cooper.coop.br/');
    expect(COOP_OFFERS_URL).toBe('https://www.cooper.coop.br/ofertas');
    expect(stores).toEqual([
      {
        storeSlug: 'coop-super-agua-verde',
        storeName: 'Cooper Super Agua Verde',
        storeKind: 'super',
        cityName: 'Blumenau',
        stateCode: 'SC',
        finalPageUrl: 'https://www.cooper.coop.br/ofertas/blumenau/agua-verde',
        offersPageText: 'AGUA VERDE',
      },
      {
        storeSlug: 'coop-atacarejo-boa-vista',
        storeName: 'Cooper Atacarejo Boa Vista',
        storeKind: 'atacarejo',
        cityName: 'Joinville',
        stateCode: 'SC',
        finalPageUrl: 'https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
        offersPageText: 'COOPER ATACAREJO BOA VISTA',
      },
    ]);
  });

  it('keeps final page URLs unique and absolute', () => {
    const urls = listCoopMonitoredStores().map((store) => store.finalPageUrl);

    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((url) => new URL(url).origin === 'https://www.cooper.coop.br')).toBe(true);
  });

  it('finds monitored stores by slug', () => {
    expect(findCoopMonitoredStoreBySlug('coop-super-agua-verde')?.storeName).toBe(
      'Cooper Super Agua Verde',
    );
    expect(findCoopMonitoredStoreBySlug('missing-store')).toBeNull();
  });

  it('finds monitored stores by final URL ignoring trailing slashes', () => {
    expect(
      findCoopMonitoredStoreByUrl('https://www.cooper.coop.br/ofertas/atacarejo-joinville')
        ?.storeSlug,
    ).toBe('coop-atacarejo-boa-vista');
    expect(findCoopMonitoredStoreByUrl('https://www.cooper.coop.br/ofertas/missing')).toBeNull();
  });
});
