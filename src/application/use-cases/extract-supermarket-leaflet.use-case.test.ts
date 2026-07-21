import { describe, expect, it } from 'vitest';
import type { VisualDatasetSample } from '../../domain/dataset/visual-dataset-sample';
import { createPixelBoundingBox, normalizeBoundingBox } from '../../domain/dataset/bounding-box';
import type { ExtractionRunSummary } from '../../domain/extraction/extraction-run';
import type { PromotionLeaflet } from '../../domain/leaflet/promotion-leaflet';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import type { Clock } from '../ports/clock';
import type { DatasetSampleRepository } from '../ports/dataset-sample-repository';
import type { ExtractionRunRepository } from '../ports/extraction-run-repository';
import type { LeafletRepository } from '../ports/leaflet-repository';
import type { LogContext, Logger } from '../ports/logger';
import type {
  StrategyExecutionContext,
  StrategyExtractionOutput,
  SupermarketStrategy,
} from '../ports/supermarket-strategy';
import { StrategyRegistry } from '../services/strategy-registry';
import { ExtractSupermarketLeafletUseCase } from './extract-supermarket-leaflet.use-case';

describe('ExtractSupermarketLeafletUseCase', () => {
  it('runs one extraction attempt and persists business and visual dataset outputs', async () => {
    const output = createStrategyOutput();
    const strategy = new FakeStrategy('carnauba', Promise.resolve(output));
    const dependencies = createDependencies([strategy]);
    const useCase = new ExtractSupermarketLeafletUseCase(dependencies);

    const result = await useCase.execute({
      runId: 'run-1',
      supermarketId: 'carnauba',
      scheduledAtIso: '2026-07-17T10:00:00.000Z',
      attemptNumber: 1,
      maxAttempts: 3,
    });

    expect(result).toEqual({
      runId: 'run-1',
      leaflet: output.leaflet,
      datasetSamples: output.datasetSamples,
      completedAtIso: '2026-07-17T10:00:02.000Z',
    });
    expect(dependencies.leafletRepository.savedLeaflets).toEqual([output.leaflet]);
    expect(dependencies.datasetSampleRepository.savedBatches).toEqual([output.datasetSamples]);
    expect(dependencies.extractionRunRepository.savedRuns.map((run) => run.status)).toEqual([
      'running',
      'succeeded',
    ]);
    expect(strategy.receivedContext?.runId).toBe('run-1');
    expect(dependencies.logger.infos.map((entry) => entry.message)).toEqual([
      'Extraction run started.',
      'Extraction run completed.',
    ]);
  });

  it('marks the extraction run as failed when the strategy throws', async () => {
    const strategyError = new Error('Strategy failed.');
    const strategy = new FakeStrategy('carnauba', Promise.reject(strategyError));
    const dependencies = createDependencies([strategy]);
    const useCase = new ExtractSupermarketLeafletUseCase(dependencies);

    await expect(
      useCase.execute({
        runId: 'run-2',
        supermarketId: 'carnauba',
        scheduledAtIso: '2026-07-17T10:00:00.000Z',
        attemptNumber: 1,
        maxAttempts: 3,
      }),
    ).rejects.toThrow(strategyError);

    expect(dependencies.extractionRunRepository.savedRuns.map((run) => run.status)).toEqual([
      'running',
      'failed',
    ]);
    expect(dependencies.logger.errors).toEqual([
      {
        message: 'Extraction run failed.',
        context: {
          runId: 'run-2',
          supermarketId: 'carnauba',
          errorMessage: 'Strategy failed.',
        },
      },
    ]);
  });

  it('normalizes thrown non-error values', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- This test verifies defensive normalization of invalid external strategy rejections.
    const strategy = new FakeStrategy('carnauba', Promise.reject('invalid rejection'));
    const dependencies = createDependencies([strategy]);
    const useCase = new ExtractSupermarketLeafletUseCase(dependencies);

    await expect(
      useCase.execute({
        runId: 'run-3',
        supermarketId: 'carnauba',
        scheduledAtIso: '2026-07-17T10:00:00.000Z',
        attemptNumber: 1,
        maxAttempts: 3,
      }),
    ).rejects.toThrow('Non-error value thrown during extraction.');

    expect(dependencies.extractionRunRepository.savedRuns.map((run) => run.status)).toEqual([
      'running',
      'failed',
    ]);
  });
});

interface TestDependencies {
  readonly strategyRegistry: StrategyRegistry;
  readonly leafletRepository: InMemoryLeafletRepository;
  readonly datasetSampleRepository: InMemoryDatasetSampleRepository;
  readonly extractionRunRepository: InMemoryExtractionRunRepository;
  readonly clock: SequenceClock;
  readonly logger: MemoryLogger;
}

interface LogEntry {
  readonly message: string;
  readonly context: LogContext | undefined;
}

class FakeStrategy implements SupermarketStrategy {
  readonly supermarketId: SupermarketId;

  readonly supermarketName = 'Carnauba';

