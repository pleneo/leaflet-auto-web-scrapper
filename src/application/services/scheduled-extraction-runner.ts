import type { VisualDatasetCapturePolicy } from '../../domain/dataset/visual-dataset-capture-policy';
import type { ExtractionTarget } from '../../domain/extraction/extraction-target';
import type { Clock } from '../ports/clock';
import type { Logger } from '../ports/logger';
import type { PlaywrightExtractionOutput } from '../ports/playwright-extraction-strategy';
import type { ExtractionLock } from './extraction-lock';
import type { ExtractionStateChangeSummary } from './extraction-state-service';
import type { ExtractionTargetRegistry } from './extraction-target-registry';
import type { PlaywrightStrategyRegistry } from './playwright-strategy-registry';

export interface ScheduledExtractionRunnerConfig {
  readonly workerId: string;
  readonly retryBaseDelayMs: number;
  readonly visualDatasetCapturePolicy: VisualDatasetCapturePolicy;
  readonly onlyTargetIds: readonly string[];
}

export interface ScheduledExtractionRunnerDependencies {
  readonly targetRegistry: ExtractionTargetRegistry;
  readonly strategyRegistry: PlaywrightStrategyRegistry;
  readonly lock: ExtractionLock;
  readonly stateService: ScheduledExtractionStateService;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly delay: (durationMs: number) => Promise<void>;
}

export interface ScheduledExtractionStateService {
  recordOutput(
    output: PlaywrightExtractionOutput,
    observedAtIso: string,
  ): Promise<ExtractionStateChangeSummary>;
}

export type ScheduledTargetRunResult =
  | {
      readonly status: 'succeeded';
      readonly target: ExtractionTarget;
      readonly attempts: number;
      readonly output: PlaywrightExtractionOutput;
      readonly stateChangeSummary: ExtractionStateChangeSummary;
    }
  | {
      readonly status: 'failed';
      readonly target: ExtractionTarget;
      readonly attempts: number;
      readonly errorMessage: string;
    }
  | {
      readonly status: 'skipped';
      readonly target: ExtractionTarget;
      readonly reason: 'locked';
    };

export interface ScheduledExtractionCycleResult {
  readonly workerId: string;
  readonly startedAtIso: string;
  readonly completedAtIso: string;
  readonly targetResults: readonly ScheduledTargetRunResult[];
}

export class InvalidScheduledExtractionRunnerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidScheduledExtractionRunnerConfigError';
  }
}

export class ScheduledExtractionRunner {
  private readonly config: ScheduledExtractionRunnerConfig;

  private readonly targetRegistry: ExtractionTargetRegistry;

  private readonly strategyRegistry: PlaywrightStrategyRegistry;

  private readonly lock: ExtractionLock;

  private readonly stateService: ScheduledExtractionStateService;

  private readonly clock: Clock;

  private readonly logger: Logger;

  private readonly delay: (durationMs: number) => Promise<void>;

  constructor(
    config: ScheduledExtractionRunnerConfig,
    dependencies: ScheduledExtractionRunnerDependencies,
  ) {
    validateConfig(config);
    this.config = config;
    this.targetRegistry = dependencies.targetRegistry;
    this.strategyRegistry = dependencies.strategyRegistry;
    this.lock = dependencies.lock;
    this.stateService = dependencies.stateService;
    this.clock = dependencies.clock;
    this.logger = dependencies.logger;
    this.delay = dependencies.delay;
  }

  async runCycle(): Promise<ScheduledExtractionCycleResult> {
    const startedAtIso = this.clock.nowIso();
    const targets = this.resolveTargets();
    const targetResults: ScheduledTargetRunResult[] = [];

    this.logger.info('Scheduled extraction cycle started.', {
      workerId: this.config.workerId,
      targets: targets.length,
    });

    for (const target of targets) {
      targetResults.push(await this.runTarget(target));
    }

    const completedAtIso = this.clock.nowIso();

    this.logger.info('Scheduled extraction cycle completed.', {
      workerId: this.config.workerId,
      targets: targetResults.length,
    });

    return {
      workerId: this.config.workerId,
      startedAtIso,
      completedAtIso,
      targetResults,
    };
  }

  private resolveTargets(): readonly ExtractionTarget[] {
    if (this.config.onlyTargetIds.length === 0) {
      return this.targetRegistry.listEnabled();
    }

    return this.targetRegistry.filterEnabledByIds(this.config.onlyTargetIds);
  }

