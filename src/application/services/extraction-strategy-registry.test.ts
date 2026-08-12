import { describe, expect, it } from 'vitest';
import { createExtractionTarget } from '../../domain/extraction/extraction-target';
import type { ExtractionStrategy } from '../ports/extraction-strategy';
import {
  createPlaywrightExtractionStrategy,
  DuplicateExtractionStrategyError,
  ExtractionStrategyNotFoundError,
  ExtractionStrategyRegistry,
} from './extraction-strategy-registry';

const carnaubaPlaywrightStrategy: ExtractionStrategy = {
  supermarketId: 'carnauba',
  mode: 'playwright',
  execute() {
    return Promise.reject(new Error('Strategy execution is not used by this test.'));
  },
};

const carnaubaApiStrategy: ExtractionStrategy = {
  supermarketId: 'carnauba',
  mode: 'api',
  execute() {
    return Promise.reject(new Error('Strategy execution is not used by this test.'));
  },
};

describe('ExtractionStrategyRegistry', () => {
  it('returns the strategy registered for the target supermarket and mode', () => {
    const registry = new ExtractionStrategyRegistry([
      carnaubaPlaywrightStrategy,
      carnaubaApiStrategy,
    ]);

    const strategy = registry.get(
      createExtractionTarget({
        targetId: 'carnauba',
        supermarketId: 'carnauba',
        supermarketName: 'Carnauba Supermercados',
        mode: 'api',
        enabled: true,
        intervalMinutes: 60,
        maxAttempts: 3,
      }),
    );

    expect(strategy).toBe(carnaubaApiStrategy);
  });

  it('rejects duplicate strategy registrations for the same supermarket and mode', () => {
    expect(
      () =>
        new ExtractionStrategyRegistry([carnaubaPlaywrightStrategy, carnaubaPlaywrightStrategy]),
    ).toThrow(DuplicateExtractionStrategyError);
  });

  it('allows the same supermarket to register different extraction modes', () => {
    expect(
      () => new ExtractionStrategyRegistry([carnaubaPlaywrightStrategy, carnaubaApiStrategy]),
    ).not.toThrow();
  });

  it('throws when no strategy is registered for the target mode', () => {
    const registry = new ExtractionStrategyRegistry([carnaubaPlaywrightStrategy]);

    expect(() =>
      registry.get(
        createExtractionTarget({
          targetId: 'carnauba',
          supermarketId: 'carnauba',
          supermarketName: 'Carnauba Supermercados',
          mode: 'hybrid',
          enabled: true,
          intervalMinutes: 60,
          maxAttempts: 3,
        }),
      ),
    ).toThrow(ExtractionStrategyNotFoundError);
  });

  it('wraps an existing Playwright strategy with the Playwright extraction mode', async () => {
    const innerStrategy = new ClassBackedPlaywrightStrategy();
    const strategy = createPlaywrightExtractionStrategy(innerStrategy);

    expect(strategy.mode).toBe('playwright');
    expect(strategy.supermarketId).toBe('assai');
    await expect(strategy.execute(createStrategyInput())).resolves.toMatchObject({
      supermarketId: 'assai',
      status: 'succeeded',
    });
  });
});

class ClassBackedPlaywrightStrategy implements Omit<ExtractionStrategy, 'mode'> {
  readonly supermarketId = 'assai';

  execute(): ReturnType<ExtractionStrategy['execute']> {
    return Promise.resolve({
      runId: 'run-1',
      targetId: 'assai',
      supermarketId: 'assai',
      status: 'succeeded',
      leafletsFound: 0,
      artifactsDownloaded: 0,
      artifactsReused: 0,
      datasetSamplesCreated: 0,
      units: [],
      failures: [],
    });
  }
}

function createStrategyInput(): Parameters<ExtractionStrategy['execute']>[0] {
  return {
    runId: 'run-1',
    target: createExtractionTarget({
      targetId: 'assai',
      supermarketId: 'assai',
      supermarketName: 'Assaí',
      mode: 'playwright',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    }),
    startedAtIso: '2026-08-12T12:00:00.000Z',
    visualDatasetCapturePolicy: 'disabled',
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  };
}
