import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../ports/clock';
import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyOutput,
} from '../ports/extraction-strategy';
import type { Logger } from '../ports/logger';
import { ExtractionStrategyRegistry } from './extraction-strategy-registry';
import type { ExtractionStateChangeSummary } from './extraction-state-service';
import { InMemoryExtractionLock } from './extraction-lock';
import { ExtractionTargetRegistry } from './extraction-target-registry';
import {
  InvalidScheduledExtractionRunnerConfigError,
  ScheduledExtractionRunner,
} from './scheduled-extraction-runner';

const carnaubaTarget = {
  targetId: 'carnauba',
  supermarketId: 'carnauba',
  supermarketName: 'Carnauba Supermercados',
  mode: 'playwright',
  enabled: true,
  intervalMinutes: 60,
  maxAttempts: 3,
} as const;

const assaiTarget = {
  targetId: 'assai',
  supermarketId: 'assai',
  supermarketName: 'Assaí Atacadista',
  mode: 'playwright',
  enabled: false,
  intervalMinutes: 120,
  maxAttempts: 3,
} as const;

describe('ScheduledExtractionRunner', () => {
  it('runs enabled targets through their registered extraction strategies', async () => {
    const strategy = new FakeExtractionStrategy();
    const runner = createRunner({
      strategy,
      targets: [carnaubaTarget, assaiTarget],
    });

    const result = await runner.runCycle();

    expect(result.targetResults).toHaveLength(1);
    expect(result.targetResults[0]?.status).toBe('succeeded');
    expect(strategy.inputs[0]?.target.targetId).toBe('carnauba');
    expect(strategy.inputs[0]?.visualDatasetCapturePolicy).toBe('always');
    expect(result.targetResults[0]).toMatchObject({
      stateChangeSummary: {
        targetId: 'carnauba',
        newLeaflets: 1,
      },
    });
  });

  it('filters enabled targets by explicit target ids', async () => {
    const strategy = new FakeExtractionStrategy();
    const runner = createRunner({
      onlyTargetIds: ['assai'],
      strategy,
      targets: [carnaubaTarget, assaiTarget],
    });

    const result = await runner.runCycle();

    expect(result.targetResults).toEqual([]);
    expect(strategy.inputs).toEqual([]);
  });

  it('skips a target when its lock is already acquired', async () => {
    const lock = new InMemoryExtractionLock();
    lock.acquire('carnauba');
    const runner = createRunner({
      lock,
      strategy: new FakeExtractionStrategy(),
      targets: [carnaubaTarget],
    });

    const result = await runner.runCycle();

    expect(result.targetResults).toEqual([
      {
        status: 'skipped',
        target: carnaubaTarget,
        reason: 'locked',
      },
    ]);
  });

  it('retries a target after a transient failure', async () => {
    const strategy = new FakeExtractionStrategy({
      failuresBeforeSuccess: 1,
    });
    const delay = vi.fn(() => Promise.resolve());
    const runner = createRunner({
      delay,
      strategy,
      targets: [carnaubaTarget],
    });

    const result = await runner.runCycle();

    expect(result.targetResults[0]).toMatchObject({
      status: 'succeeded',
      attempts: 2,
    });
    expect(delay).toHaveBeenCalledWith(1_000);
  });

  it('reports failed targets after retry exhaustion', async () => {
    const runner = createRunner({
      strategy: new FakeExtractionStrategy({
        failuresBeforeSuccess: 3,
      }),
      targets: [carnaubaTarget],
    });

    const result = await runner.runCycle();

    expect(result.targetResults[0]).toMatchObject({
      status: 'failed',
      attempts: 3,
      errorMessage: 'Transient extraction failure.',
    });
  });

  it('logs when an extraction target has no new leaflet artifacts', async () => {
    const logger = new FakeLogger();
    const runner = createRunner({
      logger,
      strategy: new FakeExtractionStrategy({
        output: {
          leafletsFound: 2,
          artifactsDownloaded: 0,
          artifactsReused: 2,
        },
      }),
      targets: [carnaubaTarget],
    });

    await runner.runCycle();

    expect(logger.info).toHaveBeenCalledWith(
      'Extraction target completed without new leaflet artifacts.',
      {
        targetId: 'carnauba',
        supermarketId: 'carnauba',
        runId: 'carnauba-playwright-2026-07-22T10-00-02-000Z-attempt-1',
        leafletsFound: 2,
        artifactsReused: 2,
      },
    );
  });

  it('records target state after successful extraction output', async () => {
    const stateService = new FakeExtractionStateService();
    const strategy = new FakeExtractionStrategy();
    const runner = createRunner({
      stateService,
      strategy,
      targets: [carnaubaTarget],
    });

    await runner.runCycle();

    expect(stateService.outputs[0]?.runId).toBe(
      'carnauba-playwright-2026-07-22T10-00-02-000Z-attempt-1',
    );
    expect(stateService.observedAtIsoValues[0]).toBe('2026-07-22T10:00:04.000Z');
  });

  it('releases a target lock after failure', async () => {
    const lock = new InMemoryExtractionLock();
    const runner = createRunner({
      lock,
      strategy: new FakeExtractionStrategy({
        failuresBeforeSuccess: 3,
      }),
      targets: [carnaubaTarget],
    });

    await runner.runCycle();

    expect(lock.isLocked('carnauba')).toBe(false);
  });

  it('rejects invalid runner config', () => {
    expect(() =>
      createRunner({
        config: {
          workerId: ' ',
          retryBaseDelayMs: 1_000,
          visualDatasetCapturePolicy: 'always',
          onlyTargetIds: [],
        },
        strategy: new FakeExtractionStrategy(),
        targets: [carnaubaTarget],
      }),
    ).toThrow(InvalidScheduledExtractionRunnerConfigError);

    expect(() =>
      createRunner({
        config: {
          workerId: 'worker',
          retryBaseDelayMs: -1,
          visualDatasetCapturePolicy: 'always',
          onlyTargetIds: [],
        },
        strategy: new FakeExtractionStrategy(),
        targets: [carnaubaTarget],
      }),
    ).toThrow(InvalidScheduledExtractionRunnerConfigError);
  });
});

