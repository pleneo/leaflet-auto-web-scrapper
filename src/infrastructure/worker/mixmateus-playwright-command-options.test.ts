import { describe, expect, it } from 'vitest';
import {
  InvalidMixMateusPlaywrightCommandOptionsError,
  parseMixMateusPlaywrightCommandOptions,
} from './mixmateus-playwright-command-options';

describe('parseMixMateusPlaywrightCommandOptions', () => {
  it('uses defaults', () => {
    expect(parseMixMateusPlaywrightCommandOptions([], {})).toEqual({
      outputRootDirectory: '.data/leaflets-playwright',
      siteBaseUrl: 'https://ofertasmateus.com/',
      viewport: {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      },
      timeoutMs: 30_000,
      storeTimeoutMs: 30_000,
      maxStoreAttempts: 2,
      settleDelayMs: 3_000,
      visualDatasetEnabled: true,
      visualDatasetRootDirectory: '.data/visual-dataset',
      visualDatasetSplit: 'unassigned',
    });
  });

  it('uses environment values and CLI overrides', () => {
    expect(
      parseMixMateusPlaywrightCommandOptions(
        [
          '--mixmateus-output-root',
          '.data/out',
          '--mixmateus-width',
          '390',
          '--mixmateus-visual-dataset-enabled',
          'false',
          '--mixmateus-max-store-attempts',
          '3',
          '--mixmateus-visual-dataset-split',
          'train',
        ],
        {
          MIXMATEUS_SITE_BASE_URL: 'https://example.com',
          MIXMATEUS_PLAYWRIGHT_LEAFLET_OUTPUT_DIR: '.data/env-out',
          MIXMATEUS_PLAYWRIGHT_HEIGHT: '844',
          MIXMATEUS_PLAYWRIGHT_DEVICE_SCALE_FACTOR: '3',
          MIXMATEUS_PLAYWRIGHT_TIMEOUT_MS: '5000',
          MIXMATEUS_PLAYWRIGHT_STORE_TIMEOUT_MS: '60000',
          MIXMATEUS_PLAYWRIGHT_SETTLE_DELAY_MS: '1000',
          MIXMATEUS_VISUAL_DATASET_DIR: '.data/env-visual',
          MIXMATEUS_VISUAL_DATASET_SPLIT: 'validation',
        },
      ),
    ).toEqual({
      outputRootDirectory: '.data/out',
      siteBaseUrl: 'https://example.com',
      viewport: {
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
      },
      timeoutMs: 5_000,
      storeTimeoutMs: 60_000,
      maxStoreAttempts: 3,
      settleDelayMs: 1_000,
      visualDatasetEnabled: false,
      visualDatasetRootDirectory: '.data/env-visual',
      visualDatasetSplit: 'train',
    });
  });

  it('rejects invalid values', () => {
    expect(() => parseMixMateusPlaywrightCommandOptions(['name'], {})).toThrow(
      InvalidMixMateusPlaywrightCommandOptionsError,
    );
    expect(() => parseMixMateusPlaywrightCommandOptions(['--mixmateus-site-base-url'], {})).toThrow(
      InvalidMixMateusPlaywrightCommandOptionsError,
    );
    expect(() =>
      parseMixMateusPlaywrightCommandOptions(['--mixmateus-site-base-url', 'invalid'], {}),
    ).toThrow(InvalidMixMateusPlaywrightCommandOptionsError);
    expect(() => parseMixMateusPlaywrightCommandOptions(['--mixmateus-width', '0'], {})).toThrow(
      InvalidMixMateusPlaywrightCommandOptionsError,
    );
    expect(() =>
      parseMixMateusPlaywrightCommandOptions(['--mixmateus-output-root', ' '], {}),
    ).toThrow(InvalidMixMateusPlaywrightCommandOptionsError);
    expect(() =>
      parseMixMateusPlaywrightCommandOptions(['--mixmateus-device-scale-factor', '0'], {}),
    ).toThrow(InvalidMixMateusPlaywrightCommandOptionsError);
    expect(() =>
      parseMixMateusPlaywrightCommandOptions(['--mixmateus-settle-delay-ms', '-1'], {}),
    ).toThrow(InvalidMixMateusPlaywrightCommandOptionsError);
    expect(() =>
      parseMixMateusPlaywrightCommandOptions(['--mixmateus-visual-dataset-enabled', 'yes'], {}),
    ).toThrow(InvalidMixMateusPlaywrightCommandOptionsError);
    expect(() =>
      parseMixMateusPlaywrightCommandOptions(['--mixmateus-visual-dataset-split', 'bad'], {}),
    ).toThrow(InvalidMixMateusPlaywrightCommandOptionsError);
  });
});
