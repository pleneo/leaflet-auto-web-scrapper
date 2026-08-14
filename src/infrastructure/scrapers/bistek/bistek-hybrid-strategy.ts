import { createExtractionTarget } from '../../../domain/extraction/extraction-target';
import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyOutput,
} from '../../../application/ports/extraction-strategy';
import type { SupermarketId } from '../../../domain/supermarket/supermarket-id';

export interface BistekHybridStrategyDependencies {
  readonly apiStrategy: ExtractionStrategy;
  readonly playwrightStrategy: ExtractionStrategy;
}

export class InvalidBistekHybridStrategyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBistekHybridStrategyError';
  }
}

export class BistekHybridStrategy implements ExtractionStrategy {
  readonly supermarketId: SupermarketId = 'bistek';

  readonly mode = 'hybrid';

  private readonly apiStrategy: ExtractionStrategy;

  private readonly playwrightStrategy: ExtractionStrategy;

  constructor(dependencies: BistekHybridStrategyDependencies) {
    validateStrategy(dependencies.apiStrategy, 'api');
    validateStrategy(dependencies.playwrightStrategy, 'playwright');

    this.apiStrategy = dependencies.apiStrategy;
    this.playwrightStrategy = dependencies.playwrightStrategy;
  }

  async execute(input: ExtractionStrategyInput): Promise<ExtractionStrategyOutput> {
    if (input.visualDatasetCapturePolicy !== 'disabled') {
      input.logger.info(
        'Bistek hybrid using Playwright because visual dataset capture is enabled.',
        {
          runId: input.runId,
          targetId: input.target.targetId,
        },
      );

      return this.playwrightStrategy.execute(createModeInput(input, 'playwright'));
    }

    const apiOutput = await this.apiStrategy.execute(createModeInput(input, 'api'));

    if (apiOutput.status !== 'failed' && apiOutput.leafletsFound > 0) {
      return apiOutput;
    }

    input.logger.warn(
      'Bistek API extraction failed or returned no leaflets; using Playwright fallback.',
      {
        runId: input.runId,
        targetId: input.target.targetId,
        status: apiOutput.status,
        leafletsFound: apiOutput.leafletsFound,
        failureCount: apiOutput.failures.length,
      },
    );

    return this.playwrightStrategy.execute(createModeInput(input, 'playwright'));
  }
}

function validateStrategy(strategy: ExtractionStrategy, expectedMode: 'api' | 'playwright'): void {
  if (strategy.supermarketId !== 'bistek') {
    throw new InvalidBistekHybridStrategyError(
      `Bistek ${expectedMode} strategy must belong to supermarket bistek.`,
    );
  }

  if (strategy.mode !== expectedMode) {
    throw new InvalidBistekHybridStrategyError(
      `Bistek ${expectedMode} strategy must use ${expectedMode} mode.`,
    );
  }
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
