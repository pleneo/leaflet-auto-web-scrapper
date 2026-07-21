import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonLogger } from './json-logger';

describe('JsonLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes structured JSON log entries', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(ignoreConsoleOutput);
    const logger = new JsonLogger('info', () => '2026-07-21T10:00:00.000Z');

    logger.info('Run started.', {
      runId: 'run-1',
      storeId: 79,
    });

    expect(infoSpy).toHaveBeenCalledWith(
      JSON.stringify({
        timestamp: '2026-07-21T10:00:00.000Z',
        level: 'info',
        message: 'Run started.',
        context: {
          runId: 'run-1',
          storeId: 79,
        },
      }),
    );
  });

  it('writes null context when no context is provided', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(ignoreConsoleOutput);
    const logger = new JsonLogger('debug', () => '2026-07-21T10:00:00.000Z');

    logger.debug('No context.');

    expect(infoSpy).toHaveBeenCalledWith(
      JSON.stringify({
        timestamp: '2026-07-21T10:00:00.000Z',
        level: 'debug',
        message: 'No context.',
        context: null,
      }),
    );
  });

  it('skips entries below the configured level', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(ignoreConsoleOutput);
    const logger = new JsonLogger('warn', () => '2026-07-21T10:00:00.000Z');

    logger.info('Skipped.');

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('routes warn and error entries to the expected console methods', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(ignoreConsoleOutput);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(ignoreConsoleOutput);
    const logger = new JsonLogger('debug', () => '2026-07-21T10:00:00.000Z');

    logger.warn('Warn.');
    logger.error('Error.');

    expect(warnSpy).toHaveBeenCalledWith(
      JSON.stringify({
        timestamp: '2026-07-21T10:00:00.000Z',
        level: 'warn',
        message: 'Warn.',
        context: null,
      }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      JSON.stringify({
        timestamp: '2026-07-21T10:00:00.000Z',
        level: 'error',
        message: 'Error.',
        context: null,
      }),
    );
  });
});

function ignoreConsoleOutput(): void {
  return;
}
