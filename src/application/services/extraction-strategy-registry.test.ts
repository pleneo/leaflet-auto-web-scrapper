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

  it('wraps an existing Playwright strategy with the Playwright extraction mode', () => {
    const strategy = createPlaywrightExtractionStrategy({
      supermarketId: 'assai',
      execute() {
        return Promise.reject(new Error('Strategy execution is not used by this test.'));
      },
    });

    expect(strategy.mode).toBe('playwright');
    expect(strategy.supermarketId).toBe('assai');
  });
});
