import { describe, expect, it } from 'vitest';
import {
  filterAssaiStores,
  InvalidAssaiPlaywrightCommandOptionsError,
  parseAssaiPlaywrightCommandOptions,
} from './assai-playwright-command-options';

describe('Assai Playwright command options', () => {
  it('parses defaults', () => {
    const options = parseAssaiPlaywrightCommandOptions([], {});

    expect(options.catalogUrl).toBe(
      'https://www.assai.com.br/sites/default/files/static/ofertas_assai.json',
    );
    expect(options.outputRootDirectory).toBe('.data/leaflets-playwright');
    expect(options.cacheRootDirectory).toBe('.data/cache');
    expect(options.visualDatasetEnabled).toBe(true);
    expect(options.viewport.width).toBe(1366);
  });

  it('parses cli values and filters stores', () => {
    const options = parseAssaiPlaywrightCommandOptions(
      [
        '--assai-store-slugs',
        'assai-parangaba',
        '--assai-state-codes',
        'ce',
        '--assai-city-names',
        'fortaleza',
        '--assai-visual-dataset-enabled',
        'false',
      ],
      {},
    );
    const stores = filterAssaiStores(
      [
        {
          stateCode: 'CE',
          stateName: 'Ceara',
          cityName: 'Fortaleza',
          storeSlug: 'assai-parangaba',
          storeName: 'Assai Atacadista Parangaba',
          initialPageUrl: 'https://www.assai.com.br/ofertas/ceara/assai-parangaba',
        },
        {
          stateCode: 'SP',
          stateName: 'Sao Paulo',
          cityName: 'Sao Paulo',
          storeSlug: 'assai-vila-sonia',
          storeName: 'Assai Atacadista Vila Sonia',
          initialPageUrl: 'https://www.assai.com.br/ofertas/sao-paulo/assai-vila-sonia',
        },
      ],
      options,
    );

    expect(options.visualDatasetEnabled).toBe(false);
    expect(options.stateCodes).toEqual(['CE']);
    expect(stores.map((store) => store.storeSlug)).toEqual(['assai-parangaba']);
  });

  it('reads env values', () => {
    const options = parseAssaiPlaywrightCommandOptions([], {
      ASSAI_OFFER_CATALOG_URL: 'https://www.assai.com.br/catalog.json',
      ASSAI_PLAYWRIGHT_SETTLE_DELAY_MS: '0',
      ASSAI_PLAYWRIGHT_DEVICE_SCALE_FACTOR: '2',
    });

    expect(options.catalogUrl).toBe('https://www.assai.com.br/catalog.json');
    expect(options.settleDelayMs).toBe(0);
    expect(options.viewport.deviceScaleFactor).toBe(2);
  });

  it('accepts every dataset split', () => {
    expect(
      parseAssaiPlaywrightCommandOptions(['--assai-visual-dataset-split', 'train'], {})
        .visualDatasetSplit,
    ).toBe('train');
    expect(
      parseAssaiPlaywrightCommandOptions(['--assai-visual-dataset-split', 'validation'], {})
        .visualDatasetSplit,
    ).toBe('validation');
    expect(
      parseAssaiPlaywrightCommandOptions(['--assai-visual-dataset-split', 'test'], {})
        .visualDatasetSplit,
    ).toBe('test');
  });

  it('rejects invalid arguments', () => {
    expect(() => parseAssaiPlaywrightCommandOptions(['assai-timeout-ms', '1'], {})).toThrow(
      InvalidAssaiPlaywrightCommandOptionsError,
    );
    expect(() => parseAssaiPlaywrightCommandOptions(['--assai-timeout-ms'], {})).toThrow(
      InvalidAssaiPlaywrightCommandOptionsError,
    );
    expect(() => parseAssaiPlaywrightCommandOptions(['--assai-catalog-url', ' '], {})).toThrow(
      InvalidAssaiPlaywrightCommandOptionsError,
    );
    expect(() => parseAssaiPlaywrightCommandOptions(['--assai-timeout-ms', '0'], {})).toThrow(
      InvalidAssaiPlaywrightCommandOptionsError,
    );
    expect(() => parseAssaiPlaywrightCommandOptions(['--assai-settle-delay-ms', '-1'], {})).toThrow(
      InvalidAssaiPlaywrightCommandOptionsError,
    );
    expect(() =>
      parseAssaiPlaywrightCommandOptions(['--assai-device-scale-factor', '0'], {}),
    ).toThrow(InvalidAssaiPlaywrightCommandOptionsError);
    expect(() =>
      parseAssaiPlaywrightCommandOptions(['--assai-visual-dataset-enabled', 'yes'], {}),
    ).toThrow(InvalidAssaiPlaywrightCommandOptionsError);
    expect(() =>
      parseAssaiPlaywrightCommandOptions(['--assai-visual-dataset-split', 'invalid'], {}),
    ).toThrow(InvalidAssaiPlaywrightCommandOptionsError);
  });
});