  readonly anchorUrl = 'https://example.com/carnauba';

  receivedContext: StrategyExecutionContext | undefined;

  private readonly output: Promise<StrategyExtractionOutput>;

  constructor(supermarketId: SupermarketId, output: Promise<StrategyExtractionOutput>) {
    this.supermarketId = supermarketId;
    this.output = output;
  }

  execute(context: StrategyExecutionContext): Promise<StrategyExtractionOutput> {
    this.receivedContext = context;
    return this.output;
  }
}

class InMemoryLeafletRepository implements LeafletRepository {
  readonly savedLeaflets: PromotionLeaflet[] = [];

  save(leaflet: PromotionLeaflet): Promise<void> {
    this.savedLeaflets.push(leaflet);
    return Promise.resolve();
  }
}

class InMemoryDatasetSampleRepository implements DatasetSampleRepository {
  readonly savedBatches: VisualDatasetSample[][] = [];

  saveMany(samples: readonly VisualDatasetSample[]): Promise<void> {
    this.savedBatches.push([...samples]);
    return Promise.resolve();
  }
}

class InMemoryExtractionRunRepository implements ExtractionRunRepository {
  readonly savedRuns: ExtractionRunSummary[] = [];

  save(run: ExtractionRunSummary): Promise<void> {
    this.savedRuns.push(run);
    return Promise.resolve();
  }
}

class SequenceClock implements Clock {
  private index = 0;

  private readonly values: readonly string[];

  constructor(values: readonly string[]) {
    this.values = values;
  }

  nowIso(): string {
    const value = this.values[this.index];

    if (value === undefined) {
      throw new Error('Clock sequence exhausted.');
    }

    this.index += 1;
    return value;
  }
}

class MemoryLogger implements Logger {
  readonly debugs: LogEntry[] = [];

  readonly infos: LogEntry[] = [];

  readonly warnings: LogEntry[] = [];

  readonly errors: LogEntry[] = [];

  debug(message: string, context?: LogContext): void {
    this.debugs.push({ message, context });
  }

  info(message: string, context?: LogContext): void {
    this.infos.push({ message, context });
  }

  warn(message: string, context?: LogContext): void {
    this.warnings.push({ message, context });
  }

  error(message: string, context?: LogContext): void {
    this.errors.push({ message, context });
  }
}

function createDependencies(strategies: readonly SupermarketStrategy[]): TestDependencies {
  return {
    strategyRegistry: new StrategyRegistry(strategies),
    leafletRepository: new InMemoryLeafletRepository(),
    datasetSampleRepository: new InMemoryDatasetSampleRepository(),
    extractionRunRepository: new InMemoryExtractionRunRepository(),
    clock: new SequenceClock([
      '2026-07-17T10:00:01.000Z',
      '2026-07-17T10:00:02.000Z',
      '2026-07-17T10:00:03.000Z',
    ]),
    logger: new MemoryLogger(),
  };
}

function createStrategyOutput(): StrategyExtractionOutput {
  const leaflet: PromotionLeaflet = {
    leafletId: 'leaflet-1',
    supermarketId: 'carnauba',
    supermarketName: 'Carnauba',
    fileFormat: 'pdf',
    sourcePageUrl: 'https://example.com/carnauba',
    artifactUrl: 'https://example.com/leaflet.pdf',
    storageKey: 'artifacts/carnauba/leaflet-1.pdf',
    metadata: {
      metadataKind: 'base',
      capturedAtIso: '2026-07-17T10:00:01.000Z',
      sourcePageUrl: 'https://example.com/carnauba',
      validityStartDateIso: null,
      validityEndDateIso: null,
      city: null,
      stateCode: null,
    },
  };

  const viewportBox = createPixelBoundingBox({
    xMin: 10,
    yMin: 20,
    xMax: 110,
    yMax: 220,
  });
  const documentBox = createPixelBoundingBox({
    xMin: 10,
    yMin: 120,
    xMax: 110,
    yMax: 320,
  });

  return {
    leaflet,
    datasetSamples: [
      {
        sampleId: 'sample-1',
        runId: 'run-1',
        supermarketId: 'carnauba',
        stateName: 'ANCHOR_PAGE',
        pageUrl: 'https://example.com/carnauba',
        screenshotPng: new Uint8Array([1, 2, 3]),
        screenshotMetadata: {
          fileName: 'sample-1.png',
          mimeType: 'image/png',
          fullPage: true,
          viewport: {
            width: 800,
            height: 600,
          },
          documentWidth: 800,
          documentHeight: 1_000,
          scrollPosition: {
            scrollX: 0,
            scrollY: 100,
          },
          capturedAtIso: '2026-07-17T10:00:01.000Z',
        },
        target: {
          label: 'open_leaflets_page_button',
          viewportBox,
          documentBox,
          normalizedDocumentBox: normalizeBoundingBox(documentBox, {
            width: 800,
            height: 1_000,
          }),
        },
        split: 'unassigned',
      },
    ],
  };
}
