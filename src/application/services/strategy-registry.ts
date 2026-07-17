import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import type { SupermarketStrategy } from '../ports/supermarket-strategy';

export class StrategyNotFoundError extends Error {
  constructor(supermarketId: SupermarketId) {
    super(`Strategy not found for supermarket: ${supermarketId}.`);
    this.name = 'StrategyNotFoundError';
  }
}

export class StrategyRegistry {
  private readonly strategies: ReadonlyMap<SupermarketId, SupermarketStrategy>;

  constructor(strategies: readonly SupermarketStrategy[]) {
    this.strategies = new Map(
      strategies.map((strategy) => [strategy.supermarketId, strategy] as const),
    );
  }

  get(supermarketId: SupermarketId): SupermarketStrategy {
    const strategy = this.strategies.get(supermarketId);

    if (strategy === undefined) {
      throw new StrategyNotFoundError(supermarketId);
    }

    return strategy;
  }
}
