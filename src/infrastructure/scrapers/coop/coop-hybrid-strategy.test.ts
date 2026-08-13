import { describe, expect, it } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyOutput,
} from '../../../application/ports/extraction-strategy';
import { CoopHybridStrategy } from './coop-hybrid-strategy';

describe('CoopHybridStrategy', () => {
  it('returns API output without invoking fallbacks when API succeeds', async () => {
    const apiStrategy = new FakeStrategy(createOutput('api', 'succeeded'));
    const directStrategy = new FakeStrategy(createOutput('playwright', 'succeeded'));
    const homeStrategy = new FakeStrategy(createOutput('playwright', 'succeeded'));
    const strategy = new CoopHybridStrategy({
      apiStrategy,
      directPlaywrightStrategy: directStrategy,
      homePlaywrightStrategy: homeStrategy,
    });

    const output = await strategy.execute(createInput());

    expect(output.status).toBe('succeeded');
    expect(apiStrategy.calls).toBe(1);
    expect(directStrategy.calls).toBe(0);
    expect(homeStrategy.calls).toBe(0);
  });

  it('falls back to direct Playwright when API fails', async () => {
    const logger = new CapturingLogger();
    const apiStrategy = new FakeStrategy(createOutput('api', 'failed'));
    const directStrategy = new FakeStrategy(createOutput('playwright', 'partially_succeeded'));
    const homeStrategy = new FakeStrategy(createOutput('playwright', 'succeeded'));
    const strategy = new CoopHybridStrategy({
      apiStrategy,
      directPlaywrightStrategy: directStrategy,
      homePlaywrightStrategy: homeStrategy,
    });

    const output = await strategy.execute(createInput(logger));

    expect(output.status).toBe('partially_succeeded');
    expect(apiStrategy.calls).toBe(1);
    expect(directStrategy.calls).toBe(1);
    expect(homeStrategy.calls).toBe(0);
    expect(logger.warnMessages).toEqual([
      'Coop API extraction failed; falling back to direct Playwright.',
    ]);
  });

  it('falls back to home Playwright when API and direct Playwright fail', async () => {
    const logger = new CapturingLogger();
    const apiStrategy = new FakeStrategy(createOutput('api', 'failed'));
    const directStrategy = new FakeStrategy(createOutput('playwright', 'failed'));
    const homeStrategy = new FakeStrategy(createOutput('playwright', 'succeeded'));
    const strategy = new CoopHybridStrategy({
      apiStrategy,
      directPlaywrightStrategy: directStrategy,
      homePlaywrightStrategy: homeStrategy,
    });

    const output = await strategy.execute(createInput(logger));

    expect(output.status).toBe('succeeded');
    expect(apiStrategy.calls).toBe(1);
    expect(directStrategy.calls).toBe(1);
    expect(homeStrategy.calls).toBe(1);
    expect(logger.warnMessages).toEqual([
      'Coop API extraction failed; falling back to direct Playwright.',
      'Coop direct Playwright extraction failed; falling back to home navigation.',
    ]);
  });
});

function createInput(logger: Logger = new CapturingLogger()): ExtractionStrategyInput {
  return {
    runId: 'run-1',
    target: {
      targetId: 'coop',
      supermarketId: 'coop',
      supermarketName: 'Coop Supermercados',
      mode: 'hybrid',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    },
    startedAtIso: '2026-08-13T10:00:00.000Z',
    visualDatasetCapturePolicy: 'disabled',
    logger,
  };
}

function createOutput(
  _mode: ExtractionStrategy['mode'],
  status: ExtractionStrategyOutput['status'],
): ExtractionStrategyOutput {
  return {
    runId: 'run-1',
    targetId: 'coop',
    supermarketId: 'coop',
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
              targetId: 'coop:unit:coop-super-agua-verde',
              message: 'failed',
            },
          ]
        : [],
  };
}

class FakeStrategy implements ExtractionStrategy {
  readonly supermarketId = 'coop';

  readonly mode = 'api';

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

class CapturingLogger implements Logger {
  readonly warnMessages: string[] = [];

  debug(): void {
    return undefined;
  }

  info(): void {
    return undefined;
  }

  warn(message: string): void {
    this.warnMessages.push(message);
  }

  error(): void {
    return undefined;
  }
}
