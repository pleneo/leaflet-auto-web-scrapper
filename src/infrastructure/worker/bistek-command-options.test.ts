import { describe, expect, it } from 'vitest';
import {
  InvalidBistekCommandOptionsError,
  parseBistekCommandOptions,
} from './bistek-command-options';

describe('parseBistekCommandOptions', () => {
  it('parses defaults and filters from args', () => {
    expect(
      parseBistekCommandOptions(
        [
          '--bistek-store-ids',
          '2,3',
          '--bistek-city-ids',
          '4348',
          '--bistek-visual-dataset-enabled',
          'false',
        ],
        {},
      ),
    ).toMatchObject({
      baseUrl: 'https://institucional.bistek.com.br',
      offersUrl: 'https://institucional.bistek.com.br/ofertas',
      storeIds: ['2', '3'],
      cityIds: ['4348'],
      visualDatasetEnabled: false,
      viewport: {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      },
    });
  });

  it('reads env overrides and rejects invalid values', () => {
    expect(
      parseBistekCommandOptions([], {
        BISTEK_STORE_IDS: '7',
        BISTEK_VISUAL_DATASET_SPLIT: 'train',
      }),
    ).toMatchObject({
      storeIds: ['7'],
      visualDatasetSplit: 'train',
    });

    expect(() => parseBistekCommandOptions(['--bistek-width', '0'], {})).toThrow(
      InvalidBistekCommandOptionsError,
    );
    expect(() => parseBistekCommandOptions(['--bistek-visual-dataset-enabled', 'yes'], {})).toThrow(
      InvalidBistekCommandOptionsError,
    );
    expect(() => parseBistekCommandOptions(['--bistek-visual-dataset-split', 'bad'], {})).toThrow(
      InvalidBistekCommandOptionsError,
    );
  });

  it('parses all scalar overrides and rejects malformed arguments', () => {
    expect(
      parseBistekCommandOptions(
        [
          '--bistek-base-url',
          'https://example.com',
          '--bistek-offers-url',
          'https://example.com/ofertas',
          '--bistek-output-root',
          '.out',
          '--bistek-width',
          '1440',
          '--bistek-height',
          '900',
          '--bistek-device-scale-factor',
          '2',
          '--bistek-timeout-ms',
          '1000',
          '--bistek-store-timeout-ms',
          '2000',
          '--bistek-max-store-attempts',
          '3',
          '--bistek-settle-delay-ms',
          '0',
          '--bistek-visual-dataset-root',
          '.visual',
          '--bistek-visual-dataset-split',
          'test',
        ],
        {},
      ),
    ).toMatchObject({
      baseUrl: 'https://example.com',
      offersUrl: 'https://example.com/ofertas',
      outputRootDirectory: '.out',
      timeoutMs: 1000,
      storeTimeoutMs: 2000,
      maxStoreAttempts: 3,
      settleDelayMs: 0,
      visualDatasetRootDirectory: '.visual',
      visualDatasetSplit: 'test',
      viewport: {
        width: 1440,
        height: 900,
        deviceScaleFactor: 2,
      },
    });

    expect(() => parseBistekCommandOptions(['bistek-width', '1440'], {})).toThrow(
      'Arguments must use --name value format.',
    );
    expect(() => parseBistekCommandOptions(['--bistek-width'], {})).toThrow(
      'Argument --bistek-width must have a value.',
    );
    expect(() => parseBistekCommandOptions(['--bistek-base-url', ' '], {})).toThrow(
      '--bistek-base-url cannot be blank.',
    );
    expect(() => parseBistekCommandOptions(['--bistek-settle-delay-ms', '-1'], {})).toThrow(
      '--bistek-settle-delay-ms must be a non-negative integer.',
    );
    expect(() => parseBistekCommandOptions(['--bistek-device-scale-factor', '0'], {})).toThrow(
      '--bistek-device-scale-factor must be a positive number.',
    );
  });
});
