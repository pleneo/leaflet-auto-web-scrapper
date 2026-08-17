import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../application/ports/logger';
import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyOutput,
} from '../../../application/ports/extraction-strategy';
import { CoopHybridStrategy } from './coop-hybrid-strategy';

describe('CoopHybridStrategy', () => {
  it('returns API output without invoking fallbacks when API succeeds', async () => {
    const apiStrategy = new FakeStrategy(
      createOutput('api', 'succeeded', [createUnit('1', 'succeeded')]),
    );
    const directStrategy = new FakeStrategy(createOutput('playwright', 'succeeded'));
    const homeStrategy = new FakeStrategy(createOutput('playwright', 'succeeded'));
    const strategy = new CoopHybridStrategy({
      apiStrategy,
      directPlaywrightStrategy: directStrategy,
      homePlaywrightStrategy: homeStrategy,
    });

    const logger = new CapturingLogger();
    const loggerInfo = vi.spyOn(logger, 'info');
    const output = await strategy.execute(createInput(logger));

    expect(output.status).toBe('succeeded');
    expect(apiStrategy.calls).toBe(1);
    expect(directStrategy.calls).toBe(0);
    expect(homeStrategy.calls).toBe(0);
    expect(loggerInfo).toHaveBeenCalledWith(
      'Coop store extracted successfully via API.',
      expect.objectContaining({ unitId: '1', unitName: 'Store 1' }),
    );
  });

  it('falls back to direct Playwright and merges units when API has failing units', async () => {
    const logger = new CapturingLogger();
    const apiStrategy = new FakeStrategy(
      createOutput('api', 'partially_succeeded', [
        createUnit('1', 'succeeded'),
        createUnit('2', 'failed'),
      ]),
    );
    const directStrategy = new FakeStrategy(
      createOutput('playwright', 'succeeded', [createUnit('2', 'succeeded')], 5),
    );
    const homeStrategy = new FakeStrategy(createOutput('playwright', 'succeeded'));
    const strategy = new CoopHybridStrategy({
      apiStrategy,
      directPlaywrightStrategy: directStrategy,
      homePlaywrightStrategy: homeStrategy,
    });

    const loggerWarn = vi.spyOn(logger, 'warn');
    const output = await strategy.execute(createInput(logger));

    expect(output.status).toBe('succeeded');
    expect(output.leafletsFound).toBe(2);
    expect(output.datasetSamplesCreated).toBe(5);
    expect(output.units).toHaveLength(2);
    expect(apiStrategy.calls).toBe(1);
    expect(directStrategy.calls).toBe(1);
    expect(homeStrategy.calls).toBe(0);
    expect(loggerWarn).toHaveBeenCalledWith(
      'Coop store API extraction failed; Playwright fallback may be required.',
      expect.objectContaining({ unitId: '2' }),
    );
  });

  it('returns direct Playwright output directly when API returned 0 units', async () => {
    const logger = new CapturingLogger();
    const apiStrategy = new FakeStrategy(createOutput('api', 'failed', []));
    const directStrategy = new FakeStrategy(
      createOutput('playwright', 'succeeded', [createUnit('1', 'succeeded')]),
    );
    const homeStrategy = new FakeStrategy(createOutput('playwright', 'succeeded'));
    const strategy = new CoopHybridStrategy({
      apiStrategy,
      directPlaywrightStrategy: directStrategy,
      homePlaywrightStrategy: homeStrategy,
    });

    const output = await strategy.execute(createInput(logger));

    expect(output.status).toBe('succeeded');
    expect(output.targetId).toBe('coop');
    expect(apiStrategy.calls).toBe(1);
    expect(directStrategy.calls).toBe(1);
    expect(homeStrategy.calls).toBe(0);
  });

  it('returns partially_succeeded when direct Playwright fallback still has failing units', async () => {
    const logger = new CapturingLogger();
    const apiStrategy = new FakeStrategy(
      createOutput('api', 'partially_succeeded', [
        createUnit('1', 'succeeded'),
        createUnit('2', 'failed'),
      ]),
    );
    const directStrategy = new FakeStrategy(
      createOutput('playwright', 'failed', [createUnit('2', 'failed')]),
    );
    const homeStrategy = new FakeStrategy(
      createOutput('playwright', 'failed', [createUnit('2', 'failed')]),
    );
    const strategy = new CoopHybridStrategy({
      apiStrategy,
      directPlaywrightStrategy: directStrategy,
      homePlaywrightStrategy: homeStrategy,
    });

    const output = await strategy.execute(createInput(logger));

    expect(output.status).toBe('partially_succeeded');
    expect(output.units).toHaveLength(2);
  });

  it('falls back to home Playwright when API and direct Playwright fail completely', async () => {
    const logger = new CapturingLogger();
    const apiStrategy = new FakeStrategy(createOutput('api', 'failed', []));
    const directStrategy = new FakeStrategy(createOutput('playwright', 'failed', []));
    const homeStrategy = new FakeStrategy(
      createOutput('playwright', 'succeeded', [createUnit('1', 'succeeded')]),
    );
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
  units: ExtractionStrategyOutput['units'] = [],
  datasetSamplesCreated = 0,
): ExtractionStrategyOutput {
  return {
    runId: 'run-1',
    targetId: 'coop',
    supermarketId: 'coop',
    status,
    leafletsFound: units.reduce((acc, u) => acc + u.leaflets.length, status === 'failed' ? 0 : 1),
    artifactsDownloaded: status === 'failed' ? 0 : 1,
    artifactsReused: 0,
    datasetSamplesCreated,
    units,
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

function createUnit(
  unitId: string,
  status: 'succeeded' | 'failed' | 'empty',
): ExtractionStrategyOutput['units'][number] {
  return {
    unitId,
    unitName: `Store ${unitId}`,
    status,
    sourceUrl: `https://example.com/store/${unitId}`,
    leaflets:
      status === 'succeeded'
        ? [
            {
              leafletKey: `key-${unitId}`,
              title: `Leaflet ${unitId}`,
              contentSignature: `sig-${unitId}`,
              artifactCount: 1,
              sourceUrl: `https://example.com/leaflet/${unitId}`,
            },
          ]
        : [],
    errorMessage: status === 'failed' ? 'Extraction error' : null,
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
