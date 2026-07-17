import type { AcademicDatasetSample } from '../../domain/dataset/academic-dataset-sample';
import type { ExtractionRunStatus } from '../../domain/extraction/extraction-run-status';
import type { LeafletMetadata } from '../../domain/leaflet/leaflet-metadata';
import type { PromotionLeaflet } from '../../domain/leaflet/promotion-leaflet';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import type { Clock } from '../ports/clock';
import type { DatasetSampleRepository } from '../ports/dataset-sample-repository';
import type { ExtractionRunRepository } from '../ports/extraction-run-repository';
import type { LeafletRepository } from '../ports/leaflet-repository';
import type { Logger } from '../ports/logger';
import type { StrategyExtractionOutput } from '../ports/supermarket-strategy';
import type { StrategyRegistry } from '../services/strategy-registry';

export interface ExtractSupermarketLeafletInput {
  readonly runId: string;
  readonly supermarketId: SupermarketId;
  readonly scheduledAtIso: string;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
}

export interface ExtractionResult<TMetadata extends LeafletMetadata = LeafletMetadata> {
  readonly runId: string;
  readonly leaflet: PromotionLeaflet<TMetadata>;
  readonly datasetSamples: readonly AcademicDatasetSample[];
  readonly completedAtIso: string;
}

export interface ExtractSupermarketLeafletUseCaseDependencies {
  readonly strategyRegistry: StrategyRegistry;
  readonly leafletRepository: LeafletRepository;
  readonly datasetSampleRepository: DatasetSampleRepository;
  readonly extractionRunRepository: ExtractionRunRepository;
  readonly clock: Clock;
  readonly logger: Logger;
}

export class ExtractSupermarketLeafletUseCase {
  private readonly strategyRegistry: StrategyRegistry;

  private readonly leafletRepository: LeafletRepository;

  private readonly datasetSampleRepository: DatasetSampleRepository;

  private readonly extractionRunRepository: ExtractionRunRepository;

  private readonly clock: Clock;

  private readonly logger: Logger;

  constructor(dependencies: ExtractSupermarketLeafletUseCaseDependencies) {
    this.strategyRegistry = dependencies.strategyRegistry;
    this.leafletRepository = dependencies.leafletRepository;
    this.datasetSampleRepository = dependencies.datasetSampleRepository;
    this.extractionRunRepository = dependencies.extractionRunRepository;
    this.clock = dependencies.clock;
    this.logger = dependencies.logger;
  }

  async execute(input: ExtractSupermarketLeafletInput): Promise<ExtractionResult> {
    const startedAtIso = this.clock.nowIso();
    const strategy = this.strategyRegistry.get(input.supermarketId);

    await this.saveRun(input, 'running', startedAtIso, null);

    this.logger.info('Extraction run started.', {
      runId: input.runId,
      supermarketId: input.supermarketId,
      attemptNumber: input.attemptNumber,
    });

    try {
      const output = await strategy.execute({
        runId: input.runId,
        startedAtIso,
        logger: this.logger,
      });

      await this.persistOutput(output);

      const completedAtIso = this.clock.nowIso();
      await this.saveRun(input, 'succeeded', startedAtIso, completedAtIso);

      this.logger.info('Extraction run completed.', {
        runId: input.runId,
        supermarketId: input.supermarketId,
      });

      return {
        runId: input.runId,
        leaflet: output.leaflet,
        datasetSamples: output.datasetSamples,
        completedAtIso,
      };
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error('Non-error value thrown during extraction.');
      const completedAtIso = this.clock.nowIso();

      await this.saveRun(input, 'failed', startedAtIso, completedAtIso);

      this.logger.error('Extraction run failed.', {
        runId: input.runId,
        supermarketId: input.supermarketId,
        errorMessage: normalizedError.message,
      });

      throw normalizedError;
    }
  }

  private async persistOutput(output: StrategyExtractionOutput): Promise<void> {
    await this.leafletRepository.save(output.leaflet);
    await this.datasetSampleRepository.saveMany(output.datasetSamples);
  }

  private async saveRun(
    input: ExtractSupermarketLeafletInput,
    status: ExtractionRunStatus,
    startedAtIso: string | null,
    completedAtIso: string | null,
  ): Promise<void> {
    await this.extractionRunRepository.save({
      runId: input.runId,
      supermarketId: input.supermarketId,
      status,
      scheduledAtIso: input.scheduledAtIso,
      startedAtIso,
      completedAtIso,
      attemptNumber: input.attemptNumber,
      maxAttempts: input.maxAttempts,
    });
  }
}
