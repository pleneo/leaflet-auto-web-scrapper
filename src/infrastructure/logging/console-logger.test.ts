import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLogger } from './console-logger';

describe('ConsoleLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes messages at or above the configured level', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(ignoreConsoleOutput);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(ignoreConsoleOutput);
    const logger = new ConsoleLogger('info');

    logger.info('Started.');
    logger.warn('Slow response.', {
      runId: 'run-1',
    });

    expect(infoSpy).toHaveBeenCalledWith('[INFO] Started.');
    expect(warnSpy).toHaveBeenCalledWith('[WARN] Slow response.', {
      runId: 'run-1',
    });
  });

  it('writes debug messages through console.info', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(ignoreConsoleOutput);
    const logger = new ConsoleLogger('debug');

    logger.debug('Debug-visible message.', {
      runId: 'run-1',
    });

    expect(infoSpy).toHaveBeenCalledWith('[DEBUG] Debug-visible message.', {
      runId: 'run-1',
    });
  });

  it('writes debug messages without context', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(ignoreConsoleOutput);
    const logger = new ConsoleLogger('debug');

    logger.debug('Debug without context.');

    expect(infoSpy).toHaveBeenCalledWith('[DEBUG] Debug without context.');
  });

  it('skips messages below the configured level', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(ignoreConsoleOutput);
    const logger = new ConsoleLogger('warn');

    logger.info('Skipped.');

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('writes errors through console.error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(ignoreConsoleOutput);
    const logger = new ConsoleLogger('debug');

    logger.error('Failed.', {
      errorMessage: 'boom',
    });

    expect(errorSpy).toHaveBeenCalledWith('[ERROR] Failed.', {
      errorMessage: 'boom',
    });
  });

  it('writes warnings and errors without context', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(ignoreConsoleOutput);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(ignoreConsoleOutput);
    const logger = new ConsoleLogger('debug');

    logger.warn('Warning without context.');
    logger.error('Error without context.');

    expect(warnSpy).toHaveBeenCalledWith('[WARN] Warning without context.');
    expect(errorSpy).toHaveBeenCalledWith('[ERROR] Error without context.');
  });
});

function ignoreConsoleOutput(): void {
  return;
}
