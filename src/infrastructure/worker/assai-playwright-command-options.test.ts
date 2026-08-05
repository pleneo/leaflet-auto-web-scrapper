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

  it('rejects invalid arguments', () => {
    expect(() => parseAssaiPlaywrightCommandOptions(['assai-timeout-ms', '1'], {})).toThrow(
      InvalidAssaiPlaywrightCommandOptionsError,
    );
    expect(() => parseAssaiPlaywrightCommandOptions(['--assai-timeout-ms', '0'], {})).toThrow(
      InvalidAssaiPlaywrightCommandOptionsError,
    );
    expect(() =>
      parseAssaiPlaywrightCommandOptions(['--assai-visual-dataset-enabled', 'yes'], {}),
    ).toThrow(InvalidAssaiPlaywrightCommandOptionsError);
    expect(() =>
      parseAssaiPlaywrightCommandOptions(['--assai-visual-dataset-split', 'invalid'], {}),
    ).toThrow(InvalidAssaiPlaywrightCommandOptionsError);
  });
});
