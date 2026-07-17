import { describe, expect, it } from 'vitest';
import {
  InvalidCarnaubaLeafletsSmokeCommandOptionsError,
  parseCarnaubaLeafletsSmokeCommandOptions,
} from './carnauba-leaflets-smoke-command-options';

describe('parseCarnaubaLeafletsSmokeCommandOptions', () => {
  it('parses defaults', () => {
    expect(parseCarnaubaLeafletsSmokeCommandOptions([])).toEqual({
      url: 'https://carnaubasupermercados.com.br/loja/79/encartes',
      outputRootDirectory: '.data/leaflets',
      viewport: {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      },
      timeoutMs: 30_000,
      settleDelayMs: 5_000,
    });
  });

  it('parses explicit options', () => {
    expect(
      parseCarnaubaLeafletsSmokeCommandOptions([
        '--url',
        'https://example.com/encartes',
        '--output-root',
        '.data/test-leaflets',
        '--width',
        '390',
        '--height',
        '844',
        '--device-scale-factor',
        '3',
        '--timeout-ms',
        '5000',
        '--settle-delay-ms',
        '1000',
      ]),
    ).toEqual({
      url: 'https://example.com/encartes',
      outputRootDirectory: '.data/test-leaflets',
      viewport: {
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
      },
      timeoutMs: 5_000,
      settleDelayMs: 1_000,
    });
  });

  it('rejects invalid options', () => {
    expect(() => parseCarnaubaLeafletsSmokeCommandOptions(['url'])).toThrow(
      InvalidCarnaubaLeafletsSmokeCommandOptionsError,
    );
    expect(() => parseCarnaubaLeafletsSmokeCommandOptions(['--url'])).toThrow(
      InvalidCarnaubaLeafletsSmokeCommandOptionsError,
    );
    expect(() => parseCarnaubaLeafletsSmokeCommandOptions(['--url', 'invalid'])).toThrow(
      InvalidCarnaubaLeafletsSmokeCommandOptionsError,
    );
    expect(() => parseCarnaubaLeafletsSmokeCommandOptions(['--output-root', ' '])).toThrow(
      InvalidCarnaubaLeafletsSmokeCommandOptionsError,
    );
    expect(() => parseCarnaubaLeafletsSmokeCommandOptions(['--width', '0'])).toThrow(
      InvalidCarnaubaLeafletsSmokeCommandOptionsError,
    );
    expect(() => parseCarnaubaLeafletsSmokeCommandOptions(['--device-scale-factor', '0'])).toThrow(
      InvalidCarnaubaLeafletsSmokeCommandOptionsError,
    );
    expect(() => parseCarnaubaLeafletsSmokeCommandOptions(['--timeout-ms', '1.5'])).toThrow(
      InvalidCarnaubaLeafletsSmokeCommandOptionsError,
    );
    expect(() => parseCarnaubaLeafletsSmokeCommandOptions(['--settle-delay-ms', '-1'])).toThrow(
      InvalidCarnaubaLeafletsSmokeCommandOptionsError,
    );
  });
});
