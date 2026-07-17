import { describe, expect, it } from 'vitest';
import type { SupermarketStrategy } from '../ports/supermarket-strategy';
import { StrategyNotFoundError, StrategyRegistry } from './strategy-registry';

const carnaubaStrategy: SupermarketStrategy = {
  supermarketId: 'carnauba',
  supermarketName: 'Carnauba',
  anchorUrl: 'https://example.com/carnauba',
  execute() {
    return Promise.reject(new Error('Strategy execution is not used by this test.'));
  },
};

describe('StrategyRegistry', () => {
  it('returns the strategy registered for a supermarket id', () => {
    const registry = new StrategyRegistry([carnaubaStrategy]);

    const strategy = registry.get('carnauba');

    expect(strategy).toBe(carnaubaStrategy);
  });

  it('throws when a strategy is not registered', () => {
    const registry = new StrategyRegistry([carnaubaStrategy]);

    expect(() => registry.get('assai')).toThrow(StrategyNotFoundError);
  });
});
