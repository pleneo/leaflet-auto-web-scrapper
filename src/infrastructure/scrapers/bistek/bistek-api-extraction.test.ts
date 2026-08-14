import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type { BistekApiSession, BistekApiSessionFactory } from './bistek-api-client';
import { BistekApiExtractionService, parseBistekLeafletCards } from './bistek-api-extraction';
import type { BistekMonitoredStore } from './bistek-image-gallery-leaflet';

describe('BistekApiExtractionService', () => {
  it('extracts all image-gallery leaflets for discovered stores through the API-like flow', async () => {
    const sessionFactory = new FixtureBistekSessionFactory({
      initialHtml: createTargetsHtml(),
      offersHtmlByStoreId: new Map([
        ['2', createOffersHtml('SELEÇÃO válidas de 14/08/2026 até 16/08/2026')],
      ]),
    });
    const service = new BistekApiExtractionService(
      sessionFactory,
      { nowIso: () => '2026-08-14T10:00:00.000Z' },
      createLogger(),
    );

    await expect(
      service.extract({
        offersUrl: 'https://institucional.bistek.com.br/ofertas',
        cityIds: [],
        storeIds: ['2'],
      }),
    ).resolves.toEqual({
      source: 'bistek-api',
      extractedAtIso: '2026-08-14T10:00:00.000Z',
      stores: [
        {
          unitId: 'bistek-sc-blumenau-loja-no-4-bairro-garcia-2',
          unitName: 'SC - Blumenau - Loja Nº 4 - Bairro Garcia',
          sourceUrl: 'https://institucional.bistek.com.br/ofertas',
          store: {
            cityId: '4348',
            stateCode: 'SC',
            cityName: 'Blumenau',
            storeId: '2',
            storeName: 'Loja Nº 4 - Bairro Garcia',
            storeSlug: 'sc-blumenau-loja-no-4-bairro-garcia-2',
          },
          leaflets: [
            {
              leafletId: 'bistek-sc-blumenau-loja-no-4-bairro-garcia-2-oferta-1897',
              title: 'SELEÇÃO válidas de 14/08/2026 até 16/08/2026',
              sourcePageUrl: 'https://institucional.bistek.com.br/ofertas',
              coverImageUrl: 'https://institucional.bistek.com.br/image/capa.jpg',
              imageUrls: [
                'https://institucional.bistek.com.br/image/capa.jpg',
                'https://institucional.bistek.com.br/image/page-1.jpg',
              ],
              validityStartDateIso: '2026-08-14',
              validityEndDateIso: '2026-08-16',
            },
          ],
        },
      ],
      failedStores: [],
    });
    expect(sessionFactory.selectedStoreIds).toEqual(['2']);
  });

  it('filters stores by city and store ids', async () => {
    const sessionFactory = new FixtureBistekSessionFactory({
      initialHtml: createTargetsHtml(),
      offersHtmlByStoreId: new Map([
        ['2', createOffersHtml('Blumenau')],
        ['3', createOffersHtml('Outro Blumenau')],
      ]),
    });
    const service = new BistekApiExtractionService(
      sessionFactory,
      { nowIso: () => '2026-08-14T10:00:00.000Z' },
      createLogger(),
    );

    const result = await service.extract({
      offersUrl: 'https://institucional.bistek.com.br/ofertas',
      cityIds: ['4348'],
      storeIds: ['3'],
    });

    expect(result.stores.map((store) => store.store.storeId)).toEqual(['3']);
    expect(sessionFactory.selectedStoreIds).toEqual(['3']);
  });

  it('keeps failed stores without stopping all extraction', async () => {
    const logger = createLogger();
    const service = new BistekApiExtractionService(
      new FixtureBistekSessionFactory({
        initialHtml: createTargetsHtml(),
        offersHtmlByStoreId: new Map([['2', '<html></html>']]),
      }),
      { nowIso: () => '2026-08-14T10:00:00.000Z' },
      logger,
    );

    const result = await service.extract({
      offersUrl: 'https://institucional.bistek.com.br/ofertas',
      cityIds: [],
      storeIds: [],
    });

    expect(result.stores).toEqual([]);
    expect(result.failedStores[0]?.errorMessage).toBe(
      'Bistek store page did not expose leaflet image galleries.',
    );
    expect(logger.warnMock).toHaveBeenCalled();
    await expect(service.extract({ offersUrl: ' ', cityIds: [], storeIds: [] })).rejects.toThrow(
      'offersUrl cannot be blank.',
    );
  });
});

