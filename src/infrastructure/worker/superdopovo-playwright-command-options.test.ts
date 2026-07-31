import { describe, expect, it } from 'vitest';
import {
  InvalidSuperDoPovoPlaywrightCommandOptionsError,
  parseSuperDoPovoPlaywrightCommandOptions,
} from './superdopovo-playwright-command-options';

describe('parseSuperDoPovoPlaywrightCommandOptions', () => {
  it('uses defaults', () => {
    expect(parseSuperDoPovoPlaywrightCommandOptions([], {})).toEqual({
      apiBaseUrl: 'https://loja.superdopovo.com.br/api/v1',
      defaultShopId: 24,
      outputRootDirectory: '.data/leaflets-playwright',
      siteBaseUrl: 'https://loja.superdopovo.com.br',
      viewport: {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      },
      timeoutMs: 30_000,
      shopTimeoutMs: 30_000,
      maxShopAttempts: 2,
      settleDelayMs: 3_000,
      visualDatasetEnabled: true,
      visualDatasetRootDirectory: '.data/visual-dataset',
      visualDatasetSplit: 'unassigned',
    });
  });

  it('uses environment values and CLI overrides', () => {
    expect(
      parseSuperDoPovoPlaywrightCommandOptions(
        [
          '--superdopovo-default-shop-id',
          '57',
          '--superdopovo-output-root',
          '.data/out',
          '--superdopovo-width',
          '390',
          '--superdopovo-visual-dataset-enabled',
          'false',
          '--superdopovo-max-shop-attempts',
          '3',
          '--superdopovo-visual-dataset-split',
          'train',
        ],
        {
          SUPERDOPOVO_API_BASE_URL: 'https://example.com/api/v1',
          SUPERDOPOVO_SITE_BASE_URL: 'https://example.com',
          SUPERDOPOVO_PLAYWRIGHT_LEAFLET_OUTPUT_DIR: '.data/env-out',
          SUPERDOPOVO_PLAYWRIGHT_HEIGHT: '844',
          SUPERDOPOVO_PLAYWRIGHT_DEVICE_SCALE_FACTOR: '3',
          SUPERDOPOVO_PLAYWRIGHT_TIMEOUT_MS: '5000',
          SUPERDOPOVO_PLAYWRIGHT_SHOP_TIMEOUT_MS: '60000',
          SUPERDOPOVO_PLAYWRIGHT_SETTLE_DELAY_MS: '1000',
          SUPERDOPOVO_VISUAL_DATASET_DIR: '.data/env-visual',
          SUPERDOPOVO_VISUAL_DATASET_SPLIT: 'validation',
        },
      ),
    ).toEqual({
      apiBaseUrl: 'https://example.com/api/v1',
      defaultShopId: 57,
      outputRootDirectory: '.data/out',
      siteBaseUrl: 'https://example.com',
      viewport: {
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
      },
      timeoutMs: 5_000,
      shopTimeoutMs: 60_000,
      maxShopAttempts: 3,
      settleDelayMs: 1_000,
      visualDatasetEnabled: false,
      visualDatasetRootDirectory: '.data/env-visual',
      visualDatasetSplit: 'train',
    });
  });

  it('rejects invalid values', () => {
    expect(() => parseSuperDoPovoPlaywrightCommandOptions(['name'], {})).toThrow(
      InvalidSuperDoPovoPlaywrightCommandOptionsError,
    );
    expect(() =>
      parseSuperDoPovoPlaywrightCommandOptions(['--superdopovo-api-base-url'], {}),
    ).toThrow(InvalidSuperDoPovoPlaywrightCommandOptionsError);
    expect(() =>
      parseSuperDoPovoPlaywrightCommandOptions(['--superdopovo-site-base-url', 'invalid'], {}),
    ).toThrow(InvalidSuperDoPovoPlaywrightCommandOptionsError);
    expect(() =>
      parseSuperDoPovoPlaywrightCommandOptions(['--superdopovo-default-shop-id', '0'], {}),
    ).toThrow(InvalidSuperDoPovoPlaywrightCommandOptionsError);
    expect(() =>
      parseSuperDoPovoPlaywrightCommandOptions(['--superdopovo-output-root', ' '], {}),
    ).toThrow(InvalidSuperDoPovoPlaywrightCommandOptionsError);
    expect(() =>
      parseSuperDoPovoPlaywrightCommandOptions(['--superdopovo-device-scale-factor', '0'], {}),
    ).toThrow(InvalidSuperDoPovoPlaywrightCommandOptionsError);
    expect(() =>
      parseSuperDoPovoPlaywrightCommandOptions(['--superdopovo-settle-delay-ms', '-1'], {}),
    ).toThrow(InvalidSuperDoPovoPlaywrightCommandOptionsError);
    expect(() =>
      parseSuperDoPovoPlaywrightCommandOptions(['--superdopovo-visual-dataset-enabled', 'yes'], {}),
    ).toThrow(InvalidSuperDoPovoPlaywrightCommandOptionsError);
    expect(() =>
      parseSuperDoPovoPlaywrightCommandOptions(['--superdopovo-visual-dataset-split', 'bad'], {}),
    ).toThrow(InvalidSuperDoPovoPlaywrightCommandOptionsError);
  });
});
