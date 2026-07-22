import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../ports/clock';
import type { Logger } from '../ports/logger';
import type {
  PlaywrightExtractionInput,
  PlaywrightExtractionStrategy,
} from '../ports/playwright-extraction-strategy';
import { InMemoryExtractionLock } from './extraction-lock';
import { ExtractionTargetRegistry } from './extraction-target-registry';
import { PlaywrightStrategyRegistry } from './playwright-strategy-registry';
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
  it('runs enabled targets through their registered Playwright strategies', async () => {
    const strategy = new FakePlaywrightStrategy();
    const runner = createRunner({
      strategy,
      targets: [carnaubaTarget, assaiTarget],
    });

    const result = await runner.runCycle();

    expect(result.targetResults).toHaveLength(1);
    expect(result.targetResults[0]?.status).toBe('succeeded');
    expect(strategy.inputs[0]?.target.targetId).toBe('carnauba');
    expect(strategy.inputs[0]?.visualDatasetCapturePolicy).toBe('always');
  });

  it('filters enabled targets by explicit target ids', async () => {
    const strategy = new FakePlaywrightStrategy();
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
      strategy: new FakePlaywrightStrategy(),
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
    const strategy = new FakePlaywrightStrategy({
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
      strategy: new FakePlaywrightStrategy({
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
      strategy: new FakePlaywrightStrategy({
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

  it('releases a target lock after failure', async () => {
    const lock = new InMemoryExtractionLock();
    const runner = createRunner({
      lock,
      strategy: new FakePlaywrightStrategy({
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
        strategy: new FakePlaywrightStrategy(),
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
        strategy: new FakePlaywrightStrategy(),
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
  readonly strategy: PlaywrightExtractionStrategy;
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
      strategyRegistry: new PlaywrightStrategyRegistry([input.strategy]),
      lock: input.lock ?? new InMemoryExtractionLock(),
      clock: new IncrementingClock(),
      logger: input.logger ?? new FakeLogger(),
      delay: input.delay ?? (() => Promise.resolve()),
    },
  );
}

class FakePlaywrightStrategy implements PlaywrightExtractionStrategy {
  readonly supermarketId = 'carnauba';

  readonly inputs: PlaywrightExtractionInput[] = [];

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

  execute(input: PlaywrightExtractionInput): Promise<{
    readonly runId: string;
    readonly targetId: string;
    readonly supermarketId: 'carnauba';
    readonly status: 'succeeded';
    readonly leafletsFound: number;
    readonly artifactsDownloaded: number;
    readonly artifactsReused: number;
    readonly datasetSamplesCreated: 1;
    readonly failures: readonly [];
  }> {
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
      failures: [],
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
