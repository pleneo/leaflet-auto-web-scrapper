export interface AtacadaoMonitoredStore {
  readonly stateCode: AtacadaoStateCode;
  readonly cityName: string;
  readonly storeSlug: string;
  readonly storeName: string;
  readonly finalPageUrl: string;
}

export type AtacadaoStateCode =
  'AL' | 'BA' | 'CE' | 'MA' | 'MS' | 'PB' | 'PE' | 'PI' | 'PR' | 'RJ' | 'RN' | 'SC' | 'SP';

export const ATACADAO_HOME_URL = 'https://www.atacadao.com.br/';

export const ATACADAO_MONITORED_STORES = [
  createStore('CE', 'Caucaia', 'https://www.atacadao.com.br/loja/caucaia'),
  createStore('CE', 'Eusebio', 'https://www.atacadao.com.br/loja/fortaleza-eusebio'),
  createStore('CE', 'Fortaleza', 'https://www.atacadao.com.br/loja/fortaleza-papicu'),
  createStore('CE', 'Fortaleza', 'https://www.atacadao.com.br/loja/fortaleza-vila-peri'),
  createStore('CE', 'Fortaleza', 'https://www.atacadao.com.br/loja/fortaleza-osorio'),
  createStore('CE', 'Fortaleza', 'https://www.atacadao.com.br/loja/fortaleza-br-116'),
  createStore('CE', 'Fortaleza', 'https://www.atacadao.com.br/loja/fortaleza-barra-do-ceara'),
  createStore('CE', 'Fortaleza', 'https://www.atacadao.com.br/loja/fortaleza-maraponga'),
  createStore('CE', 'Fortaleza', 'https://www.atacadao.com.br/loja/fortaleza-aeroporto'),
  createStore('CE', 'Fortaleza', 'https://www.atacadao.com.br/loja/fortaleza-fatima'),
  createStore(
    'CE',
    'Juazeiro do Norte',
    'https://www.atacadao.com.br/loja/juazeiro-do-norte-triangulo',
  ),
  createStore('CE', 'Juazeiro do Norte', 'https://www.atacadao.com.br/loja/juazeiro-do-norte'),
  createStore('CE', 'Maracanau', 'https://www.atacadao.com.br/loja/maracanau'),
  createStore('CE', 'Sobral', 'https://www.atacadao.com.br/loja/sobral'),
  createStore('PR', 'Maringa', 'https://www.atacadao.com.br/loja/maringa-fernao-dias'),
  createStore('PR', 'Maringa', 'https://www.atacadao.com.br/loja/maringa-colombo'),
  createStore('PR', 'Foz do Iguacu', 'https://www.atacadao.com.br/loja/foz-do-iguacu'),
  createStore('PR', 'Londrina', 'https://www.atacadao.com.br/loja/londrina-ceasa'),
  createStore('PR', 'Londrina', 'https://www.atacadao.com.br/loja/londrina-tiradentes'),
  createStore('PR', 'Curitiba', 'https://www.atacadao.com.br/loja/curitiba-arthur-bernardes'),
  createStore('PR', 'Curitiba', 'https://www.atacadao.com.br/loja/curitiba-boa-vista'),
  createStore('PR', 'Curitiba', 'https://www.atacadao.com.br/loja/curitiba-parolin'),
  createStore('PR', 'Curitiba', 'https://www.atacadao.com.br/loja/curitiba-bairro-alto'),
  createStore('PR', 'Curitiba', 'https://www.atacadao.com.br/loja/curitiba-av-torres'),
  createStore('PR', 'Curitiba', 'https://www.atacadao.com.br/loja/curitiba-fazendinha'),
  createStore('PR', 'Curitiba', 'https://www.atacadao.com.br/loja/curitiba-xaxim'),
  createStore('PR', 'Curitiba', 'https://www.atacadao.com.br/loja/curitiba-pinheirinho'),
  createStore('PR', 'Curitiba', 'https://www.atacadao.com.br/loja/curitiba-boqueirao'),
  createStore('PR', 'Curitiba', 'https://www.atacadao.com.br/loja/curitiba-santa-felicidade'),
  createStore('RN', 'Mossoro', 'https://www.atacadao.com.br/loja/mossoro'),
  createStore('SC', 'Itajai', 'https://www.atacadao.com.br/loja/itajai'),
  createStore('MS', 'Dourados', 'https://www.atacadao.com.br/loja/dourados'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-barra'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-pituba'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-pau-da-lima'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-cabula'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-brotas'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-trobogy'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-acm'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/cajazeiras'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/bonoco'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-barros-reis'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-iguatemi'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-mata-escura'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/itapua'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-mares'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-piraja'),
  createStore('BA', 'Salvador', 'https://www.atacadao.com.br/loja/salvador-garibaldi'),
  createStore('PI', 'Teresina', 'https://www.atacadao.com.br/loja/teresina-ilhotas'),
  createStore('PI', 'Teresina', 'https://www.atacadao.com.br/loja/teresina-ladeira-do-uruguai'),
  createStore('PI', 'Teresina', 'https://www.atacadao.com.br/loja/teresina-bela-vista'),
  createStore('PI', 'Teresina', 'https://www.atacadao.com.br/loja/teresina-primavera'),
  createStore('AL', 'Maceio', 'https://www.atacadao.com.br/loja/maceio-petropolis'),
  createStore('AL', 'Maceio', 'https://www.atacadao.com.br/loja/maceio-praia'),
  createStore('AL', 'Maceio', 'https://www.atacadao.com.br/loja/maceio-aeroporto'),
  createStore('MA', 'Sao Luis', 'https://www.atacadao.com.br/loja/sao-luis'),
  createStore('MA', 'Imperatriz', 'https://www.atacadao.com.br/loja/imperatriz'),
  createStore('PB', 'Joao Pessoa', 'https://www.atacadao.com.br/loja/joao-pessoa-bessa'),
  createStore('PB', 'Joao Pessoa', 'https://www.atacadao.com.br/loja/joao-pessoa'),
  createStore(
    'PB',
    'Campina Grande',
    'https://www.atacadao.com.br/loja/campina-grande-floriano-peixoto',
  ),
  createStore('PB', 'Campina Grande', 'https://www.atacadao.com.br/loja/campina-grande-itarare'),
  createStore(
    'PB',
    'Campina Grande',
    'https://www.atacadao.com.br/loja/campina-grande-manoel-tavares',
  ),
  createStore('PE', 'Recife', 'https://www.atacadao.com.br/loja/avenida-recife'),
  createStore('PE', 'Recife', 'https://www.atacadao.com.br/loja/recife-casa-amarela'),
  createStore('PE', 'Recife', 'https://www.atacadao.com.br/loja/recife-arruda'),
  createStore('PE', 'Recife', 'https://www.atacadao.com.br/loja/recife-iputinga'),
  createStore('PE', 'Recife', 'https://www.atacadao.com.br/loja/boa-viagem'),
  createStore('PE', 'Caruaru', 'https://www.atacadao.com.br/loja/caruaru-polo'),
  createStore('PE', 'Caruaru', 'https://www.atacadao.com.br/loja/caruaru-petropolis'),
  createStore('PE', 'Petrolina', 'https://www.atacadao.com.br/loja/petrolina'),
  createStore('SP', 'Maua', 'https://www.atacadao.com.br/loja/maua-itapark'),
  createStore('SP', 'Maua', 'https://www.atacadao.com.br/loja/maua-joao-ramalho'),
  createStore(
    'SP',
    'Sao Jose dos Campos',
    'https://www.atacadao.com.br/loja/sao-jose-dos-campos-aquarius-dutra',
  ),
  createStore(
    'SP',
    'Sao Jose dos Campos',
    'https://www.atacadao.com.br/loja/sao-jose-dos-campos-shopping',
  ),
  createStore(
    'SP',
    'Sao Jose dos Campos',
    'https://www.atacadao.com.br/loja/sao-jose-dos-campos-jk',
  ),
  createStore('SP', 'Sorocaba', 'https://www.atacadao.com.br/loja/sorocaba-dom-aguirre'),
  createStore('SP', 'Sorocaba', 'https://www.atacadao.com.br/loja/sorocaba'),
  createStore('SP', 'Sorocaba', 'https://www.atacadao.com.br/loja/sorocaba-tavuvu'),
  createStore('SP', 'Santo Andre', 'https://www.atacadao.com.br/loja/santo-andre-estado'),
  createStore('SP', 'Santo Andre', 'https://www.atacadao.com.br/loja/santo-andre-capuava'),
  createStore('SP', 'Santo Andre', 'https://www.atacadao.com.br/loja/santo-andre-centro'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/penha'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/taipas'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/tatuape'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/ipiranga'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/vila-guilherme'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/pacaembu'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/indianopolis'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/cambuci'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/jnaiar-de-souza'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/anchieta'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/rio-das-pedras'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/pirituba'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/vila-lobos'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/aricanduva'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/itaquera'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/interlagos'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/santo-amaro'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/sao-miguel'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/jacui'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/parelheiros'),
  createStore('SP', 'Sao Paulo', 'https://www.atacadao.com.br/loja/vila-maria'),
  createStore('SP', 'Aracatuba', 'https://www.atacadao.com.br/loja/aracatuba'),
  createStore('RJ', 'Rio de Janeiro', 'https://www.atacadao.com.br/loja/barra-da-tijuca'),
  createStore('RJ', 'Rio de Janeiro', 'https://www.atacadao.com.br/loja/automovel-clube'),
  createStore('RJ', 'Rio de Janeiro', 'https://www.atacadao.com.br/loja/guadalupe'),
] as const satisfies readonly AtacadaoMonitoredStore[];

export function listAtacadaoMonitoredStores(): readonly AtacadaoMonitoredStore[] {
  return ATACADAO_MONITORED_STORES;
}

export function findAtacadaoMonitoredStore(finalPageUrl: string): AtacadaoMonitoredStore | null {
  const normalizedUrl = normalizeUrl(finalPageUrl);

  return (
    ATACADAO_MONITORED_STORES.find((store) => normalizeUrl(store.finalPageUrl) === normalizedUrl) ??
    null
  );
}

function createStore(
  stateCode: AtacadaoStateCode,
  cityName: string,
  finalPageUrl: string,
): AtacadaoMonitoredStore {
  const storeSlug = finalPageUrl.split('/').filter(Boolean).at(-1);

  if (storeSlug === undefined) {
    throw new Error(`Invalid Atacadao store URL: ${finalPageUrl}`);
  }

  return {
    stateCode,
    cityName,
    storeSlug,
    storeName: createStoreName(storeSlug),
    finalPageUrl,
  };
}

function createStoreName(storeSlug: string): string {
  return storeSlug
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
