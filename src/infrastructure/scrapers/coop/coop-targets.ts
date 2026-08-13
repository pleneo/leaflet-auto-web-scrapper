export const COOP_HOME_URL = 'https://www.cooper.coop.br/';

export const COOP_OFFERS_URL = 'https://www.cooper.coop.br/ofertas';

export type CoopStoreSlug = 'coop-super-agua-verde' | 'coop-atacarejo-boa-vista';

export interface CoopMonitoredStore {
  readonly storeSlug: CoopStoreSlug;
  readonly storeName: string;
  readonly storeKind: 'super' | 'atacarejo';
  readonly cityName: string;
  readonly stateCode: 'SC';
  readonly finalPageUrl: string;
  readonly offersPageText: string;
}

const COOP_MONITORED_STORES: readonly CoopMonitoredStore[] = [
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
];

export function listCoopMonitoredStores(): readonly CoopMonitoredStore[] {
  return COOP_MONITORED_STORES;
}

export function findCoopMonitoredStoreBySlug(storeSlug: string): CoopMonitoredStore | null {
  return COOP_MONITORED_STORES.find((store) => store.storeSlug === storeSlug) ?? null;
}

export function findCoopMonitoredStoreByUrl(url: string): CoopMonitoredStore | null {
  const normalizedUrl = normalizeUrl(url);

  return (
    COOP_MONITORED_STORES.find((store) => normalizeUrl(store.finalPageUrl) === normalizedUrl) ??
    null
  );
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}
