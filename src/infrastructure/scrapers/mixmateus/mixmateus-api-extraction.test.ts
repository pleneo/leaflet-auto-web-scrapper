import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  MixMateusApiCity,
  MixMateusApiLeaflet,
  MixMateusApiStore,
  MixMateusLeafletQuery,
} from './mixmateus-api-types';
import {
  MixMateusApiExtractionError,
  MixMateusApiExtractionService,
} from './mixmateus-api-extraction';
import type { MixMateusMonitoredStore } from './mixmateus-targets';

describe('MixMateusApiExtractionService', () => {
  it('extracts PDF leaflets through the direct monitored store query', async () => {
    const api = new FakeMixMateusApi({
      leafletsByStoreSlug: new Map([
        [
          'mix-henrique-jorge',
          [
            {
              leafletId: 13961,
              title: 'Exclusivo Itambé',
              filePath: 'uploads/encartes/file.pdf',
              brandCode: 'MA',
              validUntilIso: '2026-08-16 23:59:00',
              validUntilText: '16/08/2026 23:59',
              startsAtIso: '2026-08-05 18:00:00',
              startsAtText: '05/08/2026 18:00',
            },
          ],
        ],
      ]),
    });
    const service = createService(api);

    const result = await service.extract({
      stores: [createStore()],
    });

    expect(result).toEqual({
      source: 'mixmateus-api',
      extractedAtIso: '2026-08-06T10:00:00.000Z',
      stores: [
        {
          store: createStore(),
          sourceUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-henrique-jorge',
          leaflets: [
            {
              leafletId: 'mixmateus-13961',
              title: 'Exclusivo Itambé',
              cardIndex: 0,
              pdfUrl: 'https://ofertasmateus.com/api-proxy.php?file=uploads%2Fencartes%2Ffile.pdf',
            },
          ],
        },
      ],
      failedStores: [],
    });
    expect(api.leafletQueries).toEqual([
      {
        stateCode: 'CE',
        citySlug: 'fortaleza',
        storeSlug: 'mix-henrique-jorge',
        brandCode: 'MA',
      },
    ]);
  });

  it('falls back to city and store catalog resolution when the direct query fails', async () => {
    const api = new FakeMixMateusApi({
      failedDirectStoreSlugs: new Set(['mix-henrique-jorge']),
      cities: [
        {
          citySlug: 'fortaleza-resolved',
          stateCode: 'CE',
          name: 'Fortaleza',
        },
      ],
      stores: [
        {
          storeSlug: 'mix-henrique-jorge-resolved',
          citySlug: 'fortaleza-resolved',
          displayName: 'Mix Mateus Henrique Jorge',
          address: 'Address',
          mapReference: 'Map',
          brandCode: 'MA',
        },
      ],
      leafletsByStoreSlug: new Map([
        [
          'mix-henrique-jorge-resolved',
          [
            {
              leafletId: 13962,
              title: 'Regular',
              filePath: 'uploads/encartes/resolved.pdf',
              brandCode: 'MA',
              validUntilIso: '2026-08-16 23:59:00',
              validUntilText: '16/08/2026 23:59',
              startsAtIso: '2026-08-05 18:00:00',
              startsAtText: '05/08/2026 18:00',
            },
          ],
        ],
      ]),
    });
    const service = createService(api);

    const result = await service.extract({
      stores: [createStore()],
    });

    expect(result.failedStores).toEqual([]);
    expect(result.stores[0]?.leaflets[0]?.pdfUrl).toBe(
      'https://ofertasmateus.com/api-proxy.php?file=uploads%2Fencartes%2Fresolved.pdf',
    );
    expect(api.leafletQueries).toEqual([
      {
        stateCode: 'CE',
        citySlug: 'fortaleza',
        storeSlug: 'mix-henrique-jorge',
        brandCode: 'MA',
      },
      {
        stateCode: 'CE',
        citySlug: 'fortaleza-resolved',
        storeSlug: 'mix-henrique-jorge-resolved',
        brandCode: 'MA',
      },
    ]);
  });

  it('records failed stores and continues extracting other monitored stores', async () => {
    const failedStore = createStore({
      storeSlug: 'missing-store',
      storeName: 'Missing Store',
      finalPageUrl: 'https://ofertasmateus.com/ce/fortaleza/missing-store',
    });
    const api = new FakeMixMateusApi({
      cities: [
        {
          citySlug: 'fortaleza',
          stateCode: 'CE',
          name: 'Fortaleza',
        },
      ],
      stores: [
        {
          storeSlug: 'mix-henrique-jorge',
          citySlug: 'fortaleza',
          displayName: 'Mix Mateus Henrique Jorge',
          address: 'Address',
          mapReference: 'Map',
          brandCode: 'MA',
        },
      ],
      leafletsByStoreSlug: new Map([['mix-henrique-jorge', []]]),
    });
    const service = createService(api);

    const result = await service.extract({
      stores: [createStore(), failedStore],
    });

    expect(result.stores).toHaveLength(1);
    expect(result.stores[0]?.leaflets).toEqual([]);
    expect(result.failedStores).toEqual([
      {
        store: failedStore,
        sourceUrl: 'https://ofertasmateus.com/ce/fortaleza/missing-store',
        errorMessage: 'Could not resolve Mix Mateus store Missing Store.',
      },
    ]);
  });

  it('rejects an empty monitored store list', async () => {
    const service = createService(new FakeMixMateusApi());

    await expect(service.extract({ stores: [] })).rejects.toThrow(MixMateusApiExtractionError);
  });

  it('fails a store when its final URL does not include a city slug', async () => {
    const service = createService(new FakeMixMateusApi());
    const brokenStore = createStore({
      finalPageUrl: 'https://ofertasmateus.com/ce',
    });

    const result = await service.extract({
      stores: [brokenStore],
    });

    expect(result.failedStores[0]?.errorMessage).toBe(
      'Mix Mateus finalPageUrl must include a city slug.',
    );
  });

  it('fails a store when the API catalog cannot resolve its city', async () => {
    const service = createService(new FakeMixMateusApi());

    const result = await service.extract({
      stores: [createStore()],
    });

    expect(result.failedStores[0]?.errorMessage).toBe(
      'Could not resolve Mix Mateus city Fortaleza.',
    );
  });

  it('uses fallback messages for non-error direct query failures', async () => {
    const service = createService(
      new FakeMixMateusApi({
        failedDirectStoreSlugs: new Set(['mix-henrique-jorge']),
        rejectDirectFailuresAsText: true,
      }),
    );

    const result = await service.extract({
      stores: [createStore()],
    });

    expect(result.failedStores[0]?.errorMessage).toBe(
      'Could not resolve Mix Mateus city Fortaleza.',
    );
  });

  it('uses fallback messages for non-error store extraction failures', async () => {
    const service = createService(
      new FakeMixMateusApi({
        rejectCityCatalogAsText: true,
      }),
    );

    const result = await service.extract({
      stores: [createStore()],
    });

    expect(result.failedStores[0]?.errorMessage).toBe('Unexpected Mix Mateus API failure.');
  });
});

