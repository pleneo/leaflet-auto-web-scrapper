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

    for (const unit of apiOutput.units) {
      if (unit.status === 'succeeded' || unit.status === 'empty') {
        input.logger.info('Tauste store extracted successfully via API.', {
          runId: input.runId,
          targetId: input.target.targetId,
          unitId: unit.unitId,
          unitName: unit.unitName,
          leafletCount: unit.leaflets.length,
        });
      } else {
        input.logger.warn(
          'Tauste store API extraction failed; Playwright fallback may be required.',
          {
            runId: input.runId,
            targetId: input.target.targetId,
            unitId: unit.unitId,
            unitName: unit.unitName,
            errorMessage: unit.errorMessage,
          },
        );
      }
    }

    const failedUnits = apiOutput.units.filter((unit) => unit.status === 'failed');

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (apiOutput.status !== 'failed' && failedUnits.length === 0) {
      return apiOutput;
    }

    input.logger.warn('Tauste API extraction failed; falling back to direct Playwright.', {
      runId: input.runId,
      targetId: input.target.targetId,
      failureCount: apiOutput.failures.length,
      failedUnitCount: failedUnits.length,
    });
    const directOutput = await this.directPlaywrightStrategy.execute(input);

    if (directOutput.status !== 'failed') {
      return apiOutput.units.length > 0
        ? mergeStrategyOutputs(apiOutput, directOutput)
        : directOutput;
    }

    input.logger.warn(
      'Tauste direct Playwright extraction failed; falling back to institutional navigation.',
      {
        runId: input.runId,
        targetId: input.target.targetId,
        failureCount: directOutput.failures.length,
      },
    );

    const institutionalOutput = await this.institutionalPlaywrightStrategy.execute(input);

    return apiOutput.units.length > 0
      ? mergeStrategyOutputs(apiOutput, institutionalOutput)
      : institutionalOutput;
  }
}

function mergeStrategyOutputs(
  apiOutput: ExtractionStrategyOutput,
  playwrightOutput: ExtractionStrategyOutput,
): ExtractionStrategyOutput {
  const succeededApiUnits = apiOutput.units.filter((unit) => unit.status !== 'failed');
  const mergedUnits = [...succeededApiUnits, ...playwrightOutput.units];
  const leafletsFound = mergedUnits.reduce((total, unit) => total + unit.leaflets.length, 0);
  const failedUnitsCount = mergedUnits.filter((unit) => unit.status === 'failed').length;
  const succeededUnitsCount = mergedUnits.filter((unit) => unit.status === 'succeeded').length;

  let status: ExtractionStrategyOutput['status'] = 'failed';
  if (failedUnitsCount === 0) {
    status = 'succeeded';
  } else if (succeededUnitsCount > 0) {
    status = 'partially_succeeded';
  }

  return {
    runId: apiOutput.runId,
    targetId: apiOutput.targetId,
    supermarketId: apiOutput.supermarketId,
    status,
    leafletsFound,
    artifactsDownloaded: apiOutput.artifactsDownloaded + playwrightOutput.artifactsDownloaded,
    artifactsReused: apiOutput.artifactsReused + playwrightOutput.artifactsReused,
    datasetSamplesCreated: playwrightOutput.datasetSamplesCreated,
    units: mergedUnits,
    failures: playwrightOutput.failures,
  };
}
