export interface MixMateusMonitoredStore {
  readonly stateCode: MixMateusStateCode;
  readonly stateName: string;
  readonly cityName: string;
  readonly storeSlug: string;
  readonly storeName: string;
  readonly finalPageUrl: string;
}

export type MixMateusStateCode = 'AL' | 'BA' | 'CE' | 'PI';

export const MIX_MATEUS_HOME_URL = 'https://ofertasmateus.com/';

export const MIX_MATEUS_MONITORED_STORES = [
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Aracati',
    storeSlug: 'mix-aracati',
    storeName: 'Mix Mateus Aracati',
    finalPageUrl: 'https://ofertasmateus.com/ce/aracati/mix-aracati',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Canindé',
    storeSlug: 'mix-caninde',
    storeName: 'Mix Mateus Canindé',
    finalPageUrl: 'https://ofertasmateus.com/ce/caninde/mix-caninde',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Caucaia',
    storeSlug: 'mix-mateus-caucaia',
    storeName: 'Mix Mateus Caucaia',
    finalPageUrl: 'https://ofertasmateus.com/ce/caucaia/mix-mateus-caucaia',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Fortaleza',
    storeSlug: 'mix-henrique-jorge',
    storeName: 'Mix Mateus Henrique Jorge',
    finalPageUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-henrique-jorge',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Fortaleza',
    storeSlug: 'mix-jose-walter',
    storeName: 'Mix Mateus José Walter',
    finalPageUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-jose-walter',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Fortaleza',
    storeSlug: 'mix-messejana',
    storeName: 'Mix Mateus Messejana',
    finalPageUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-messejana',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Itapipoca',
    storeSlug: 'mix-itapipoca',
    storeName: 'Mix Mateus Itapipoca',
    finalPageUrl: 'https://ofertasmateus.com/ce/itapipoca/mix-itapipoca',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Juazeiro do Norte',
    storeSlug: 'mix-juazeiro-do-norte',
    storeName: 'Mix Mateus Juazeiro do Norte',
    finalPageUrl: 'https://ofertasmateus.com/ce/juazeiro-do-norte/mix-juazeiro-do-norte',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Maracanaú',
    storeSlug: 'mix-mateus-maracanau',
    storeName: 'Mix Mateus Maracanaú',
    finalPageUrl: 'https://ofertasmateus.com/ce/maracanau/mix-mateus-maracanau',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Maranguape',
    storeSlug: 'mix-maranguape',
    storeName: 'Mix Mateus Maranguape',
    finalPageUrl: 'https://ofertasmateus.com/ce/maranguape/mix-maranguape',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Russas',
    storeSlug: 'mix-mateus-russas',
    storeName: 'Mix Mateus Russas',
    finalPageUrl: 'https://ofertasmateus.com/ce/russas/mix-mateus-russas',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Sobral',
    storeSlug: 'mix-sobral',
    storeName: 'Mix Mateus Sobral',
    finalPageUrl: 'https://ofertasmateus.com/ce/sobral/mix-sobral',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Tianguá',
    storeSlug: 'mix-tianguia',
    storeName: 'Mix Mateus Tianguá',
    finalPageUrl: 'https://ofertasmateus.com/ce/tiangua/mix-tianguia',
  }),
  createStore({
    stateCode: 'BA',
    stateName: 'Bahia',
    cityName: 'Ilhéus',
    storeSlug: 'mix-mateus-ilheus',
    storeName: 'Mix Mateus Ilhéus',
    finalPageUrl: 'https://ofertasmateus.com/ba/ilheus/mix-mateus-ilheus',
  }),
  createStore({
    stateCode: 'BA',
    stateName: 'Bahia',
    cityName: 'Salvador',
    storeSlug: 'mix-salvador-norte-shopping',
    storeName: 'Mix Mateus Salvador Norte Shopping',
    finalPageUrl: 'https://ofertasmateus.com/ba/salvador/mix-salvador-norte-shopping',
  }),
  createStore({
    stateCode: 'PI',
    stateName: 'Piauí',
    cityName: 'Teresina',
    storeSlug: 'mix-zequinha-freire',
    storeName: 'Mix Mateus Zequinha Freire',
    finalPageUrl: 'https://ofertasmateus.com/pi/teresina/mix-zequinha-freire',
  }),
  createStore({
    stateCode: 'PI',
    stateName: 'Piauí',
    cityName: 'Teresina',
    storeSlug: 'mix-parque-sao-joao',
    storeName: 'Mix Mateus Parque São João',
    finalPageUrl: 'https://ofertasmateus.com/pi/teresina/mix-parque-sao-joao',
  }),
  createStore({
    stateCode: 'PI',
    stateName: 'Piauí',
    cityName: 'Parnaíba',
    storeSlug: 'mix-parnaiba',
    storeName: 'Mix Mateus Parnaíba',
    finalPageUrl: 'https://ofertasmateus.com/pi/parnaiba/mix-parnaiba',
  }),
  createStore({
    stateCode: 'AL',
    stateName: 'Alagoas',
    cityName: 'Maceió',
    storeSlug: 'mix-mateus-antares',
    storeName: 'Mix Mateus Antares',
    finalPageUrl: 'https://ofertasmateus.com/al/maceio/mix-mateus-antares',
  }),
  createStore({
    stateCode: 'AL',
    stateName: 'Alagoas',
    cityName: 'Maceió',
    storeSlug: 'mix-mateusserraria',
    storeName: 'Mix Mateus Serraria',
    finalPageUrl: 'https://ofertasmateus.com/al/maceio/mix-mateusserraria',
  }),
  createStore({
    stateCode: 'AL',
    stateName: 'Alagoas',
    cityName: 'Maceió',
    storeSlug: 'mix-mateus-tabuleiro',
    storeName: 'Mix Mateus Tabuleiro',
    finalPageUrl: 'https://ofertasmateus.com/al/maceio/mix-mateus-tabuleiro',
  }),
  createStore({
    stateCode: 'AL',
    stateName: 'Alagoas',
    cityName: 'Maceió',
    storeSlug: 'mix-mateustrapiche',
    storeName: 'Mix Mateus Trapiche',
    finalPageUrl: 'https://ofertasmateus.com/al/maceio/mix-mateustrapiche',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Quixeramobim',
    storeSlug: 'mateus-quixeramobim',
    storeName: 'Mateus Quixeramobim',
    finalPageUrl: 'https://ofertasmateus.com/ce/quixeramobim/mateus-quixeramobim',
  }),
  createStore({
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Crateús',
    storeSlug: 'mateus-crateus',
    storeName: 'Mateus Crateús',
    finalPageUrl: 'https://ofertasmateus.com/ce/crateus/mateus-crateus',
  }),
] as const satisfies readonly MixMateusMonitoredStore[];

export function listMixMateusMonitoredStores(): readonly MixMateusMonitoredStore[] {
  return MIX_MATEUS_MONITORED_STORES;
}

export function findMixMateusMonitoredStore(finalPageUrl: string): MixMateusMonitoredStore | null {
  const normalizedUrl = normalizeUrl(finalPageUrl);

  return (
    MIX_MATEUS_MONITORED_STORES.find(
      (store) => normalizeUrl(store.finalPageUrl) === normalizedUrl,
    ) ?? null
  );
}

function createStore(input: MixMateusMonitoredStore): MixMateusMonitoredStore {
  return input;
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