interface FakeMixMateusApiConfig {
  readonly cities?: readonly MixMateusApiCity[];
  readonly stores?: readonly MixMateusApiStore[];
  readonly leafletsByStoreSlug?: ReadonlyMap<string, readonly MixMateusApiLeaflet[]>;
  readonly failedDirectStoreSlugs?: ReadonlySet<string>;
  readonly rejectDirectFailuresAsText?: boolean;
  readonly rejectCityCatalogAsText?: boolean;
}

class FakeMixMateusApi {
  readonly leafletQueries: MixMateusLeafletQuery[] = [];

  private readonly cities: readonly MixMateusApiCity[];

  private readonly stores: readonly MixMateusApiStore[];

  private readonly leafletsByStoreSlug: ReadonlyMap<string, readonly MixMateusApiLeaflet[]>;

  private readonly failedDirectStoreSlugs: ReadonlySet<string>;

  private readonly rejectDirectFailuresAsText: boolean;

  private readonly rejectCityCatalogAsText: boolean;

  constructor(config: FakeMixMateusApiConfig = {}) {
    this.cities = config.cities ?? [];
    this.stores = config.stores ?? [];
    this.leafletsByStoreSlug = config.leafletsByStoreSlug ?? new Map();
    this.failedDirectStoreSlugs = config.failedDirectStoreSlugs ?? new Set();
    this.rejectDirectFailuresAsText = config.rejectDirectFailuresAsText ?? false;
    this.rejectCityCatalogAsText = config.rejectCityCatalogAsText ?? false;
  }

  listCities(stateCode: string): Promise<readonly MixMateusApiCity[]> {
    void stateCode;
    if (this.rejectCityCatalogAsText) {
      return rejectWithText('Catalog failed.');
    }

    return Promise.resolve(this.cities);
  }

  listStores(citySlug: string): Promise<readonly MixMateusApiStore[]> {
    void citySlug;
    return Promise.resolve(this.stores);
  }

  listLeaflets(query: MixMateusLeafletQuery): Promise<readonly MixMateusApiLeaflet[]> {
    this.leafletQueries.push(query);

    if (
      this.failedDirectStoreSlugs.has(query.storeSlug) &&
      this.leafletQueries.filter((candidateQuery) => candidateQuery.storeSlug === query.storeSlug)
        .length === 1
    ) {
      if (this.rejectDirectFailuresAsText) {
        return rejectWithText('Direct query failed.');
      }

      return Promise.reject(new Error('Direct query failed.'));
    }

    return Promise.resolve(this.leafletsByStoreSlug.get(query.storeSlug) ?? []);
  }

  buildPdfUrl(filePath: string): string {
    return `https://ofertasmateus.com/api-proxy.php?file=${encodeURIComponent(filePath)}`;
  }
}

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-08-06T10:00:00.000Z';
  }
}

class NullLogger implements Logger {
  debug(message: string, context?: Record<string, string | number | boolean | null>): void {
    void message;
    void context;
  }

  info(message: string, context?: Record<string, string | number | boolean | null>): void {
    void message;
    void context;
  }

  warn(message: string, context?: Record<string, string | number | boolean | null>): void {
    void message;
    void context;
  }

  error(message: string, context?: Record<string, string | number | boolean | null>): void {
    void message;
    void context;
  }
}

function createService(api: FakeMixMateusApi): MixMateusApiExtractionService {
  return new MixMateusApiExtractionService(api, api, api, new FixedClock(), new NullLogger());
}

function rejectWithText<TResult>(message: string): Promise<TResult> {
  const rejected = vi.fn<() => Promise<TResult>>().mockRejectedValue(message);

  return rejected();
}

function createStore(input: Partial<MixMateusMonitoredStore> = {}): MixMateusMonitoredStore {
  return {
    stateCode: 'CE',
    stateName: 'Ceará',
    cityName: 'Fortaleza',
    storeSlug: 'mix-henrique-jorge',
    storeName: 'Mix Mateus Henrique Jorge',
    finalPageUrl: 'https://ofertasmateus.com/ce/fortaleza/mix-henrique-jorge',
    ...input,
  };
}