  private async runTarget(target: ExtractionTarget): Promise<ScheduledTargetRunResult> {
    if (!this.lock.acquire(target.targetId)) {
      this.logger.warn('Skipping locked extraction target.', {
        targetId: target.targetId,
      });

      return {
        status: 'skipped',
        target,
        reason: 'locked',
      };
    }

    try {
      return await this.runTargetWithRetry(target);
    } finally {
      this.lock.release(target.targetId);
    }
  }

  private async runTargetWithRetry(target: ExtractionTarget): Promise<ScheduledTargetRunResult> {
    let lastErrorMessage = 'Unknown extraction target failure.';

    for (let attempt = 1; attempt <= target.maxAttempts; attempt += 1) {
      const runId = createRunId(target.targetId, this.clock.nowIso(), attempt);

      try {
        this.logger.info('Extraction target attempt started.', {
          targetId: target.targetId,
          attempt,
          runId,
        });

        const output = await this.strategyRegistry.get(target.supermarketId).execute({
          runId,
          target,
          startedAtIso: this.clock.nowIso(),
          visualDatasetCapturePolicy: this.config.visualDatasetCapturePolicy,
          logger: this.logger,
        });
        const stateChangeSummary = await this.stateService.recordOutput(
          output,
          this.clock.nowIso(),
        );

        this.logger.info('Extraction target attempt completed.', {
          targetId: target.targetId,
          attempt,
          runId,
          status: output.status,
          leafletsFound: output.leafletsFound,
          artifactsDownloaded: output.artifactsDownloaded,
          artifactsReused: output.artifactsReused,
          datasetSamplesCreated: output.datasetSamplesCreated,
          failures: output.failures.length,
          stateNewLeaflets: stateChangeSummary.newLeaflets,
          stateUnchangedLeaflets: stateChangeSummary.unchangedLeaflets,
          stateRemovedLeaflets: stateChangeSummary.removedLeaflets,
          stateFailedUnits: stateChangeSummary.failedUnits,
          stateEmptyUnits: stateChangeSummary.emptyUnits,
        });

        this.logger.info('Extraction target state updated.', {
          targetId: target.targetId,
          runId,
          unitsProcessed: stateChangeSummary.unitsProcessed,
          newLeaflets: stateChangeSummary.newLeaflets,
          unchangedLeaflets: stateChangeSummary.unchangedLeaflets,
          removedLeaflets: stateChangeSummary.removedLeaflets,
          failedUnits: stateChangeSummary.failedUnits,
          emptyUnits: stateChangeSummary.emptyUnits,
        });

        if (output.artifactsDownloaded === 0) {
          this.logger.info('Extraction target completed without new leaflet artifacts.', {
            targetId: target.targetId,
            supermarketId: target.supermarketId,
            runId,
            leafletsFound: output.leafletsFound,
            artifactsReused: output.artifactsReused,
          });
        }

        return {
          status: 'succeeded',
          target,
          attempts: attempt,
          output,
          stateChangeSummary,
        };
      } catch (error) {
        if (error instanceof Error) {
          lastErrorMessage = error.message;
          /* v8 ignore next 3 */
        } else {
          lastErrorMessage = 'Non-error extraction failure.';
        }

        this.logger.warn('Extraction target attempt failed.', {
          targetId: target.targetId,
          attempt,
          runId,
        });

        if (attempt < target.maxAttempts) {
          await this.delay(this.config.retryBaseDelayMs * 2 ** (attempt - 1));
        }
      }
    }

    return {
      status: 'failed',
      target,
      attempts: target.maxAttempts,
      errorMessage: lastErrorMessage,
    };
  }
}

function validateConfig(config: ScheduledExtractionRunnerConfig): void {
  if (config.workerId.trim().length === 0) {
    throw new InvalidScheduledExtractionRunnerConfigError('workerId cannot be blank.');
  }

  if (!Number.isInteger(config.retryBaseDelayMs) || config.retryBaseDelayMs < 0) {
    throw new InvalidScheduledExtractionRunnerConfigError(
      'retryBaseDelayMs must be a non-negative integer.',
    );
  }
}

function createRunId(targetId: string, startedAtIso: string, attempt: number): string {
  return `${targetId}-playwright-${startedAtIso.replace(/[:.]/g, '-')}-attempt-${String(attempt)}`;
}
