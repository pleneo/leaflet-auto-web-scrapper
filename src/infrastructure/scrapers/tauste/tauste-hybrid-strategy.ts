import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyOutput,
} from '../../../application/ports/extraction-strategy';
import type { SupermarketId } from '../../../domain/supermarket/supermarket-id';

export interface TausteHybridStrategyDependencies {
  readonly apiStrategy: ExtractionStrategy;
  readonly directPlaywrightStrategy: ExtractionStrategy;
  readonly institutionalPlaywrightStrategy: ExtractionStrategy;
}

export class TausteHybridStrategy implements ExtractionStrategy {
  readonly supermarketId: SupermarketId = 'tauste';

  readonly mode = 'hybrid';

  private readonly apiStrategy: ExtractionStrategy;

  private readonly directPlaywrightStrategy: ExtractionStrategy;

  private readonly institutionalPlaywrightStrategy: ExtractionStrategy;

  constructor(dependencies: TausteHybridStrategyDependencies) {
    this.apiStrategy = dependencies.apiStrategy;
    this.directPlaywrightStrategy = dependencies.directPlaywrightStrategy;
    this.institutionalPlaywrightStrategy = dependencies.institutionalPlaywrightStrategy;
  }

  async execute(input: ExtractionStrategyInput): Promise<ExtractionStrategyOutput> {
    const apiOutput = await this.apiStrategy.execute(input);

    if (apiOutput.status !== 'failed') {
      return apiOutput;
    }

    input.logger.warn('Tauste API extraction failed; falling back to direct Playwright.', {
      runId: input.runId,
      targetId: input.target.targetId,
      failureCount: apiOutput.failures.length,
    });
    const directOutput = await this.directPlaywrightStrategy.execute(input);

    if (directOutput.status !== 'failed') {
      return directOutput;
    }

    input.logger.warn(
      'Tauste direct Playwright extraction failed; falling back to institutional navigation.',
      {
        runId: input.runId,
        targetId: input.target.targetId,
        failureCount: directOutput.failures.length,
      },
    );

    return this.institutionalPlaywrightStrategy.execute(input);
  }
}