describe('parseBistekLeafletCards', () => {
  it('deduplicates gallery image URLs and returns null validity dates when absent', () => {
    const cards = parseBistekLeafletCards(
      'https://institucional.bistek.com.br/ofertas',
      createStore(),
      createOffersHtml('Especial Café da Manhã'),
    );

    expect(cards[0]).toMatchObject({
      title: 'Especial Café da Manhã',
      imageUrls: [
        'https://institucional.bistek.com.br/image/capa.jpg',
        'https://institucional.bistek.com.br/image/page-1.jpg',
      ],
      validityStartDateIso: null,
      validityEndDateIso: null,
    });
  });
});

class FixtureBistekSessionFactory implements BistekApiSessionFactory {
  readonly selectedStoreIds: string[] = [];

  private readonly initialHtml: string;

  private readonly offersHtmlByStoreId: ReadonlyMap<string, string>;

  constructor(input: {
    readonly initialHtml: string;
    readonly offersHtmlByStoreId: ReadonlyMap<string, string>;
  }) {
    this.initialHtml = input.initialHtml;
    this.offersHtmlByStoreId = input.offersHtmlByStoreId;
  }

  createSession(): BistekApiSession {
    return new FixtureBistekSession(this);
  }

  fetchOffersHtml(storeId: string | null): string {
    if (storeId === null) {
      return this.initialHtml;
    }

    return this.offersHtmlByStoreId.get(storeId) ?? '<html></html>';
  }
}

class FixtureBistekSession implements BistekApiSession {
  private readonly factory: FixtureBistekSessionFactory;

  private selectedStoreId: string | null = null;

  constructor(factory: FixtureBistekSessionFactory) {
    this.factory = factory;
  }

  fetchOffersHtml(): Promise<string> {
    return Promise.resolve(this.factory.fetchOffersHtml(this.selectedStoreId));
  }

  selectStore(storeId: string): Promise<void> {
    this.selectedStoreId = storeId;
    this.factory.selectedStoreIds.push(storeId);

    return Promise.resolve();
  }
}

interface MockedLogger extends Logger {
  readonly warnMock: ReturnType<typeof vi.fn>;
}

function createLogger(): MockedLogger {
  const warnMock = vi.fn();

  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: warnMock,
    warnMock,
    error: vi.fn(),
  };
}

function createTargetsHtml(): string {
  return `
    <script>
      var lojas = [
        {"cidade":"4348","id":"2","loja":"Loja Nº 4 - Bairro Garcia","lat":"-26.92702600","lng":"-49.05704830"},
        {"cidade":"4348","id":"3","loja":"Loja Nº 17 - Shopping Park Europeu","lat":"-26.88554600","lng":"-49.06757500"}
      ];
      var cidades_list = {"0":"Cidade","4348":"SC - Blumenau"};
    </script>
  `;
}

function createOffersHtml(title: string): string {
  return `
    <div class="oferta">
      <div class="capa_oferta">
        <a data-fancybox="Oferta-1897" href="/image/capa.jpg" class="fancybox fanced" title="${title} Capa">
          <img src="/image/thumb-capa.jpg" alt="${title}" />
        </a>
      </div>
      <div class="galeria_oferta">
        <div class="titulo_oferta">${title}</div>
        <div class="oferta_paginas">
          <a data-fancybox="Oferta-1897" href="/image/capa.jpg" title="${title} - Capa"></a>
          <a data-fancybox="Oferta-1897" href="/image/page-1.jpg" title="${title} - Pagina: 1"></a>
          <a data-fancybox="Oferta-1897" href="/image/page-1.jpg" title="${title} - Pagina: 1"></a>
        </div>
      </div>
    </div>
  `;
}

function createStore(): BistekMonitoredStore {
  return {
    cityId: '4348',
    stateCode: 'SC',
    cityName: 'Blumenau',
    storeId: '2',
    storeName: 'Loja Nº 4 - Bairro Garcia',
    storeSlug: 'sc-blumenau-loja-no-4-bairro-garcia-2',
  };
}
