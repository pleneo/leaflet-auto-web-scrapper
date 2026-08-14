import { describe, expect, it } from 'vitest';
import {
  InvalidTausteCommandOptionsError,
  parseTausteCommandOptions,
} from './tauste-command-options';

describe('Tauste command options', () => {
  it('parses defaults', () => {
    const options = parseTausteCommandOptions([], {});

    expect(options.institutionalHomeUrl).toBe('https://institucional.tauste.com.br/');
    expect(options.institutionalOffersUrl).toBe('https://institucional.tauste.com.br/ofertas');
    expect(options.flipsnackProfileUrl).toBe('https://www.flipsnack.com/taustesupermercado/');
    expect(options.flipsnackApiBaseUrl).toBe('https://api.flipsnack.com/v2');
    expect(options.flipsnackAccountId).toBe('9D99E5AF8D6');
    expect(options.startUrlMode).toBe('flipsnack-profile');
    expect(options.visualDatasetEnabled).toBe(true);
    expect(options.viewport.width).toBe(1366);
  });

  it('parses CLI and environment values', () => {
    const options = parseTausteCommandOptions(
      [
        '--tauste-start-url-mode',
        'institutional-home',
        '--tauste-visual-dataset-enabled',
        'false',
        '--tauste-visual-dataset-split',
        'train',
      ],
      {
        TAUSTE_WIDTH: '1440',
        TAUSTE_HEIGHT: '900',
        TAUSTE_SETTLE_DELAY_MS: '0',
      },
    );

    expect(options.startUrlMode).toBe('institutional-home');
    expect(options.visualDatasetEnabled).toBe(false);
    expect(options.visualDatasetSplit).toBe('train');
    expect(options.viewport.width).toBe(1440);
    expect(options.viewport.height).toBe(900);
    expect(options.settleDelayMs).toBe(0);
  });

  it('accepts every dataset split', () => {
    expect(
      parseTausteCommandOptions(['--tauste-visual-dataset-split', 'validation'], {}),
    ).toMatchObject({
      visualDatasetSplit: 'validation',
    });
    expect(parseTausteCommandOptions(['--tauste-visual-dataset-split', 'test'], {})).toMatchObject({
      visualDatasetSplit: 'test',
    });
    expect(
      parseTausteCommandOptions(['--tauste-visual-dataset-split', 'unassigned'], {}),
    ).toMatchObject({
      visualDatasetSplit: 'unassigned',
    });
  });

  it('rejects invalid arguments', () => {
    expect(() => parseTausteCommandOptions(['tauste-timeout-ms', '1'], {})).toThrow(
      InvalidTausteCommandOptionsError,
    );
    expect(() => parseTausteCommandOptions(['--tauste-timeout-ms'], {})).toThrow(
      InvalidTausteCommandOptionsError,
    );
    expect(() => parseTausteCommandOptions(['--tauste-timeout-ms', '0'], {})).toThrow(
      InvalidTausteCommandOptionsError,
    );
    expect(() => parseTausteCommandOptions(['--tauste-settle-delay-ms', '-1'], {})).toThrow(
      InvalidTausteCommandOptionsError,
    );
    expect(() => parseTausteCommandOptions(['--tauste-device-scale-factor', '0'], {})).toThrow(
      InvalidTausteCommandOptionsError,
    );
    expect(() => parseTausteCommandOptions(['--tauste-visual-dataset-enabled', 'yes'], {})).toThrow(
      InvalidTausteCommandOptionsError,
    );
    expect(() =>
      parseTausteCommandOptions(['--tauste-visual-dataset-split', 'invalid'], {}),
    ).toThrow(InvalidTausteCommandOptionsError);
    expect(() => parseTausteCommandOptions(['--tauste-start-url-mode', 'invalid'], {})).toThrow(
      InvalidTausteCommandOptionsError,
    );
    expect(() => parseTausteCommandOptions(['--tauste-flipsnack-account-id', ' '], {})).toThrow(
      InvalidTausteCommandOptionsError,
    );
  });
});
