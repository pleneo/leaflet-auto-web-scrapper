import type { ExtractionMode, ExtractionTarget } from '../../domain/extraction/extraction-target';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import type { ExtractionStrategy } from '../ports/extraction-strategy';

export class DuplicateExtractionStrategyError extends Error {
  constructor(supermarketId: SupermarketId, mode: ExtractionMode) {
    super(`Duplicate extraction strategy for supermarket ${supermarketId} and mode ${mode}.`);
    this.name = 'DuplicateExtractionStrategyError';
  }
}

export class ExtractionStrategyNotFoundError extends Error {
  constructor(supermarketId: SupermarketId, mode: ExtractionMode) {
    super(`Extraction strategy not found for supermarket ${supermarketId} and mode ${mode}.`);
    this.name = 'ExtractionStrategyNotFoundError';
  }
}

export class ExtractionStrategyRegistry {
  private readonly strategies: ReadonlyMap<string, ExtractionStrategy>;

  constructor(strategies: readonly ExtractionStrategy[]) {
    this.strategies = createStrategyMap(strategies);
  }

  get(target: ExtractionTarget): ExtractionStrategy {
    const strategy = this.strategies.get(createStrategyKey(target.supermarketId, target.mode));

    if (strategy === undefined) {
      throw new ExtractionStrategyNotFoundError(target.supermarketId, target.mode);
    }

    return strategy;
  }
}

export function createPlaywrightExtractionStrategy(
  strategy: Omit<ExtractionStrategy, 'mode'>,
): ExtractionStrategy {
  return {
    ...strategy,
    mode: 'playwright',
  };
}

function createStrategyMap(
  strategies: readonly ExtractionStrategy[],
): ReadonlyMap<string, ExtractionStrategy> {
  const entries = new Map<string, ExtractionStrategy>();

  for (const strategy of strategies) {
    const key = createStrategyKey(strategy.supermarketId, strategy.mode);

    if (entries.has(key)) {
      throw new DuplicateExtractionStrategyError(strategy.supermarketId, strategy.mode);
    }

    entries.set(key, strategy);
  }

  return entries;
}

function createStrategyKey(supermarketId: SupermarketId, mode: ExtractionMode): string {
  return `${supermarketId}:${mode}`;
}
