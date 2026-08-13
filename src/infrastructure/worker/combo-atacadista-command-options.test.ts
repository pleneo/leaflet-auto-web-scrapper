import { describe, expect, it } from 'vitest';
import {
  InvalidComboAtacadistaCommandOptionsError,
  parseComboAtacadistaCommandOptions,
} from './combo-atacadista-command-options';

describe('Combo Atacadista command options', () => {
  it('parses defaults', () => {
    const options = parseComboAtacadistaCommandOptions([], {});

    expect(options.homeUrl).toBe('https://www.comboatacadista.com.br/');
    expect(options.offersUrl).toBe('https://www.comboatacadista.com.br/ofertas');
    expect(options.outputRootDirectory).toBe('.data/leaflets-playwright');
    expect(options.startUrlMode).toBe('offers-page');
    expect(options.visualDatasetEnabled).toBe(true);
    expect(options.viewport.width).toBe(1366);
  });

  it('parses CLI and env values', () => {
    const options = parseComboAtacadistaCommandOptions(
      [
        '--combo-start-url-mode',
        'home',
        '--combo-visual-dataset-enabled',
        'false',
        '--combo-visual-dataset-split',
        'train',
      ],
      {
        COMBO_ATACADISTA_WIDTH: '1440',
        COMBO_ATACADISTA_HEIGHT: '900',
        COMBO_ATACADISTA_SETTLE_DELAY_MS: '0',
      },
    );

    expect(options.startUrlMode).toBe('home');
    expect(options.visualDatasetEnabled).toBe(false);
    expect(options.visualDatasetSplit).toBe('train');
    expect(options.viewport.width).toBe(1440);
    expect(options.viewport.height).toBe(900);
    expect(options.settleDelayMs).toBe(0);
  });

  it('accepts every dataset split', () => {
    expect(
      parseComboAtacadistaCommandOptions(['--combo-visual-dataset-split', 'validation'], {})
        .visualDatasetSplit,
    ).toBe('validation');
    expect(
      parseComboAtacadistaCommandOptions(['--combo-visual-dataset-split', 'test'], {})
        .visualDatasetSplit,
    ).toBe('test');
    expect(
      parseComboAtacadistaCommandOptions(['--combo-visual-dataset-split', 'unassigned'], {})
        .visualDatasetSplit,
    ).toBe('unassigned');
  });

  it('rejects invalid arguments', () => {
    expect(() => parseComboAtacadistaCommandOptions(['combo-timeout-ms', '1'], {})).toThrow(
      InvalidComboAtacadistaCommandOptionsError,
    );
    expect(() => parseComboAtacadistaCommandOptions(['--combo-timeout-ms'], {})).toThrow(
      InvalidComboAtacadistaCommandOptionsError,
    );
    expect(() => parseComboAtacadistaCommandOptions(['--combo-home-url', ' '], {})).toThrow(
      InvalidComboAtacadistaCommandOptionsError,
    );
    expect(() => parseComboAtacadistaCommandOptions(['--combo-timeout-ms', '0'], {})).toThrow(
      InvalidComboAtacadistaCommandOptionsError,
    );
    expect(() => parseComboAtacadistaCommandOptions(['--combo-settle-delay-ms', '-1'], {})).toThrow(
      InvalidComboAtacadistaCommandOptionsError,
    );
    expect(() =>
      parseComboAtacadistaCommandOptions(['--combo-device-scale-factor', '0'], {}),
    ).toThrow(InvalidComboAtacadistaCommandOptionsError);
    expect(() =>
      parseComboAtacadistaCommandOptions(['--combo-visual-dataset-enabled', 'yes'], {}),
    ).toThrow(InvalidComboAtacadistaCommandOptionsError);
    expect(() =>
      parseComboAtacadistaCommandOptions(['--combo-visual-dataset-split', 'invalid'], {}),
    ).toThrow(InvalidComboAtacadistaCommandOptionsError);
    expect(() =>
      parseComboAtacadistaCommandOptions(['--combo-start-url-mode', 'invalid'], {}),
    ).toThrow(InvalidComboAtacadistaCommandOptionsError);
  });
});
