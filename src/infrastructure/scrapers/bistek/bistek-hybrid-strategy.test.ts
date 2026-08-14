import { describe, expect, it, vi } from 'vitest';
import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyOutput,
} from '../../../application/ports/extraction-strategy';
import { BistekHybridStrategy, InvalidBistekHybridStrategyError } from './bistek-hybrid-strategy';

describe('BistekHybridStrategy', () => {
  it('uses API first when visual dataset capture is disabled', async () => {
    const apiStrategy = new FakeStrategy('api', createOutput('api', 'succeeded', 2));
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput('playwright', 'succeeded', 2),
    );
    const strategy = new BistekHybridStrategy({ apiStrategy, playwrightStrategy });

    const output = await strategy.execute(createInput('disabled'));

    expect(output.targetId).toBe('api');
    expect(apiStrategy.inputs[0]?.target.mode).toBe('api');
    expect(playwrightStrategy.inputs).toEqual([]);
  });

  it('uses Playwright directly when visual dataset capture is enabled', async () => {
    const apiStrategy = new FakeStrategy('api', createOutput('api', 'succeeded', 2));
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput('playwright', 'succeeded', 2),
    );
    const strategy = new BistekHybridStrategy({ apiStrategy, playwrightStrategy });

    const output = await strategy.execute(createInput('always'));

    expect(output.targetId).toBe('playwright');
    expect(apiStrategy.inputs).toEqual([]);
    expect(playwrightStrategy.inputs[0]?.target.mode).toBe('playwright');
  });

  it('falls back to Playwright when API fails or returns no leaflets', async () => {
    const apiStrategy = new FakeStrategy('api', createOutput('api', 'failed', 0));
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput('playwright', 'succeeded', 1),
    );
    const strategy = new BistekHybridStrategy({ apiStrategy, playwrightStrategy });

    const output = await strategy.execute(createInput('disabled'));

    expect(output.targetId).toBe('playwright');
    expect(playwrightStrategy.inputs).toHaveLength(1);
  });

  it('validates strategy modes', () => {
    expect(
      () =>
        new BistekHybridStrategy({
          apiStrategy: new FakeStrategy('playwright', createOutput('api', 'succeeded', 1)),
          playwrightStrategy: new FakeStrategy(
            'playwright',
            createOutput('playwright', 'succeeded', 1),
          ),
        }),
    ).toThrow(InvalidBistekHybridStrategyError);
    expect(
      () =>
        new BistekHybridStrategy({
          apiStrategy: new ForeignStrategy('api'),
          playwrightStrategy: new FakeStrategy(
            'playwright',
            createOutput('playwright', 'succeeded', 1),
          ),
        }),
    ).toThrow('Bistek api strategy must belong to supermarket bistek.');
  });
});

class FakeStrategy implements ExtractionStrategy {
  readonly supermarketId = 'bistek';

  readonly mode: 'api' | 'playwright';

  readonly inputs: ExtractionStrategyInput[] = [];

  private readonly output: ExtractionStrategyOutput;

  constructor(mode: 'api' | 'playwright', output: ExtractionStrategyOutput) {
    this.mode = mode;
    this.output = output;
  }

  execute(input: ExtractionStrategyInput): Promise<ExtractionStrategyOutput> {
    this.inputs.push(input);

    return Promise.resolve(this.output);
  }
}

class ForeignStrategy implements ExtractionStrategy {
  readonly supermarketId = 'coop';

  readonly mode: 'api' | 'playwright';

  constructor(mode: 'api' | 'playwright') {
    this.mode = mode;
  }

  execute(): Promise<ExtractionStrategyOutput> {
    return Promise.resolve(createOutput('foreign', 'succeeded', 1));
  }
}

function createInput(
  visualDatasetCapturePolicy: ExtractionStrategyInput['visualDatasetCapturePolicy'],
): ExtractionStrategyInput {
  return {
    runId: 'run-1',
    startedAtIso: '2026-08-14T10:00:00.000Z',
    visualDatasetCapturePolicy,
    target: {
      targetId: 'bistek',
      supermarketId: 'bistek',
      supermarketName: 'Bistek',
      mode: 'hybrid',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

function createOutput(
  targetId: string,
  status: ExtractionStrategyOutput['status'],
  leafletsFound: number,
): ExtractionStrategyOutput {
  return {
    runId: 'run-1',
    targetId,
    supermarketId: 'bistek',
    status,
    leafletsFound,
    artifactsDownloaded: 0,
    artifactsReused: 0,
    datasetSamplesCreated: 0,
    units: [],
    failures: [],
  };
}