interface CreateRunnerInput {
  readonly config?: {
    readonly workerId: string;
    readonly retryBaseDelayMs: number;
    readonly visualDatasetCapturePolicy: 'always' | 'disabled';
    readonly onlyTargetIds: readonly string[];
  };
  readonly delay?: (durationMs: number) => Promise<void>;
  readonly logger?: Logger;
  readonly lock?: InMemoryExtractionLock;
  readonly onlyTargetIds?: readonly string[];
  readonly stateService?: FakeExtractionStateService;
  readonly strategy: ExtractionStrategy;
  readonly targets: readonly [
    typeof carnaubaTarget,
    ...(typeof carnaubaTarget | typeof assaiTarget)[],
  ];
}

function createRunner(input: CreateRunnerInput): ScheduledExtractionRunner {
  return new ScheduledExtractionRunner(
    input.config ?? {
      workerId: 'generic-worker',
      retryBaseDelayMs: 1_000,
      visualDatasetCapturePolicy: 'always',
      onlyTargetIds: input.onlyTargetIds ?? [],
    },
    {
      targetRegistry: new ExtractionTargetRegistry(input.targets),
      strategyRegistry: new ExtractionStrategyRegistry([input.strategy]),
      lock: input.lock ?? new InMemoryExtractionLock(),
      stateService: input.stateService ?? new FakeExtractionStateService(),
      clock: new IncrementingClock(),
      logger: input.logger ?? new FakeLogger(),
      delay: input.delay ?? (() => Promise.resolve()),
    },
  );
}

class FakeExtractionStrategy implements ExtractionStrategy {
  readonly supermarketId = 'carnauba';

  readonly mode = 'playwright';

  readonly inputs: ExtractionStrategyInput[] = [];

  private remainingFailures: number;

  private readonly output: {
    readonly leafletsFound: number;
    readonly artifactsDownloaded: number;
    readonly artifactsReused: number;
  };

  constructor(
    config: {
      readonly failuresBeforeSuccess?: number;
      readonly output?: {
        readonly leafletsFound: number;
        readonly artifactsDownloaded: number;
        readonly artifactsReused: number;
      };
    } = {},
  ) {
    this.output = config.output ?? {
      leafletsFound: 1,
      artifactsDownloaded: 1,
      artifactsReused: 0,
    };
    this.remainingFailures = config.failuresBeforeSuccess ?? 0;
  }

  execute(input: ExtractionStrategyInput): Promise<ExtractionStrategyOutput> {
    this.inputs.push(input);

    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      return Promise.reject(new Error('Transient extraction failure.'));
    }

    return Promise.resolve({
      runId: input.runId,
      targetId: input.target.targetId,
      supermarketId: 'carnauba',
      status: 'succeeded',
      leafletsFound: this.output.leafletsFound,
      artifactsDownloaded: this.output.artifactsDownloaded,
      artifactsReused: this.output.artifactsReused,
      datasetSamplesCreated: 1,
      units: [
        {
          unitId: '79',
          unitName: 'Maestro',
          status: 'succeeded',
          sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
          leaflets: [
            {
              leafletKey: 'leaflet-1',
              title: 'Leaflet 1',
              contentSignature: 'signature-1',
              artifactCount: 1,
              sourceUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
            },
          ],
          errorMessage: null,
        },
      ],
      failures: [],
    });
  }
}

class FakeExtractionStateService {
  readonly outputs: ExtractionStrategyOutput[] = [];

  readonly observedAtIsoValues: string[] = [];

  recordOutput(
    output: ExtractionStrategyOutput,
    observedAtIso: string,
  ): Promise<ExtractionStateChangeSummary> {
    this.outputs.push(output);
    this.observedAtIsoValues.push(observedAtIso);

    return Promise.resolve({
      targetId: output.targetId,
      unitsProcessed: output.units.length,
      newLeaflets: output.leafletsFound,
      unchangedLeaflets: 0,
      removedLeaflets: 0,
      failedUnits: output.units.filter((unit) => unit.status === 'failed').length,
      emptyUnits: output.units.filter((unit) => unit.status === 'empty').length,
    });
  }
}

class IncrementingClock implements Clock {
  private calls = 0;

  nowIso(): string {
    this.calls += 1;
    return `2026-07-22T10:00:0${String(this.calls)}.000Z`;
  }
}

class FakeLogger implements Logger {
  debug = vi.fn();

  info = vi.fn();

  warn = vi.fn();

  error = vi.fn();
}
