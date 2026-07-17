import { describe, expect, it } from 'vitest';
import {
  InvalidVisualCaptureSmokeCommandOptionsError,
  parseVisualCaptureSmokeCommandOptions,
} from './visual-capture-smoke-command-options';

describe('parseVisualCaptureSmokeCommandOptions', () => {
  it('parses the required url with defaults', () => {
    const options = parseVisualCaptureSmokeCommandOptions(['--url', 'https://example.com']);

    expect(options).toEqual({
      url: 'https://example.com',
      artifactRootDirectory: '.data/artifacts',
      supermarketId: 'generic-supermarket',
      viewport: {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      },
      fullPage: true,
      timeoutMs: 30_000,
      settleDelayMs: 5_000,
    });
  });

  it('parses explicit options', () => {
    const options = parseVisualCaptureSmokeCommandOptions([
      '--url',
      'https://example.com/leaflet',
      '--artifact-root',
      '.data/smoke',
      '--supermarket',
      'carnauba',
      '--width',
      '390',
      '--height',
      '844',
      '--device-scale-factor',
      '3',
      '--full-page',
      'false',
      '--timeout-ms',
      '5000',
      '--settle-delay-ms',
      '7000',
    ]);

    expect(options).toEqual({
      url: 'https://example.com/leaflet',
      artifactRootDirectory: '.data/smoke',
      supermarketId: 'carnauba',
      viewport: {
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
      },
      fullPage: false,
      timeoutMs: 5_000,
      settleDelayMs: 7_000,
    });
  });

  it('accepts every known supermarket id', () => {
    const supermarketIds = ['assai', 'carnauba', 'generic-supermarket', 'sao-luiz'] as const;

    for (const supermarketId of supermarketIds) {
      expect(
        parseVisualCaptureSmokeCommandOptions([
          '--url',
          'https://example.com',
          '--supermarket',
          supermarketId,
        ]).supermarketId,
      ).toBe(supermarketId);
    }
  });

  it('rejects invalid argument shape', () => {
    expect(() => parseVisualCaptureSmokeCommandOptions(['url', 'https://example.com'])).toThrow(
      InvalidVisualCaptureSmokeCommandOptionsError,
    );

    expect(() => parseVisualCaptureSmokeCommandOptions(['--url'])).toThrow(
      InvalidVisualCaptureSmokeCommandOptionsError,
    );
  });

  it('rejects missing or invalid urls', () => {
    expect(() => parseVisualCaptureSmokeCommandOptions([])).toThrow(
      InvalidVisualCaptureSmokeCommandOptionsError,
    );

    expect(() => parseVisualCaptureSmokeCommandOptions(['--url', 'invalid-url'])).toThrow(
      InvalidVisualCaptureSmokeCommandOptionsError,
    );
  });

  it('rejects invalid numeric, boolean, and supermarket values', () => {
    expect(() =>
      parseVisualCaptureSmokeCommandOptions([
        '--url',
        'https://example.com',
        '--artifact-root',
        ' ',
      ]),
    ).toThrow(InvalidVisualCaptureSmokeCommandOptionsError);

    expect(
      parseVisualCaptureSmokeCommandOptions(['--url', 'https://example.com', '--full-page', 'true'])
        .fullPage,
    ).toBe(true);

    expect(() =>
      parseVisualCaptureSmokeCommandOptions(['--url', 'https://example.com', '--width', '0']),
    ).toThrow(InvalidVisualCaptureSmokeCommandOptionsError);

    expect(() =>
      parseVisualCaptureSmokeCommandOptions(['--url', 'https://example.com', '--height', '1.5']),
    ).toThrow(InvalidVisualCaptureSmokeCommandOptionsError);

    expect(() =>
      parseVisualCaptureSmokeCommandOptions([
        '--url',
        'https://example.com',
        '--settle-delay-ms',
        '-1',
      ]),
    ).toThrow(InvalidVisualCaptureSmokeCommandOptionsError);

    expect(() =>
      parseVisualCaptureSmokeCommandOptions([
        '--url',
        'https://example.com',
        '--device-scale-factor',
        '0',
      ]),
    ).toThrow(InvalidVisualCaptureSmokeCommandOptionsError);

    expect(() =>
      parseVisualCaptureSmokeCommandOptions(['--url', 'https://example.com', '--full-page', 'yes']),
    ).toThrow(InvalidVisualCaptureSmokeCommandOptionsError);

    expect(() =>
      parseVisualCaptureSmokeCommandOptions([
        '--url',
        'https://example.com',
        '--supermarket',
        'unknown-market',
      ]),
    ).toThrow(InvalidVisualCaptureSmokeCommandOptionsError);
  });
});
