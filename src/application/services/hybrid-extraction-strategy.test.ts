import { describe, expect, it } from 'vitest';
import { createExtractionTarget } from '../../domain/extraction/extraction-target';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import type {
  ExtractionStrategy,
  ExtractionStrategyInput,
  ExtractionStrategyOutput,
} from '../ports/extraction-strategy';
import type { Logger } from '../ports/logger';
import {
  HybridExtractionStrategy,
  InvalidHybridExtractionStrategyError,
} from './hybrid-extraction-strategy';

describe('HybridExtractionStrategy', () => {
  it('returns the API output when API extraction succeeds with leaflets', async () => {
    const apiStrategy = new FakeStrategy('api', createOutput({ status: 'succeeded' }));
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput({ status: 'succeeded', leafletsFound: 2 }),
    );
    const hybridStrategy = new HybridExtractionStrategy('carnauba', {
      apiStrategy,
      playwrightStrategy,
    });

    const output = await hybridStrategy.execute(createInput());

    expect(output).toBe(apiStrategy.output);
    expect(apiStrategy.inputs[0]?.target.mode).toBe('api');
    expect(playwrightStrategy.inputs).toEqual([]);
  });

  it('falls back to Playwright when API output is failed', async () => {
    const apiStrategy = new FakeStrategy('api', createOutput({ status: 'failed' }));
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput({ status: 'succeeded', leafletsFound: 2 }),
    );
    const hybridStrategy = new HybridExtractionStrategy('carnauba', {
      apiStrategy,
      playwrightStrategy,
    });

    const output = await hybridStrategy.execute(createInput());

    expect(output).toBe(playwrightStrategy.output);
    expect(playwrightStrategy.inputs[0]?.target.mode).toBe('playwright');
  });

  it('falls back to Playwright when API output is empty', async () => {
    const apiStrategy = new FakeStrategy(
      'api',
      createOutput({ status: 'succeeded', leafletsFound: 0 }),
    );
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput({ status: 'succeeded', leafletsFound: 1 }),
    );
    const hybridStrategy = new HybridExtractionStrategy('carnauba', {
      apiStrategy,
      playwrightStrategy,
    });

    const output = await hybridStrategy.execute(createInput());

    expect(output.leafletsFound).toBe(1);
    expect(playwrightStrategy.inputs).toHaveLength(1);
  });

  it('falls back to Playwright when API extraction throws', async () => {
    const apiStrategy = new ThrowingFakeStrategy('api', new Error('API unavailable.'));
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput({ status: 'succeeded', leafletsFound: 1 }),
    );
    const logger = new RecordingLogger();
    const hybridStrategy = new HybridExtractionStrategy('carnauba', {
      apiStrategy,
      playwrightStrategy,
    });

    const output = await hybridStrategy.execute(createInput(logger));

    expect(output).toBe(playwrightStrategy.output);
    expect(logger.warnPayloads).toContainEqual({
      targetId: 'carnauba',
      supermarketId: 'carnauba',
      runId: 'run-1',
      errorMessage: 'API unavailable.',
    });
  });

  it('logs an unexpected API failure when API rejects without an error', async () => {
    const apiStrategy = new ThrowingFakeStrategy('api', null);
    const playwrightStrategy = new FakeStrategy(
      'playwright',
      createOutput({ status: 'succeeded', leafletsFound: 1 }),
    );
    const logger = new RecordingLogger();
    const hybridStrategy = new HybridExtractionStrategy('carnauba', {
      apiStrategy,
      playwrightStrategy,
    });

    await hybridStrategy.execute(createInput(logger));

    expect(logger.warnPayloads).toContainEqual({
      targetId: 'carnauba',
      supermarketId: 'carnauba',
      runId: 'run-1',
      errorMessage: 'Unexpected API extraction failure.',
    });
  });

  it('rejects strategies from another supermarket or mode', () => {
    expect(
      () =>
        new HybridExtractionStrategy('carnauba', {
          apiStrategy: new FakeStrategy('api', createOutput({ status: 'succeeded' }), 'assai'),
          playwrightStrategy: new FakeStrategy('playwright', createOutput({ status: 'succeeded' })),
        }),
    ).toThrow(InvalidHybridExtractionStrategyError);

    expect(
      () =>
        new HybridExtractionStrategy('carnauba', {
          apiStrategy: new FakeStrategy('playwright', createOutput({ status: 'succeeded' })),
          playwrightStrategy: new FakeStrategy('playwright', createOutput({ status: 'succeeded' })),
        }),
    ).toThrow(InvalidHybridExtractionStrategyError);
  });
});

function createInput(logger: Logger = new NullLogger()): ExtractionStrategyInput {
  return {
    runId: 'run-1',
    target: createExtractionTarget({
      targetId: 'carnauba',
      supermarketId: 'carnauba',
      supermarketName: 'Carnauba Supermercados',
      mode: 'hybrid',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    }),
    startedAtIso: '2026-08-06T10:00:00.000Z',
    visualDatasetCapturePolicy: 'always',
    logger,
  };
}

function createOutput(overrides: Partial<ExtractionStrategyOutput> = {}): ExtractionStrategyOutput {
  return {
    runId: 'run-1',
    targetId: 'carnauba',
    supermarketId: 'carnauba',
    status: 'succeeded',
    leafletsFound: 1,
    artifactsDownloaded: 1,
    artifactsReused: 0,
    datasetSamplesCreated: 0,
    units: [],
    failures: [],
    ...overrides,
  };
}

class FakeStrategy implements ExtractionStrategy {
  readonly supermarketId: SupermarketId;

  readonly mode: 'api' | 'playwright';

  readonly inputs: ExtractionStrategyInput[] = [];

  readonly output: ExtractionStrategyOutput;

  constructor(
    mode: 'api' | 'playwright',
    output: ExtractionStrategyOutput,
    supermarketId: SupermarketId = 'carnauba',
  ) {
    this.supermarketId = supermarketId;
    this.mode = mode;
    this.output = output;
  }

  execute(input: ExtractionStrategyInput): Promise<ExtractionStrategyOutput> {
    this.inputs.push(input);

    return Promise.resolve(this.output);
  }
}

class ThrowingFakeStrategy implements ExtractionStrategy {
  readonly supermarketId = 'carnauba';

  readonly mode: 'api' | 'playwright';

  private readonly error: Error | null;

  constructor(mode: 'api' | 'playwright', error: Error | null) {
    this.mode = mode;
    this.error = error;
  }

  execute(input: ExtractionStrategyInput): Promise<ExtractionStrategyOutput> {
    void input;

    if (this.error === null) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- covers defensive non-Error adapter rejection.
      return Promise.reject('invalid rejection');
    }

    return Promise.reject(this.error);
  }
}

class NullLogger implements Logger {
  debug(message: string): void {
    void message;
  }

  info(message: string): void {
    void message;
  }

  warn(message: string): void {
    void message;
  }

  error(message: string): void {
    void message;
  }
}

class RecordingLogger extends NullLogger {
  readonly warnPayloads: object[] = [];

  override warn(message: string, context?: object): void {
    void message;

    if (context !== undefined) {
      this.warnPayloads.push(context);
    }
  }
}
