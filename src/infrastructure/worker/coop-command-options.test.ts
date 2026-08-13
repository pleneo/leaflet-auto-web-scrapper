import { describe, expect, it } from 'vitest';
import { InvalidCoopCommandOptionsError, parseCoopCommandOptions } from './coop-command-options';

describe('Coop command options', () => {
  it('parses defaults', () => {
    const options = parseCoopCommandOptions([], {});

    expect(options.homeUrl).toBe('https://www.cooper.coop.br/');
    expect(options.offersUrl).toBe('https://www.cooper.coop.br/ofertas');
    expect(options.outputRootDirectory).toBe('.data/leaflets-playwright');
    expect(options.startUrlMode).toBe('store-page');
    expect(options.visualDatasetEnabled).toBe(true);
    expect(options.visualDatasetSplit).toBe('unassigned');
    expect(options.viewport.width).toBe(1366);
    expect(options.viewport.height).toBe(768);
    expect(options.viewport.deviceScaleFactor).toBe(1);
  });

  it('parses CLI and environment values', () => {
    const options = parseCoopCommandOptions(
      [
        '--coop-start-url-mode',
        'home',
        '--coop-output-root',
        '.data/coop-leaflets',
        '--coop-visual-dataset-enabled',
        'false',
        '--coop-visual-dataset-split',
        'train',
      ],
      {
        COOP_WIDTH: '1440',
        COOP_HEIGHT: '900',
        COOP_DEVICE_SCALE_FACTOR: '2',
        COOP_SETTLE_DELAY_MS: '0',
        COOP_TIMEOUT_MS: '45000',
        COOP_VISUAL_DATASET_DIR: '.data/coop-visual-dataset',
      },
    );

    expect(options.startUrlMode).toBe('home');
    expect(options.outputRootDirectory).toBe('.data/coop-leaflets');
    expect(options.visualDatasetEnabled).toBe(false);
    expect(options.visualDatasetSplit).toBe('train');
    expect(options.visualDatasetRootDirectory).toBe('.data/coop-visual-dataset');
    expect(options.viewport.width).toBe(1440);
    expect(options.viewport.height).toBe(900);
    expect(options.viewport.deviceScaleFactor).toBe(2);
    expect(options.timeoutMs).toBe(45_000);
    expect(options.settleDelayMs).toBe(0);
  });

  it('accepts every dataset split', () => {
    expect(
      parseCoopCommandOptions(['--coop-visual-dataset-split', 'validation'], {}),
    ).toMatchObject({
      visualDatasetSplit: 'validation',
    });
    expect(parseCoopCommandOptions(['--coop-visual-dataset-split', 'test'], {})).toMatchObject({
      visualDatasetSplit: 'test',
    });
    expect(
      parseCoopCommandOptions(['--coop-visual-dataset-split', 'unassigned'], {}),
    ).toMatchObject({
      visualDatasetSplit: 'unassigned',
    });
  });

  it('rejects invalid arguments', () => {
    expect(() => parseCoopCommandOptions(['coop-timeout-ms', '1'], {})).toThrow(
      InvalidCoopCommandOptionsError,
    );
    expect(() => parseCoopCommandOptions(['--coop-timeout-ms'], {})).toThrow(
      InvalidCoopCommandOptionsError,
    );
    expect(() => parseCoopCommandOptions(['--coop-home-url', ' '], {})).toThrow(
      InvalidCoopCommandOptionsError,
    );
    expect(() => parseCoopCommandOptions(['--coop-timeout-ms', '0'], {})).toThrow(
      InvalidCoopCommandOptionsError,
    );
    expect(() => parseCoopCommandOptions(['--coop-settle-delay-ms', '-1'], {})).toThrow(
      InvalidCoopCommandOptionsError,
    );
    expect(() => parseCoopCommandOptions(['--coop-device-scale-factor', '0'], {})).toThrow(
      InvalidCoopCommandOptionsError,
    );
    expect(() => parseCoopCommandOptions(['--coop-visual-dataset-enabled', 'yes'], {})).toThrow(
      InvalidCoopCommandOptionsError,
    );
    expect(() => parseCoopCommandOptions(['--coop-visual-dataset-split', 'invalid'], {})).toThrow(
      InvalidCoopCommandOptionsError,
    );
    expect(() => parseCoopCommandOptions(['--coop-start-url-mode', 'offers-page'], {})).toThrow(
      InvalidCoopCommandOptionsError,
    );
  });
});
