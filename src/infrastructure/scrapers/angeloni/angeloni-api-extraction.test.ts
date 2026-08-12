import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { Logger, LogContext } from '../../../application/ports/logger';
import type { AngeloniApiLeaflet, AngeloniRegionLeafletQuery } from './angeloni-api-types';
import {
  AngeloniApiExtractionError,
  AngeloniApiExtractionService,
} from './angeloni-api-extraction';
import type { AngeloniMonitoredRegion } from './angeloni-targets';

describe('AngeloniApiExtractionService', () => {
  it('extracts PDF leaflets for monitored regions', async () => {
    const api = new FakeAngeloniLeafletProvider({
      leafletsByRegionUrl: new Map([
        [
          'https://encartes.angeloni.com.br/regiao-florianopolis/',
          [
            {
              leafletId: 'angeloni-semanal',
              title: 'Semanal Angeloni',
              pdfUrl: 'https://statics.angeloni.com.br/encartes/semanal.pdf',
              sourcePageUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
            },
          ],
        ],
      ]),
    });
    const logger = new MemoryLogger();
    const service = createService(api, logger);

    const result = await service.extract({
      regions: [createRegion()],
    });

    expect(result).toEqual({
      source: 'angeloni-api',
      extractedAtIso: '2026-08-12T12:00:00.000Z',
      regions: [
        {
          region: createRegion(),
          sourceUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
          leaflets: [
            {
              leafletId: 'angeloni-semanal',
              title: 'Semanal Angeloni',
              cardIndex: 0,
              pdfUrl: 'https://statics.angeloni.com.br/encartes/semanal.pdf',
            },
          ],
        },
      ],
      failedRegions: [],
    });
    expect(api.queries).toEqual([
      {
        regionUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
      },
    ]);
    expect(logger.infoMessages).toEqual(['Fetched Angeloni API leaflets from regional page.']);
  });

  it('keeps a region successful when it has no current PDFs', async () => {
    const service = createService(new FakeAngeloniLeafletProvider());

    const result = await service.extract({
      regions: [createRegion()],
    });

    expect(result.failedRegions).toEqual([]);
    expect(result.regions[0]?.leaflets).toEqual([]);
  });

  it('records failed regions and continues extracting other monitored regions', async () => {
    const failedRegion = createRegion({
      regionName: 'Florianópolis Alternate',
      regionUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis-alternate/',
    });
    const api = new FakeAngeloniLeafletProvider({
      failedRegionUrls: new Set([
        'https://encartes.angeloni.com.br/regiao-florianopolis-alternate/',
      ]),
      leafletsByRegionUrl: new Map([
        [
          'https://encartes.angeloni.com.br/regiao-florianopolis/',
          [
            {
              leafletId: 'angeloni-florianopolis',
              title: 'Florianópolis',
              pdfUrl: 'https://statics.angeloni.com.br/encartes/florianopolis.pdf',
              sourcePageUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
            },
          ],
        ],
      ]),
    });
    const service = createService(api);

    const result = await service.extract({
      regions: [failedRegion, createRegion()],
    });

    expect(result.regions).toHaveLength(1);
    expect(result.failedRegions).toEqual([
      {
        region: failedRegion,
        sourceUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis-alternate/',
        errorMessage: 'Region request failed.',
      },
    ]);
  });

  it('uses fallback messages for non-error region failures', async () => {
    const service = createService(
      new FakeAngeloniLeafletProvider({
        failedRegionUrls: new Set(['https://encartes.angeloni.com.br/regiao-florianopolis/']),
        rejectFailuresAsText: true,
      }),
    );

    const result = await service.extract({
      regions: [createRegion()],
    });

    expect(result.failedRegions[0]?.errorMessage).toBe('Unexpected Angeloni API failure.');
  });

  it('rejects an empty region list', async () => {
    const service = createService(new FakeAngeloniLeafletProvider());

    await expect(service.extract({ regions: [] })).rejects.toThrow(AngeloniApiExtractionError);
  });
});

interface FakeAngeloniLeafletProviderConfig {
  readonly leafletsByRegionUrl?: ReadonlyMap<string, readonly AngeloniApiLeaflet[]>;
  readonly failedRegionUrls?: ReadonlySet<string>;
  readonly rejectFailuresAsText?: boolean;
}

class FakeAngeloniLeafletProvider {
  readonly queries: AngeloniRegionLeafletQuery[] = [];

  private readonly leafletsByRegionUrl: ReadonlyMap<string, readonly AngeloniApiLeaflet[]>;

  private readonly failedRegionUrls: ReadonlySet<string>;

  private readonly rejectFailuresAsText: boolean;

  constructor(config: FakeAngeloniLeafletProviderConfig = {}) {
    this.leafletsByRegionUrl = config.leafletsByRegionUrl ?? new Map();
    this.failedRegionUrls = config.failedRegionUrls ?? new Set();
    this.rejectFailuresAsText = config.rejectFailuresAsText ?? false;
  }

  listRegionLeaflets(query: AngeloniRegionLeafletQuery): Promise<readonly AngeloniApiLeaflet[]> {
    this.queries.push(query);

    if (this.failedRegionUrls.has(query.regionUrl)) {
      if (this.rejectFailuresAsText) {
        return Promise.reject(createNonErrorRejectionReason());
      }

      return Promise.reject(new Error('Region request failed.'));
    }

    return Promise.resolve(this.leafletsByRegionUrl.get(query.regionUrl) ?? []);
  }
}

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-08-12T12:00:00.000Z';
  }
}

class MemoryLogger implements Logger {
  readonly infoMessages: string[] = [];

  debug(message: string, context?: LogContext): void {
    void message;
    void context;
  }

  info(message: string, context?: LogContext): void {
    void context;
    this.infoMessages.push(message);
  }

  warn(message: string, context?: LogContext): void {
    void message;
    void context;
  }

  error(message: string, context?: LogContext): void {
    void message;
    void context;
  }
}

function createService(
  provider: FakeAngeloniLeafletProvider,
  logger: Logger = new MemoryLogger(),
): AngeloniApiExtractionService {
  return new AngeloniApiExtractionService(provider, new FixedClock(), logger);
}

function createRegion(
  overrides: Partial<AngeloniMonitoredRegion> = {},
): AngeloniMonitoredRegion {
  return {
    regionSlug: 'regiao-florianopolis',
    regionName: 'Florianópolis',
    stateCode: 'SC',
    cityName: 'Florianópolis',
    homeUrl: 'https://encartes.angeloni.com.br/',
    regionUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
    ...overrides,
  };
}

function createNonErrorRejectionReason(): Error {
  const error = new Error('Region failed.');
  Object.setPrototypeOf(error, null);

  return error;
}
