import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import type { PlaywrightExtractionStrategy } from '../ports/playwright-extraction-strategy';

export class DuplicatePlaywrightStrategyError extends Error {
  constructor(supermarketId: SupermarketId) {
    super(`Duplicate Playwright strategy for supermarket: ${supermarketId}.`);
    this.name = 'DuplicatePlaywrightStrategyError';
  }
}

export class PlaywrightStrategyNotFoundError extends Error {
  constructor(supermarketId: SupermarketId) {
    super(`Playwright strategy not found for supermarket: ${supermarketId}.`);
    this.name = 'PlaywrightStrategyNotFoundError';
  }
}

export class PlaywrightStrategyRegistry {
  private readonly strategies: ReadonlyMap<SupermarketId, PlaywrightExtractionStrategy>;

  constructor(strategies: readonly PlaywrightExtractionStrategy[]) {
    this.strategies = createStrategyMap(strategies);
  }

  get(supermarketId: SupermarketId): PlaywrightExtractionStrategy {
    const strategy = this.strategies.get(supermarketId);

    if (strategy === undefined) {
      throw new PlaywrightStrategyNotFoundError(supermarketId);
    }

    return strategy;
  }
}

function createStrategyMap(
  strategies: readonly PlaywrightExtractionStrategy[],
): ReadonlyMap<SupermarketId, PlaywrightExtractionStrategy> {
  const entries = new Map<SupermarketId, PlaywrightExtractionStrategy>();

  for (const strategy of strategies) {
    if (entries.has(strategy.supermarketId)) {
      throw new DuplicatePlaywrightStrategyError(strategy.supermarketId);
    }

    entries.set(strategy.supermarketId, strategy);
  }

  return entries;
}
