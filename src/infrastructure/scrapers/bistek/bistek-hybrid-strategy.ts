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
    const apiOutput = await this.apiStrategy.execute(createModeInput(input, 'api'));

    for (const unit of apiOutput.units) {
      if (unit.status === 'succeeded' || unit.status === 'empty') {
        input.logger.info('Bistek store extracted successfully via API.', {
          runId: input.runId,
          targetId: input.target.targetId,
          storeId: unit.unitId,
          storeName: unit.unitName,
          leafletCount: unit.leaflets.length,
        });
      } else {
        input.logger.warn(
          'Bistek store API extraction failed; Playwright fallback may be required.',
          {
            runId: input.runId,
            targetId: input.target.targetId,
            storeId: unit.unitId,
            storeName: unit.unitName,
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

    input.logger.warn(
      'Bistek API extraction failed or had failing stores; executing Playwright fallback.',
      {
        runId: input.runId,
        targetId: input.target.targetId,
        status: apiOutput.status,
        leafletsFound: apiOutput.leafletsFound,
        failedStoreCount: failedUnits.length,
      },
    );

    const playwrightOutput = await this.playwrightStrategy.execute(
      createModeInput(input, 'playwright'),
    );

    if (apiOutput.units.length === 0) {
      return playwrightOutput;
    }

    return mergeStrategyOutputs(apiOutput, playwrightOutput);
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
