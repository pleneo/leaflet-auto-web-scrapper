export interface AssaiMonitoredStore {
  readonly stateCode: AssaiStateCode;
  readonly stateName: string;
  readonly cityName: string;
  readonly storeSlug: string;
  readonly storeName: string;
  readonly initialPageUrl: string;
}

export type AssaiStateCode = 'BA' | 'CE' | 'DF' | 'MA' | 'MS' | 'PE' | 'PI' | 'PR' | 'RN' | 'SP';

export const ASSAI_HOME_URL = 'https://www.assai.com.br/';

export const ASSAI_OFFERS_URL = 'https://www.assai.com.br/ofertas';

export const ASSAI_MONITORED_STORES = [
  createStore('CE', 'Ceara', 'Fortaleza', 'assai-bezerra-m-fortaleza'),
  createStore('CE', 'Ceara', 'Fortaleza', 'assai-cais-do-porto'),
  createStore('CE', 'Ceara', 'Fortaleza', 'assai-cidade-dos-funcionarios'),
  createStore('CE', 'Ceara', 'Fortaleza', 'assai-joquei-clube'),
  createStore('CE', 'Ceara', 'Fortaleza', 'assai-kennedy'),
  createStore('CE', 'Ceara', 'Fortaleza', 'assai-mister-hull'),
  createStore('CE', 'Ceara', 'Fortaleza', 'assai-montese'),
  createStore('CE', 'Ceara', 'Fortaleza', 'assai-parangaba'),
  createStore('CE', 'Ceara', 'Fortaleza', 'assai-tapioqueiras'),
  createStore('CE', 'Ceara', 'Fortaleza', 'assai-washington-soares'),
  createStore('CE', 'Ceara', 'Caucaia', 'assai-caucaia'),
  createStore('CE', 'Ceara', 'Iguatu', 'assai-iguatu'),
  createStore('CE', 'Ceara', 'Juazeiro do Norte', 'assai-juazeiro-do-norte'),
  createStore('CE', 'Ceara', 'Maracanau', 'assai-maracanau'),
  createStore('CE', 'Ceara', 'Sobral', 'assai-sobral'),
  createStore('PR', 'Parana', 'Maringa', 'assai-maringa'),
  createStore('PR', 'Parana', 'Maringa', 'assai-maringa-seminario'),
  createStore('RN', 'Rio Grande do Norte', 'Mossoro', 'assai-mossoro'),
  createStore('MS', 'Mato Grosso do Sul', 'Dourados', 'assai-dourados'),
  createStore('BA', 'Bahia', 'Salvador', 'assai-salvador-mussurunga'),
  createStore('BA', 'Bahia', 'Salvador', 'assai-salvador-paralela'),
  createStore('BA', 'Bahia', 'Ilheus', 'assai-ilheus'),
  createStore('PI', 'Piaui', 'Teresina', 'assai-teresina'),
  createStore('PI', 'Piaui', 'Teresina', 'assai-teresina-kennedy'),
  createStore('MA', 'Maranhao', 'Sao Luis', 'assai-sao-luis-turu'),
  createStore('MA', 'Maranhao', 'Imperatriz', 'assai-imperatriz'),
  createStore('PE', 'Pernambuco', 'Recife', 'assai-avenida-recife'),
  createStore('PE', 'Pernambuco', 'Recife', 'assai-benfica'),
  createStore('PE', 'Pernambuco', 'Recife', 'assai-boa-viagem'),
  createStore('PE', 'Pernambuco', 'Recife', 'assai-imbiribeira'),
  createStore('DF', 'Distrito Federal', 'Brasilia', 'assai-brasilia-norte'),
  createStore('DF', 'Distrito Federal', 'Brasilia', 'assai-brasilia-park'),
  createStore('DF', 'Distrito Federal', 'Brasilia', 'assai-brasilia-sia'),
  createStore(
    'DF',
    'Distrito Federal',
    'Brasilia',
    'assai-taguatinga',
    'https://www.assai.com.br/loja/assai-taguatinga',
  ),
  createStore(
    'DF',
    'Distrito Federal',
    'Brasilia',
    'assai-taguatinga-shopping',
    'https://www.assai.com.br/loja/assai-taguatinga-shopping',
  ),
  createStore('SP', 'Sao Paulo', 'Campinas', 'assai-campinas'),
  createStore('SP', 'Sao Paulo', 'Campinas', 'assai-campinas-abolicao'),
  createStore('SP', 'Sao Paulo', 'Piracicaba', 'assai-piracicaba'),
  createStore('SP', 'Sao Paulo', 'Piracicaba', 'assai-piracicaba-nova-america'),
  createStore('SP', 'Sao Paulo', 'Santos', 'assai-santos'),
  createStore('SP', 'Sao Paulo', 'Santos', 'assai-santos-ana-costa'),
  createStore('SP', 'Sao Paulo', 'Sao Jose dos Campos', 'assai-sao-jose-dos-campos'),
  createStore('SP', 'Sao Paulo', 'Sao Jose dos Campos', 'assai-sao-jose-dos-campos-colinas'),
  createStore(
    'SP',
    'Sao Paulo',
    'Sao Jose dos Campos',
    'assai-sao-jose-dos-campos-vila-industrial',
  ),
  createStore('SP', 'Sao Paulo', 'Aracatuba', 'assai-aracatuba'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-aeroporto-congonhas'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-aguia-de-haia'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-anhanguera'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-aricanduva'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-barra-funda'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-casa-verde'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-cidade-dutra'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-cidade-tiradentes'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-fernao-dias'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-freguesia-do-o'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-guaianases'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-guaianases-estacao'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-interlagos'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-itapevi'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-itaquera'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-jabaquara'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-jacana'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-jacu-pessego'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-jaguare'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-jaguare-corifeu'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-jaragua-taipas'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-joao-dias'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-marginal-tiete-tatuape'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-marginal-tiete-vila-maria'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-mooca'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-nacoes-unidas'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-nordestina'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-penha-marginal-tiete'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-raposo-tavares'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-santa-catarina'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-sao-mateus'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-sao-miguel'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-sao-miguel-ii'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-sapopemba'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-sezefredo-fagundes'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-tancredo-neves'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-teotonio-vilela'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-vila-carrao'),
  createStore('SP', 'Sao Paulo', 'Sao Paulo', 'assai-vila-sonia'),
] as const satisfies readonly AssaiMonitoredStore[];

export function listAssaiMonitoredStores(): readonly AssaiMonitoredStore[] {
  return ASSAI_MONITORED_STORES;
}

export function findAssaiMonitoredStoreBySlug(storeSlug: string): AssaiMonitoredStore | null {
  return ASSAI_MONITORED_STORES.find((store) => store.storeSlug === storeSlug) ?? null;
}

function createStore(
  stateCode: AssaiStateCode,
  stateName: string,
  cityName: string,
  storeSlug: string,
  initialPageUrl?: string,
): AssaiMonitoredStore {
  return {
    stateCode,
    stateName,
    cityName,
    storeSlug,
    storeName: createStoreName(storeSlug),
    initialPageUrl:
      initialPageUrl ?? `https://www.assai.com.br/ofertas/${slugify(stateName)}/${storeSlug}`,
  };
}

function createStoreName(storeSlug: string): string {
  return storeSlug
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .replace(/^Assai/, 'Assai Atacadista');
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
