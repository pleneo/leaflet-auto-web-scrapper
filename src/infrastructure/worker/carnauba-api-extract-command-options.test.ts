import { describe, expect, it } from 'vitest';
import {
  InvalidCarnaubaApiExtractCommandOptionsError,
  parseCarnaubaApiExtractCommandOptions,
} from './carnauba-api-extract-command-options';

describe('parseCarnaubaApiExtractCommandOptions', () => {
  it('uses defaults', () => {
    expect(parseCarnaubaApiExtractCommandOptions([], {})).toEqual({
      apiBaseUrl: 'https://merconnect.mercadapp.com.br/mapp/v2',
      brandId: 27,
      cacheRootDirectory: '.data/cache',
      cacheTtlMs: 86_400_000,
      outputRootDirectory: '.data/leaflets',
    });
  });

  it('uses environment values and CLI overrides', () => {
    expect(
      parseCarnaubaApiExtractCommandOptions(['--brand-id', '28', '--output-root', '.data/out'], {
        CARNAUBA_API_BASE_URL: 'https://example.com/api',
        CARNAUBA_STORE_CACHE_DIR: '.data/env-cache',
        CARNAUBA_STORE_CACHE_TTL_HOURS: '2',
        CARNAUBA_LEAFLET_OUTPUT_DIR: '.data/env-out',
      }),
    ).toEqual({
      apiBaseUrl: 'https://example.com/api',
      brandId: 28,
      cacheRootDirectory: '.data/env-cache',
      cacheTtlMs: 7_200_000,
      outputRootDirectory: '.data/out',
    });
  });

  it('rejects invalid values', () => {
    expect(() => parseCarnaubaApiExtractCommandOptions(['api-base-url'], {})).toThrow(
      InvalidCarnaubaApiExtractCommandOptionsError,
    );
    expect(() => parseCarnaubaApiExtractCommandOptions(['--api-base-url'], {})).toThrow(
      InvalidCarnaubaApiExtractCommandOptionsError,
    );
    expect(() =>
      parseCarnaubaApiExtractCommandOptions(['--api-base-url', 'invalid-url'], {}),
    ).toThrow(InvalidCarnaubaApiExtractCommandOptionsError);
    expect(() => parseCarnaubaApiExtractCommandOptions(['--brand-id', '0'], {})).toThrow(
      InvalidCarnaubaApiExtractCommandOptionsError,
    );
    expect(() => parseCarnaubaApiExtractCommandOptions(['--cache-ttl-hours', '-1'], {})).toThrow(
      InvalidCarnaubaApiExtractCommandOptionsError,
    );
    expect(() => parseCarnaubaApiExtractCommandOptions(['--output-root', ' '], {})).toThrow(
      InvalidCarnaubaApiExtractCommandOptionsError,
    );
  });
});
