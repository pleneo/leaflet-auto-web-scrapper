import { describe, expect, it } from 'vitest';
import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyOutput,
} from '../../../application/ports/extraction-strategy';
import type { Logger } from '../../../application/ports/logger';
import { TausteHybridStrategy } from './tauste-hybrid-strategy';

describe('TausteHybridStrategy', () => {
  it('returns API output when API succeeds', async () => {
    const apiStrategy = new FakeStrategy(createOutput('succeeded'));
    const directStrategy = new FakeStrategy(createOutput('succeeded'));
    const institutionalStrategy = new FakeStrategy(createOutput('succeeded'));
    const strategy = new TausteHybridStrategy({
      apiStrategy,
      directPlaywrightStrategy: directStrategy,
      institutionalPlaywrightStrategy: institutionalStrategy,
    });

    await expect(strategy.execute(createInput())).resolves.toMatchObject({
      status: 'succeeded',
    });
    expect(apiStrategy.calls).toBe(1);
    expect(directStrategy.calls).toBe(0);
    expect(institutionalStrategy.calls).toBe(0);
  });

  it('falls back to direct Playwright when API fails', async () => {
    const logger = new MemoryLogger();
    const strategy = new TausteHybridStrategy({
      apiStrategy: new FakeStrategy(createOutput('failed')),
      directPlaywrightStrategy: new FakeStrategy(createOutput('partially_succeeded')),
      institutionalPlaywrightStrategy: new FakeStrategy(createOutput('succeeded')),
    });

    await expect(strategy.execute(createInput(logger))).resolves.toMatchObject({
      status: 'partially_succeeded',
    });
    expect(logger.warns.map((entry) => entry.message)).toEqual([
      'Tauste API extraction failed; falling back to direct Playwright.',
    ]);
  });

  it('falls back to institutional Playwright when direct Playwright fails', async () => {
    const logger = new MemoryLogger();
    const institutionalStrategy = new FakeStrategy(createOutput('succeeded'));
    const strategy = new TausteHybridStrategy({
      apiStrategy: new FakeStrategy(createOutput('failed')),
      directPlaywrightStrategy: new FakeStrategy(createOutput('failed')),
      institutionalPlaywrightStrategy: institutionalStrategy,
    });

    await expect(strategy.execute(createInput(logger))).resolves.toMatchObject({
      status: 'succeeded',
    });
    expect(institutionalStrategy.calls).toBe(1);
    expect(logger.warns.map((entry) => entry.message)).toEqual([
      'Tauste API extraction failed; falling back to direct Playwright.',
      'Tauste direct Playwright extraction failed; falling back to institutional navigation.',
    ]);
  });
});

function createInput(logger: Logger = new MemoryLogger()): ExtractionStrategyInput {
  return {
    runId: 'run-1',
    target: {
      targetId: 'tauste',
      supermarketId: 'tauste',
      supermarketName: 'Tauste Supermercados',
      mode: 'hybrid',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    },
    startedAtIso: '2026-08-13T10:00:00.000Z',
    visualDatasetCapturePolicy: 'always',
    logger,
  };
}

function createOutput(status: ExtractionStrategyOutput['status']): ExtractionStrategyOutput {
  return {
    runId: 'run-1',
    targetId: 'tauste',
    supermarketId: 'tauste',
    status,
    leafletsFound: status === 'failed' ? 0 : 1,
    artifactsDownloaded: status === 'failed' ? 0 : 1,
    artifactsReused: 0,
    datasetSamplesCreated: 0,
    units: [],
    failures:
      status === 'failed'
        ? [
            {
              targetId: 'tauste',
              message: 'Failed.',
            },
          ]
        : [],
  };
}

class FakeStrategy implements ExtractionStrategy {
  readonly supermarketId = 'tauste';

  readonly mode = 'hybrid';

  calls = 0;

  private readonly output: ExtractionStrategyOutput;

  constructor(output: ExtractionStrategyOutput) {
    this.output = output;
  }

  execute(): Promise<ExtractionStrategyOutput> {
    this.calls += 1;
    return Promise.resolve(this.output);
  }
}

class MemoryLogger implements Logger {
  readonly warns: readonly { readonly message: string }[] = [];

  readonly debugMessages: readonly string[] = [];

  readonly infoMessages: readonly string[] = [];

  readonly errorMessages: readonly string[] = [];

  debug(message: string): void {
    (this.debugMessages as string[]).push(message);
  }

  info(message: string): void {
    (this.infoMessages as string[]).push(message);
  }

  warn(message: string): void {
    (this.warns as { readonly message: string }[]).push({ message });
  }

  error(message: string): void {
    (this.errorMessages as string[]).push(message);
  }
}
