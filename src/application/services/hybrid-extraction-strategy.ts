import { createExtractionTarget } from '../../domain/extraction/extraction-target';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyOutput,
} from '../ports/extraction-strategy';

export interface HybridExtractionStrategyDependencies {
  readonly apiStrategy: ExtractionStrategy;
  readonly playwrightStrategy: ExtractionStrategy;
}

export class InvalidHybridExtractionStrategyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHybridExtractionStrategyError';
  }
}

export class HybridExtractionStrategy implements ExtractionStrategy {
  readonly supermarketId: SupermarketId;

  readonly mode = 'hybrid';

  private readonly apiStrategy: ExtractionStrategy;

  private readonly playwrightStrategy: ExtractionStrategy;

  constructor(supermarketId: SupermarketId, dependencies: HybridExtractionStrategyDependencies) {
    validateStrategy(supermarketId, dependencies.apiStrategy, 'api');
    validateStrategy(supermarketId, dependencies.playwrightStrategy, 'playwright');

    this.supermarketId = supermarketId;
    this.apiStrategy = dependencies.apiStrategy;
    this.playwrightStrategy = dependencies.playwrightStrategy;
  }

  async execute(input: ExtractionStrategyInput): Promise<ExtractionStrategyOutput> {
    try {
      input.logger.info('Hybrid extraction API attempt started.', {
        targetId: input.target.targetId,
        supermarketId: this.supermarketId,
        runId: input.runId,
      });

      const apiOutput = await this.apiStrategy.execute(createModeInput(input, 'api'));

      if (isFallbackRequired(apiOutput)) {
        input.logger.warn(
          'Hybrid extraction API attempt was incomplete; using Playwright fallback.',
          {
            targetId: input.target.targetId,
            supermarketId: this.supermarketId,
            runId: input.runId,
            status: apiOutput.status,
            leafletsFound: apiOutput.leafletsFound,
            failures: apiOutput.failures.length,
          },
        );

        return await this.executePlaywrightFallback(input);
      }

      input.logger.info('Hybrid extraction API attempt completed.', {
        targetId: input.target.targetId,
        supermarketId: this.supermarketId,
        runId: input.runId,
        leafletsFound: apiOutput.leafletsFound,
      });

      return apiOutput;
    } catch (error) {
      input.logger.warn('Hybrid extraction API attempt failed; using Playwright fallback.', {
        targetId: input.target.targetId,
        supermarketId: this.supermarketId,
        runId: input.runId,
        errorMessage: error instanceof Error ? error.message : 'Unexpected API extraction failure.',
      });

      return this.executePlaywrightFallback(input);
    }
  }

  private executePlaywrightFallback(
    input: ExtractionStrategyInput,
  ): Promise<ExtractionStrategyOutput> {
    return this.playwrightStrategy.execute(createModeInput(input, 'playwright'));
  }
}

function validateStrategy(
  supermarketId: SupermarketId,
  strategy: ExtractionStrategy,
  expectedMode: 'api' | 'playwright',
): void {
  if (strategy.supermarketId !== supermarketId) {
    throw new InvalidHybridExtractionStrategyError(
      `Hybrid ${expectedMode} strategy must belong to supermarket ${supermarketId}.`,
    );
  }

  if (strategy.mode !== expectedMode) {
    throw new InvalidHybridExtractionStrategyError(
      `Hybrid ${expectedMode} strategy must use ${expectedMode} mode.`,
    );
  }
}

function isFallbackRequired(output: ExtractionStrategyOutput): boolean {
  return output.status === 'failed' || output.leafletsFound === 0;
}

function createModeInput(
  input: ExtractionStrategyInput,
  mode: 'api' | 'playwright',
): ExtractionStrategyInput {
  return {
    ...input,
    target: createExtractionTarget({
      ...input.target,
      mode,
    }),
  };
}
