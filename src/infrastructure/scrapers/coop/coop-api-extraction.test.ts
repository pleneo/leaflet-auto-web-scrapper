import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type { Clock } from '../../../application/ports/clock';
import { CoopApiExtractionService } from './coop-api-extraction';
import { COOP_OFFERS_URL, listCoopMonitoredStores } from './coop-targets';

describe('CoopApiExtractionService', () => {
  it('extracts monitored store image galleries through HTML fetches', async () => {
    const fetchHtml = vi.fn<(url: string) => Promise<string>>();
    fetchHtml.mockImplementation((url) => {
      if (url === COOP_OFFERS_URL) {
        return Promise.resolve(offersHtml());
      }

      if (url === 'https://www.cooper.coop.br/ofertas/blumenau/agua-verde') {
        return Promise.resolve(storeHtml('https://www.cooper.coop.br/revista/?id=agua'));
      }

      if (url === 'https://www.cooper.coop.br/ofertas/atacarejo-joinville/') {
        return Promise.resolve(storeHtml('https://www.cooper.coop.br/revista/?id=boa'));
      }

      if (url === 'https://www.cooper.coop.br/revista/?id=agua') {
        return Promise.resolve(leafletHtml('5010', 2, 'Agua Verde semanal'));
      }

      if (url === 'https://www.cooper.coop.br/revista/?id=boa') {
        return Promise.resolve(leafletHtml('5020', 1, 'Boa Vista semanal'));
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    const service = new CoopApiExtractionService(
      { fetchHtml },
      fixedClock('2026-08-13T10:00:00.000Z'),
      createLogger(),
    );

    await expect(service.extract({ offersUrl: COOP_OFFERS_URL })).resolves.toEqual({
      source: 'coop-api',
      extractedAtIso: '2026-08-13T10:00:00.000Z',
      units: [
        {
          unitId: 'coop-super-agua-verde',
          unitName: 'Cooper Super Agua Verde',
          sourceUrl: 'https://www.cooper.coop.br/ofertas/blumenau/agua-verde',
          leaflets: [
            {
              leafletId: 'coop-agua',
              title: 'Agua Verde semanal',
              sourcePageUrl: 'https://www.cooper.coop.br/revista/?id=agua',
              coverImageUrl: 'https://www.cooper.coop.br/revista/imagens/5010/1.jpg',
              imageUrls: [
                'https://www.cooper.coop.br/revista/imagens/5010/1.jpg',
                'https://www.cooper.coop.br/revista/imagens/5010/2.jpg',
              ],
              validUntilIso: null,
            },
          ],
        },
        {
          unitId: 'coop-atacarejo-boa-vista',
          unitName: 'Cooper Atacarejo Boa Vista',
          sourceUrl: 'https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
          leaflets: [
            {
              leafletId: 'coop-boa',
              title: 'Boa Vista semanal',
              sourcePageUrl: 'https://www.cooper.coop.br/revista/?id=boa',
              coverImageUrl: 'https://www.cooper.coop.br/revista/imagens/5020/1.jpg',
              imageUrls: ['https://www.cooper.coop.br/revista/imagens/5020/1.jpg'],
              validUntilIso: null,
            },
          ],
        },
      ],
      failedUnits: [],
    });
  });

  it('returns failed units when the offers page cannot be fetched', async () => {
    const service = new CoopApiExtractionService(
      {
        fetchHtml: vi
          .fn<(url: string) => Promise<string>>()
          .mockRejectedValue(new Error('offline')),
      },
      fixedClock('2026-08-13T10:00:00.000Z'),
      createLogger(),
    );

    const result = await service.extract({ offersUrl: COOP_OFFERS_URL });

    expect(result.units).toEqual([]);
    expect(result.failedUnits).toEqual(
      listCoopMonitoredStores().map((store) => ({
        unitId: store.storeSlug,
        unitName: store.storeName,
        sourceUrl: COOP_OFFERS_URL,
        errorMessage: 'offline',
      })),
    );
  });

  it('preserves successful stores when another monitored store fails', async () => {
    const fetchHtml = vi.fn<(url: string) => Promise<string>>();
    fetchHtml.mockImplementation((url) => {
      if (url === COOP_OFFERS_URL) {
        return Promise.resolve(offersHtml());
      }

      if (url === 'https://www.cooper.coop.br/ofertas/blumenau/agua-verde') {
        return Promise.resolve(storeHtml('https://www.cooper.coop.br/revista/?id=agua'));
      }

      if (url === 'https://www.cooper.coop.br/ofertas/atacarejo-joinville/') {
        return Promise.resolve('<h2>Sem encartes</h2>');
      }

      if (url === 'https://www.cooper.coop.br/revista/?id=agua') {
        return Promise.resolve(leafletHtml('5010', 1, 'Agua Verde semanal'));
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    const service = new CoopApiExtractionService(
      { fetchHtml },
      fixedClock('2026-08-13T10:00:00.000Z'),
      createLogger(),
    );

    const result = await service.extract({ offersUrl: COOP_OFFERS_URL });

    expect(result.units).toHaveLength(1);
    expect(result.failedUnits).toEqual([
      {
        unitId: 'coop-atacarejo-boa-vista',
        unitName: 'Cooper Atacarejo Boa Vista',
        sourceUrl: 'https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
        errorMessage:
          'Coop store page did not expose leaflet cards: https://www.cooper.coop.br/ofertas/atacarejo-joinville/',
      },
    ]);
  });

  it('fails a store when its leaflet page has no images or the store link is missing', async () => {
    const service = new CoopApiExtractionService(
      {
        fetchHtml: vi.fn<(url: string) => Promise<string>>().mockImplementation((url) => {
          if (url === COOP_OFFERS_URL) {
            return Promise.resolve(`
              <a href="https://www.cooper.coop.br/ofertas/blumenau/agua-verde">AGUA VERDE</a>
            `);
          }

          if (url === 'https://www.cooper.coop.br/ofertas/blumenau/agua-verde') {
            return Promise.resolve(storeHtml('https://www.cooper.coop.br/revista/?id=agua'));
          }

          return Promise.resolve('<title>Sem imagens</title>');
        }),
      },
      fixedClock('2026-08-13T10:00:00.000Z'),
      createLogger(),
    );

    const result = await service.extract({ offersUrl: COOP_OFFERS_URL });

    expect(result.units).toEqual([]);
    expect(result.failedUnits.map((unit) => unit.errorMessage)).toEqual([
      'Coop leaflet page did not expose images: https://www.cooper.coop.br/revista/?id=agua',
      'Coop offers page did not expose monitored store: coop-atacarejo-boa-vista.',
    ]);
  });

  it('rejects blank offers URLs', async () => {
    const service = new CoopApiExtractionService(
      { fetchHtml: vi.fn<(url: string) => Promise<string>>() },
      fixedClock('2026-08-13T10:00:00.000Z'),
      createLogger(),
    );

    await expect(service.extract({ offersUrl: ' ' })).rejects.toThrow('offersUrl cannot be blank.');
  });
});

function offersHtml(): string {
  return `
    <a href="https://www.cooper.coop.br/ofertas/blumenau/agua-verde">
      <span>cooper super</span> AGUA VERDE
    </a>
    <a href="https://www.cooper.coop.br/ofertas/atacarejo-joinville/">
      <span>COOPER ATACAREJO</span> BOA VISTA
    </a>
  `;
}

function storeHtml(leafletHref: string): string {
  return `
    <div class="ofertas">
      <a href="${leafletHref}">
        <h3>Semanal</h3>
      </a>
    </div>
  `;
}

function leafletHtml(folder: string, pages: number, title: string): string {
  return `
    <h1>${title}</h1>
    <script>
      $('.magazine').turn({
        pages: ${String(pages)},
      });
      var pasta = 'imagens/${folder}';
    </script>
  `;
}

function fixedClock(value: string): Clock {
  return {
    nowIso: () => value,
  };
}

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}
