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
});
