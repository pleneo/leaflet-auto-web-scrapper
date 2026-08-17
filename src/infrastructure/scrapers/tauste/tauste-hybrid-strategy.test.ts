import { describe, expect, it, vi } from 'vitest';
import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyOutput,
} from '../../../application/ports/extraction-strategy';
import type { Logger } from '../../../application/ports/logger';
import { TausteHybridStrategy } from './tauste-hybrid-strategy';

describe('TausteHybridStrategy', () => {
  it('returns API output when API succeeds', async () => {
    const apiStrategy = new FakeStrategy(createOutput('succeeded', [createUnit('1', 'succeeded')]));
    const directStrategy = new FakeStrategy(createOutput('succeeded'));
    const institutionalStrategy = new FakeStrategy(createOutput('succeeded'));
    const strategy = new TausteHybridStrategy({
      apiStrategy,
      directPlaywrightStrategy: directStrategy,
      institutionalPlaywrightStrategy: institutionalStrategy,
    });

    const logger = new MemoryLogger();
    const loggerInfo = vi.spyOn(logger, 'info');
    const output = await strategy.execute(createInput(logger));

    expect(output.status).toBe('succeeded');
    expect(apiStrategy.calls).toBe(1);
    expect(directStrategy.calls).toBe(0);
    expect(institutionalStrategy.calls).toBe(0);
    expect(loggerInfo).toHaveBeenCalledWith(
      'Tauste store extracted successfully via API.',
      expect.objectContaining({ unitId: '1', unitName: 'Store 1' }),
    );
  });

  it('falls back to direct Playwright and merges outputs when API has failing units', async () => {
    const logger = new MemoryLogger();
    const strategy = new TausteHybridStrategy({
      apiStrategy: new FakeStrategy(
        createOutput('partially_succeeded', [
          createUnit('1', 'succeeded'),
          createUnit('2', 'failed'),
        ]),
      ),
      directPlaywrightStrategy: new FakeStrategy(
        createOutput('succeeded', [createUnit('2', 'succeeded')], 3),
      ),
      institutionalPlaywrightStrategy: new FakeStrategy(createOutput('succeeded')),
    });

    const loggerWarn = vi.spyOn(logger, 'warn');
    const output = await strategy.execute(createInput(logger));

    expect(output.status).toBe('succeeded');
    expect(output.leafletsFound).toBe(2);
    expect(output.datasetSamplesCreated).toBe(3);
    expect(output.units).toHaveLength(2);
    expect(loggerWarn).toHaveBeenCalledWith(
      'Tauste store API extraction failed; Playwright fallback may be required.',
      expect.objectContaining({ unitId: '2' }),
    );
  });

  it('returns direct Playwright output directly when API returned 0 units', async () => {
    const logger = new MemoryLogger();
    const strategy = new TausteHybridStrategy({
      apiStrategy: new FakeStrategy(createOutput('failed', [])),
      directPlaywrightStrategy: new FakeStrategy(
        createOutput('succeeded', [createUnit('1', 'succeeded')]),
      ),
      institutionalPlaywrightStrategy: new FakeStrategy(createOutput('succeeded')),
    });

    const output = await strategy.execute(createInput(logger));

    expect(output.status).toBe('succeeded');
    expect(output.targetId).toBe('tauste');
  });

  it('falls back to institutional Playwright when direct Playwright fails', async () => {
    const logger = new MemoryLogger();
    const institutionalStrategy = new FakeStrategy(
      createOutput('succeeded', [createUnit('1', 'succeeded')]),
    );
    const strategy = new TausteHybridStrategy({
      apiStrategy: new FakeStrategy(createOutput('failed', [])),
      directPlaywrightStrategy: new FakeStrategy(createOutput('failed', [])),
      institutionalPlaywrightStrategy: institutionalStrategy,
    });

    const output = await strategy.execute(createInput(logger));

    expect(output.status).toBe('succeeded');
    expect(institutionalStrategy.calls).toBe(1);
    expect(logger.warns.map((entry) => entry.message)).toEqual([
      'Tauste API extraction failed; falling back to direct Playwright.',
      'Tauste direct Playwright extraction failed; falling back to institutional navigation.',
    ]);
  });

  it('merges institutional Playwright output when API had partial units and direct Playwright failed', async () => {
    const logger = new MemoryLogger();
    const institutionalStrategy = new FakeStrategy(
      createOutput('succeeded', [createUnit('2', 'succeeded')]),
    );
    const strategy = new TausteHybridStrategy({
      apiStrategy: new FakeStrategy(
        createOutput('partially_succeeded', [
          createUnit('1', 'succeeded'),
          createUnit('2', 'failed'),
        ]),
      ),
      directPlaywrightStrategy: new FakeStrategy(createOutput('failed', [])),
      institutionalPlaywrightStrategy: institutionalStrategy,
    });

    const output = await strategy.execute(createInput(logger));

    expect(output.status).toBe('succeeded');
    expect(output.units).toHaveLength(2);
  });

  it('returns partially_succeeded status when fallback still has failing units', async () => {
    const logger = new MemoryLogger();
    const strategy = new TausteHybridStrategy({
      apiStrategy: new FakeStrategy(
        createOutput('partially_succeeded', [
          createUnit('1', 'succeeded'),
          createUnit('2', 'failed'),
        ]),
      ),
      directPlaywrightStrategy: new FakeStrategy(
        createOutput('failed', [createUnit('2', 'failed')]),
      ),
      institutionalPlaywrightStrategy: new FakeStrategy(
        createOutput('failed', [createUnit('2', 'failed')]),
      ),
    });

    const output = await strategy.execute(createInput(logger));

    expect(output.status).toBe('partially_succeeded');
    expect(output.units).toHaveLength(2);
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

function createOutput(
  status: ExtractionStrategyOutput['status'],
  units: ExtractionStrategyOutput['units'] = [],
  datasetSamplesCreated = 0,
): ExtractionStrategyOutput {
  return {
    runId: 'run-1',
    targetId: 'tauste',
    supermarketId: 'tauste',
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
              targetId: 'tauste',
              message: 'Failed.',
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
  readonly warns: { readonly message: string }[] = [];

  private callCount = 0;

  debug(): void {
    this.callCount += 1;
  }

  info(): void {
    this.callCount += 1;
  }

  warn(message: string): void {
    this.warns.push({ message });
  }

  error(): void {
    this.callCount += 1;
  }
}
