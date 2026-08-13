import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyOutput,
} from '../../../application/ports/extraction-strategy';
import type { SupermarketId } from '../../../domain/supermarket/supermarket-id';

export interface CoopHybridStrategyDependencies {
  readonly apiStrategy: ExtractionStrategy;
  readonly directPlaywrightStrategy: ExtractionStrategy;
  readonly homePlaywrightStrategy: ExtractionStrategy;
}

export class CoopHybridStrategy implements ExtractionStrategy {
  readonly supermarketId: SupermarketId = 'coop';

  readonly mode = 'hybrid';

  private readonly apiStrategy: ExtractionStrategy;

  private readonly directPlaywrightStrategy: ExtractionStrategy;

  private readonly homePlaywrightStrategy: ExtractionStrategy;

  constructor(dependencies: CoopHybridStrategyDependencies) {
    this.apiStrategy = dependencies.apiStrategy;
    this.directPlaywrightStrategy = dependencies.directPlaywrightStrategy;
    this.homePlaywrightStrategy = dependencies.homePlaywrightStrategy;
  }

  async execute(input: ExtractionStrategyInput): Promise<ExtractionStrategyOutput> {
    const apiOutput = await this.apiStrategy.execute(input);

    if (apiOutput.status !== 'failed') {
      return apiOutput;
    }

    input.logger.warn('Coop API extraction failed; falling back to direct Playwright.', {
      runId: input.runId,
      targetId: input.target.targetId,
      failureCount: apiOutput.failures.length,
    });
    const directOutput = await this.directPlaywrightStrategy.execute(input);

    if (directOutput.status !== 'failed') {
      return directOutput;
    }

    input.logger.warn(
      'Coop direct Playwright extraction failed; falling back to home navigation.',
      {
        runId: input.runId,
        targetId: input.target.targetId,
        failureCount: directOutput.failures.length,
      },
    );

    return this.homePlaywrightStrategy.execute(input);
  }
}
