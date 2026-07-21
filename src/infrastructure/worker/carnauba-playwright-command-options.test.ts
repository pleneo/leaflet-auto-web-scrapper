import { describe, expect, it } from 'vitest';
import {
  InvalidCarnaubaPlaywrightCommandOptionsError,
  parseCarnaubaPlaywrightCommandOptions,
} from './carnauba-playwright-command-options';

describe('parseCarnaubaPlaywrightCommandOptions', () => {
  it('uses defaults', () => {
    expect(parseCarnaubaPlaywrightCommandOptions([], {})).toEqual({
      apiBaseUrl: 'https://merconnect.mercadapp.com.br/mapp/v2',
      brandId: 27,
      cacheRootDirectory: '.data/cache',
      cacheTtlMs: 86_400_000,
      outputRootDirectory: '.data/leaflets-playwright',
      siteBaseUrl: 'https://carnaubasupermercados.com.br',
      viewport: {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      },
      timeoutMs: 30_000,
      settleDelayMs: 5_000,
      visualDatasetEnabled: true,
      visualDatasetRootDirectory: '.data/visual-dataset',
      visualDatasetSplit: 'unassigned',
    });
  });

  it('uses environment values and CLI overrides', () => {
    expect(
      parseCarnaubaPlaywrightCommandOptions(
        [
          '--brand-id',
          '28',
          '--output-root',
          '.data/browser-out',
          '--width',
          '390',
          '--visual-dataset-enabled',
          'false',
          '--visual-dataset-split',
          'train',
        ],
        {
          CARNAUBA_API_BASE_URL: 'https://example.com/api',
          CARNAUBA_SITE_BASE_URL: 'https://example.com',
          CARNAUBA_STORE_CACHE_DIR: '.data/env-cache',
          CARNAUBA_STORE_CACHE_TTL_HOURS: '2',
          CARNAUBA_PLAYWRIGHT_LEAFLET_OUTPUT_DIR: '.data/env-browser-out',
          CARNAUBA_PLAYWRIGHT_HEIGHT: '844',
          CARNAUBA_PLAYWRIGHT_DEVICE_SCALE_FACTOR: '3',
          CARNAUBA_PLAYWRIGHT_TIMEOUT_MS: '5000',
          CARNAUBA_PLAYWRIGHT_SETTLE_DELAY_MS: '1000',
          CARNAUBA_VISUAL_DATASET_DIR: '.data/env-visual-dataset',
          CARNAUBA_VISUAL_DATASET_SPLIT: 'validation',
        },
      ),
    ).toEqual({
      apiBaseUrl: 'https://example.com/api',
      brandId: 28,
      cacheRootDirectory: '.data/env-cache',
      cacheTtlMs: 7_200_000,
      outputRootDirectory: '.data/browser-out',
      siteBaseUrl: 'https://example.com',
      viewport: {
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
      },
      timeoutMs: 5_000,
      settleDelayMs: 1_000,
      visualDatasetEnabled: false,
      visualDatasetRootDirectory: '.data/env-visual-dataset',
      visualDatasetSplit: 'train',
    });
  });

  it('rejects invalid values', () => {
    expect(() => parseCarnaubaPlaywrightCommandOptions(['api-base-url'], {})).toThrow(
      InvalidCarnaubaPlaywrightCommandOptionsError,
    );
    expect(() => parseCarnaubaPlaywrightCommandOptions(['--api-base-url'], {})).toThrow(
      InvalidCarnaubaPlaywrightCommandOptionsError,
    );
    expect(() => parseCarnaubaPlaywrightCommandOptions(['--site-base-url', 'invalid'], {})).toThrow(
      InvalidCarnaubaPlaywrightCommandOptionsError,
    );
    expect(() => parseCarnaubaPlaywrightCommandOptions(['--brand-id', '0'], {})).toThrow(
      InvalidCarnaubaPlaywrightCommandOptionsError,
    );
    expect(() => parseCarnaubaPlaywrightCommandOptions(['--cache-ttl-hours', '-1'], {})).toThrow(
      InvalidCarnaubaPlaywrightCommandOptionsError,
    );
    expect(() => parseCarnaubaPlaywrightCommandOptions(['--output-root', ' '], {})).toThrow(
      InvalidCarnaubaPlaywrightCommandOptionsError,
    );
    expect(() => parseCarnaubaPlaywrightCommandOptions(['--device-scale-factor', '0'], {})).toThrow(
      InvalidCarnaubaPlaywrightCommandOptionsError,
    );
    expect(() =>
      parseCarnaubaPlaywrightCommandOptions(['--visual-dataset-enabled', 'yes'], {}),
    ).toThrow(InvalidCarnaubaPlaywrightCommandOptionsError);
    expect(() =>
      parseCarnaubaPlaywrightCommandOptions(['--visual-dataset-split', 'invalid'], {}),
    ).toThrow(InvalidCarnaubaPlaywrightCommandOptionsError);
  });
});
