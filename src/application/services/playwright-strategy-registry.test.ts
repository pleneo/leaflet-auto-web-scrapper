import { describe, expect, it } from 'vitest';
import type { PlaywrightExtractionStrategy } from '../ports/playwright-extraction-strategy';
import {
  DuplicatePlaywrightStrategyError,
  PlaywrightStrategyNotFoundError,
  PlaywrightStrategyRegistry,
} from './playwright-strategy-registry';

const carnaubaStrategy: PlaywrightExtractionStrategy = {
  supermarketId: 'carnauba',
  execute() {
    return Promise.reject(new Error('Strategy execution is not used by this test.'));
  },
};

describe('PlaywrightStrategyRegistry', () => {
  it('returns a strategy by supermarket id', () => {
    const registry = new PlaywrightStrategyRegistry([carnaubaStrategy]);

    expect(registry.get('carnauba')).toBe(carnaubaStrategy);
  });

  it('rejects duplicate strategy registrations', () => {
    expect(() => new PlaywrightStrategyRegistry([carnaubaStrategy, carnaubaStrategy])).toThrow(
      DuplicatePlaywrightStrategyError,
    );
  });

  it('throws when a strategy is not registered', () => {
    const registry = new PlaywrightStrategyRegistry([carnaubaStrategy]);

    expect(() => registry.get('assai')).toThrow(PlaywrightStrategyNotFoundError);
  });
});
