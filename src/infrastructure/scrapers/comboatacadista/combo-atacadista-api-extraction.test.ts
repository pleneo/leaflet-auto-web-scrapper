import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import { ComboAtacadistaApiExtractionService } from './combo-atacadista-api-extraction';
import type { ComboAtacadistaPageFetcher } from './combo-atacadista-api-client';

describe('ComboAtacadistaApiExtractionService', () => {
  it('extracts all image-gallery leaflets from discovered cards', async () => {
    const service = new ComboAtacadistaApiExtractionService(
      new FixturePageFetcher(
        new Map([
          [
            'https://www.comboatacadista.com.br/ofertas',
            '<div class="item-topic"><h2>Ofertas do dia</h2><span class="date">Válido até 13/08/2026</span><a href="/ofertas-dia">Ver ofertas</a></div>',
          ],
          [
            'https://www.comboatacadista.com.br/ofertas-dia',
            '<h1>Ofertas <strong>do dia</strong></h1><a href="/upload/weekend_image/1.jpeg" itemprop="contentUrl"></a>',
          ],
        ]),
      ),
      { nowIso: () => '2026-08-13T10:00:00.000Z' },
      createLogger(),
    );

    await expect(
      service.extract({
        offersUrl: 'https://www.comboatacadista.com.br/ofertas',
      }),
    ).resolves.toEqual({
      source: 'comboatacadista-api',
      extractedAtIso: '2026-08-13T10:00:00.000Z',
      units: [
        {
          unitId: 'comboatacadista-online',
          unitName: 'Combo Atacadista',
          sourceUrl: 'https://www.comboatacadista.com.br/ofertas',
          leaflets: [
            {
              leafletId: 'comboatacadista-ofertas-dia',
              title: 'Ofertas do dia',
              sourcePageUrl: 'https://www.comboatacadista.com.br/ofertas-dia',
              coverImageUrl: 'https://www.comboatacadista.com.br/upload/weekend_image/1.jpeg',
              imageUrls: ['https://www.comboatacadista.com.br/upload/weekend_image/1.jpeg'],
              validUntilIso: '2026-08-13',
            },
          ],
        },
      ],
      failedUnits: [],
    });
  });

  it('returns typed failed unit when the API path is unusable', async () => {
    const logger = createLogger();
    const service = new ComboAtacadistaApiExtractionService(
      new FixturePageFetcher(
        new Map([['https://www.comboatacadista.com.br/ofertas', '<html></html>']]),
      ),
      { nowIso: () => '2026-08-13T10:00:00.000Z' },
      logger,
    );

    const result = await service.extract({
      offersUrl: 'https://www.comboatacadista.com.br/ofertas',
    });

    expect(result.units).toEqual([]);
    expect(result.failedUnits[0]?.errorMessage).toBe(
      'Combo Atacadista offers page did not expose leaflet cards.',
    );
    expect(logger.warnMock).toHaveBeenCalled();
    await expect(service.extract({ offersUrl: ' ' })).rejects.toThrow('offersUrl cannot be blank.');
  });

  it('fails the unit when a discovered leaflet page has no images', async () => {
    const service = new ComboAtacadistaApiExtractionService(
      new FixturePageFetcher(
        new Map([
          [
            'https://www.comboatacadista.com.br/ofertas',
            '<div class="item-topic"><h2>Ofertas</h2><a href="/ofertas-dia">Ver ofertas</a></div>',
          ],
          ['https://www.comboatacadista.com.br/ofertas-dia', '<h1>Sem imagens</h1>'],
        ]),
      ),
      { nowIso: () => '2026-08-13T10:00:00.000Z' },
      createLogger(),
    );

    const result = await service.extract({
      offersUrl: 'https://www.comboatacadista.com.br/ofertas',
    });

    expect(result.failedUnits[0]?.errorMessage).toBe(
      'Combo Atacadista leaflet page did not expose images: https://www.comboatacadista.com.br/ofertas-dia',
    );
  });

  it('handles non-Error API failures', async () => {
    const service = new ComboAtacadistaApiExtractionService(
      {
        fetchHtml: () =>
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          Promise.reject('network failed'),
      },
      { nowIso: () => '2026-08-13T10:00:00.000Z' },
      createLogger(),
    );

    const result = await service.extract({
      offersUrl: 'https://www.comboatacadista.com.br/ofertas',
    });

    expect(result.failedUnits[0]?.errorMessage).toBe('Unexpected Combo Atacadista API failure.');
  });
});

class FixturePageFetcher implements ComboAtacadistaPageFetcher {
  private readonly pages: ReadonlyMap<string, string>;

  constructor(pages: ReadonlyMap<string, string>) {
    this.pages = pages;
  }

  fetchHtml(url: string): Promise<string> {
    const html = this.pages.get(url);

    if (html === undefined) {
      throw new Error(`Missing fixture page: ${url}`);
    }

    return Promise.resolve(html);
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
