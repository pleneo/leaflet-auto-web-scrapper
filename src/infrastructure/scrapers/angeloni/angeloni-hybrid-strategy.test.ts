import { describe, expect, it, vi } from 'vitest';
import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyOutput,
} from '../../../application/ports/extraction-strategy';
import {
  AngeloniHybridStrategy,
  InvalidAngeloniHybridStrategyError,
} from './angeloni-hybrid-strategy';

describe('AngeloniHybridStrategy', () => {
  it('uses API first when visual dataset capture is disabled and skips Playwright on API success', async () => {
    const apiStrategy = new FakeStrategy(
      'api',
      createOutput('api', 'succeeded', 2, [createUnit('1', 'succeeded')]),
    );
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput('playwright', 'succeeded', 2, [createUnit('1', 'succeeded')]),
    );
    const strategy = new AngeloniHybridStrategy({ apiStrategy, playwrightStrategy });

    const input = createInput('disabled');
    const loggerInfo = vi.spyOn(input.logger, 'info');
    const output = await strategy.execute(input);

    expect(output.targetId).toBe('api');
    expect(apiStrategy.inputs[0]?.target.mode).toBe('api');
    expect(playwrightStrategy.inputs).toEqual([]);
    expect(loggerInfo).toHaveBeenCalledWith(
      'Angeloni region extracted successfully via API.',
      expect.objectContaining({ unitId: '1', unitName: 'Region 1' }),
    );
  });

  it('uses API first even when visual dataset capture is enabled and skips Playwright on full API success', async () => {
    const apiStrategy = new FakeStrategy(
      'api',
      createOutput('api', 'succeeded', 2, [createUnit('1', 'succeeded')]),
    );
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput('playwright', 'succeeded', 2, [createUnit('1', 'succeeded')]),
    );
    const strategy = new AngeloniHybridStrategy({ apiStrategy, playwrightStrategy });

    const input = createInput('always');
    const output = await strategy.execute(input);

    expect(output.targetId).toBe('api');
    expect(apiStrategy.inputs).toHaveLength(1);
    expect(playwrightStrategy.inputs).toEqual([]);
  });

  it('falls back to Playwright and merges outputs when API has failing region units', async () => {
    const apiStrategy = new FakeStrategy(
      'api',
      createOutput('api', 'partially_succeeded', 1, [
        createUnit('1', 'succeeded'),
        createUnit('2', 'failed'),
      ]),
    );
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput('playwright', 'succeeded', 2, [createUnit('2', 'succeeded')], 5),
    );
    const strategy = new AngeloniHybridStrategy({ apiStrategy, playwrightStrategy });

    const input = createInput('always');
    const loggerWarn = vi.spyOn(input.logger, 'warn');
    const output = await strategy.execute(input);

    expect(output.status).toBe('succeeded');
    expect(output.leafletsFound).toBe(2);
    expect(output.datasetSamplesCreated).toBe(5);
    expect(output.units).toHaveLength(2);
    expect(playwrightStrategy.inputs).toHaveLength(1);
    expect(loggerWarn).toHaveBeenCalledWith(
      'Angeloni region API extraction failed; Playwright fallback may be required.',
      expect.objectContaining({ unitId: '2' }),
    );
  });

  it('returns partially_succeeded status when Playwright fallback still has failed units', async () => {
    const apiStrategy = new FakeStrategy(
      'api',
      createOutput('api', 'partially_succeeded', 1, [
        createUnit('1', 'succeeded'),
        createUnit('2', 'failed'),
      ]),
    );
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput('playwright', 'failed', 0, [createUnit('2', 'failed')]),
    );
    const strategy = new AngeloniHybridStrategy({ apiStrategy, playwrightStrategy });

    const input = createInput('always');
    const output = await strategy.execute(input);

    expect(output.status).toBe('partially_succeeded');
    expect(output.units).toHaveLength(2);
  });

  it('falls back to Playwright when API returns no units at all', async () => {
    const apiStrategy = new FakeStrategy('api', createOutput('api', 'failed', 0, []));
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput('playwright', 'succeeded', 1, [createUnit('1', 'succeeded')]),
    );
    const strategy = new AngeloniHybridStrategy({ apiStrategy, playwrightStrategy });

    const output = await strategy.execute(createInput('disabled'));

    expect(output.targetId).toBe('playwright');
    expect(playwrightStrategy.inputs).toHaveLength(1);
  });

  it('validates strategy modes and supermarket id', () => {
    expect(
      () =>
        new AngeloniHybridStrategy({
          apiStrategy: new FakeStrategy('playwright', createOutput('api', 'succeeded', 1)),
          playwrightStrategy: new FakeStrategy(
            'playwright',
            createOutput('playwright', 'succeeded', 1),
          ),
        }),
    ).toThrow(InvalidAngeloniHybridStrategyError);
    expect(
      () =>
        new AngeloniHybridStrategy({
          apiStrategy: new ForeignStrategy('api'),
          playwrightStrategy: new FakeStrategy(
            'playwright',
            createOutput('playwright', 'succeeded', 1),
          ),
        }),
    ).toThrow('Angeloni api strategy must belong to supermarket angeloni.');
  });
});

class FakeStrategy implements ExtractionStrategy {
  readonly supermarketId = 'angeloni';

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
      targetId: 'angeloni',
      supermarketId: 'angeloni',
      supermarketName: 'Angeloni',
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
  units: ExtractionStrategyOutput['units'] = [],
  datasetSamplesCreated = 0,
): ExtractionStrategyOutput {
  return {
    runId: 'run-1',
    targetId,
    supermarketId: 'angeloni',
    status,
    leafletsFound,
    artifactsDownloaded: 0,
    artifactsReused: 0,
    datasetSamplesCreated,
    units,
    failures: [],
  };
}

function createUnit(
  unitId: string,
  status: 'succeeded' | 'failed' | 'empty',
): ExtractionStrategyOutput['units'][number] {
  return {
    unitId,
    unitName: `Region ${unitId}`,
    status,
    sourceUrl: `https://example.com/region/${unitId}`,
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
