import { describe, expect, it } from 'vitest';
import {
  filterAtacadaoStores,
  InvalidAtacadaoPlaywrightCommandOptionsError,
  parseAtacadaoPlaywrightCommandOptions,
} from './atacadao-playwright-command-options';

describe('parseAtacadaoPlaywrightCommandOptions', () => {
  it('uses defaults', () => {
    expect(parseAtacadaoPlaywrightCommandOptions([], {})).toEqual({
      outputRootDirectory: '.data/leaflets-playwright',
      viewport: {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      },
      timeoutMs: 30_000,
      storeTimeoutMs: 90_000,
      maxStoreAttempts: 2,
      settleDelayMs: 3_000,
      visualDatasetEnabled: true,
      visualDatasetRootDirectory: '.data/visual-dataset',
      visualDatasetSplit: 'unassigned',
      storeSlugs: [],
      stateCodes: [],
      cityNames: [],
    });
  });

  it('uses environment values and CLI overrides', () => {
    expect(
      parseAtacadaoPlaywrightCommandOptions(
        [
          '--atacadao-output-root',
          '.data/out',
          '--atacadao-width',
          '390',
          '--atacadao-visual-dataset-enabled',
          'false',
          '--atacadao-store-slugs',
          'ipiranga,penha',
          '--atacadao-state-codes',
          'sp,ce',
          '--atacadao-city-names',
          'Sao Paulo, Fortaleza ',
          '--atacadao-visual-dataset-split',
          'train',
        ],
        {
          ATACADAO_PLAYWRIGHT_LEAFLET_OUTPUT_DIR: '.data/env-out',
          ATACADAO_PLAYWRIGHT_HEIGHT: '844',
          ATACADAO_PLAYWRIGHT_DEVICE_SCALE_FACTOR: '3',
          ATACADAO_PLAYWRIGHT_TIMEOUT_MS: '5000',
          ATACADAO_PLAYWRIGHT_STORE_TIMEOUT_MS: '60000',
          ATACADAO_PLAYWRIGHT_SETTLE_DELAY_MS: '1000',
          ATACADAO_VISUAL_DATASET_DIR: '.data/env-visual',
          ATACADAO_VISUAL_DATASET_SPLIT: 'validation',
        },
      ),
    ).toEqual({
      outputRootDirectory: '.data/out',
      viewport: {
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
      },
      timeoutMs: 5_000,
      storeTimeoutMs: 60_000,
      maxStoreAttempts: 2,
      settleDelayMs: 1_000,
      visualDatasetEnabled: false,
      visualDatasetRootDirectory: '.data/env-visual',
      visualDatasetSplit: 'train',
      storeSlugs: ['ipiranga', 'penha'],
      stateCodes: ['SP', 'CE'],
      cityNames: ['Sao Paulo', 'Fortaleza'],
    });
  });

  it('rejects invalid values', () => {
    expect(() => parseAtacadaoPlaywrightCommandOptions(['name'], {})).toThrow(
      InvalidAtacadaoPlaywrightCommandOptionsError,
    );
    expect(() => parseAtacadaoPlaywrightCommandOptions(['--atacadao-output-root'], {})).toThrow(
      InvalidAtacadaoPlaywrightCommandOptionsError,
    );
    expect(() => parseAtacadaoPlaywrightCommandOptions(['--atacadao-width', '0'], {})).toThrow(
      InvalidAtacadaoPlaywrightCommandOptionsError,
    );
    expect(() =>
      parseAtacadaoPlaywrightCommandOptions(['--atacadao-output-root', ' '], {}),
    ).toThrow(InvalidAtacadaoPlaywrightCommandOptionsError);
    expect(() =>
      parseAtacadaoPlaywrightCommandOptions(['--atacadao-device-scale-factor', '0'], {}),
    ).toThrow(InvalidAtacadaoPlaywrightCommandOptionsError);
    expect(() =>
      parseAtacadaoPlaywrightCommandOptions(['--atacadao-settle-delay-ms', '-1'], {}),
    ).toThrow(InvalidAtacadaoPlaywrightCommandOptionsError);
    expect(() =>
      parseAtacadaoPlaywrightCommandOptions(['--atacadao-visual-dataset-enabled', 'yes'], {}),
    ).toThrow(InvalidAtacadaoPlaywrightCommandOptionsError);
    expect(() =>
      parseAtacadaoPlaywrightCommandOptions(['--atacadao-visual-dataset-split', 'bad'], {}),
    ).toThrow(InvalidAtacadaoPlaywrightCommandOptionsError);
  });
});

describe('filterAtacadaoStores', () => {
  it('filters stores by slug, state, and normalized city', () => {
    const stores = [
      {
        stateCode: 'SP',
        cityName: 'Sao Paulo',
        storeSlug: 'ipiranga',
        storeName: 'Ipiranga',
        finalPageUrl: 'https://www.atacadao.com.br/loja/ipiranga',
      },
      {
        stateCode: 'CE',
        cityName: 'Fortaleza',
        storeSlug: 'fortaleza-papicu',
        storeName: 'Fortaleza Papicu',
        finalPageUrl: 'https://www.atacadao.com.br/loja/fortaleza-papicu',
      },
    ] as const;

    expect(
      filterAtacadaoStores(stores, {
        storeSlugs: [],
        stateCodes: ['SP'],
        cityNames: ['São Paulo'],
      }),
    ).toEqual([stores[0]]);
    expect(
      filterAtacadaoStores(stores, {
        storeSlugs: ['fortaleza-papicu'],
        stateCodes: [],
        cityNames: [],
      }),
    ).toEqual([stores[1]]);
  });
});
