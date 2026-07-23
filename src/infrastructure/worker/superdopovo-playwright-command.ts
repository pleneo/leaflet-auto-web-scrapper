import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Logger } from '../../application/ports/logger';
import { VisualDatasetCaptureService } from '../../application/services/visual-dataset-capture-service';
import { createExtractionTarget } from '../../domain/extraction/extraction-target';
import { ConsoleLogger } from '../logging/console-logger';
import { JsonLogger } from '../logging/json-logger';
import { FileSystemVisualDatasetSampleRepository } from '../repositories/file-system-visual-dataset-sample-repository';
import { PlaywrightSuperDoPovoApiClient } from '../scrapers/superdopovo/playwright-superdopovo-api-client';
import { PlaywrightSuperDoPovoLeafletPageFactory } from '../scrapers/superdopovo/playwright-superdopovo-leaflet-page.factory';
import { SuperDoPovoLeafletExtractor } from '../scrapers/superdopovo/superdopovo-leaflet-extractor';
import { SuperDoPovoPlaywrightExtractionService } from '../scrapers/superdopovo/superdopovo-playwright-extraction';
import { SuperDoPovoPlaywrightStrategyAdapter } from '../scrapers/superdopovo/superdopovo-playwright-strategy-adapter';
import { FetchLeafletImageHttpClient } from '../storage/fetch-leaflet-image-http-client';
import { LocalSharedImageGalleryStorage } from '../storage/shared-image-gallery-storage';
import { SystemClock } from '../time/system-clock';
import { parseSuperDoPovoPlaywrightCommandOptions } from './superdopovo-playwright-command-options';

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unexpected Super do Povo Playwright extraction failure.';
    console.error(`[ERROR] ${message}`);
    process.exitCode = 1;
  }
}

async function run(): Promise<void> {
  const options = parseSuperDoPovoPlaywrightCommandOptions(process.argv.slice(2), process.env);
  const logger = createLogger(process.env);
  const clock = new SystemClock();
  const startedAtIso = clock.nowIso();
  const runId = `superdopovo-playwright-${startedAtIso.replace(/[:.]/g, '-')}`;
  const visualDatasetRootDirectory = resolve(process.cwd(), options.visualDatasetRootDirectory);
  const apiClient = createApiClient(options);

  try {
    const adapter = createStrategy(options, visualDatasetRootDirectory, clock, logger, apiClient);
    const output = await adapter.execute({
      runId,
      startedAtIso,
      target: createExtractionTarget({
        targetId: 'superdopovo',
        supermarketId: 'superdopovo',
        supermarketName: 'Super do Povo',
        mode: 'playwright',
        enabled: true,
        intervalMinutes: 60,
        maxAttempts: 1,
      }),
      visualDatasetCapturePolicy: options.visualDatasetEnabled ? 'always' : 'disabled',
      logger,
    });

    logger.info('Super do Povo Playwright extraction completed.', {
      status: output.status,
      shops: output.units.length,
      leaflets: output.leafletsFound,
      artifactsDownloaded: output.artifactsDownloaded,
      artifactsReused: output.artifactsReused,
      datasetSamplesCreated: output.datasetSamplesCreated,
      runId,
    });
  } finally {
    await apiClient.close();
  }
}

function createStrategy(
  options: ReturnType<typeof parseSuperDoPovoPlaywrightCommandOptions>,
  visualDatasetRootDirectory: string,
  clock: SystemClock,
  logger: Logger,
  apiClient: PlaywrightSuperDoPovoApiClient,
): SuperDoPovoPlaywrightStrategyAdapter {
  const visualDatasetCaptureService =
    options.visualDatasetEnabled && visualDatasetRootDirectory.trim().length > 0
      ? new VisualDatasetCaptureService(
          new FileSystemVisualDatasetSampleRepository({
            rootDirectory: visualDatasetRootDirectory,
          }),
          clock,
        )
      : undefined;
  const extractionService = new SuperDoPovoPlaywrightExtractionService(
    apiClient,
    apiClient,
    new SuperDoPovoLeafletExtractor(
      new PlaywrightSuperDoPovoLeafletPageFactory(),
      clock,
      logger,
      visualDatasetCaptureService,
    ),
    clock,
    logger,
  );

  return new SuperDoPovoPlaywrightStrategyAdapter(
    {
      extractionInput: {
        siteBaseUrl: options.siteBaseUrl,
        defaultShopId: options.defaultShopId,
        viewport: options.viewport,
        timeoutMs: options.timeoutMs,
        shopTimeoutMs: options.shopTimeoutMs,
        maxShopAttempts: options.maxShopAttempts,
        settleDelayMs: options.settleDelayMs,
      },
      outputRootDirectory: resolve(process.cwd(), options.outputRootDirectory),
      visualDatasetRootDirectory,
      visualDatasetSplit: options.visualDatasetSplit,
    },
    {
      extractionService,
      storage: new LocalSharedImageGalleryStorage(new FetchLeafletImageHttpClient()),
      countVisualDatasetSamples,
    },
  );
}

function createApiClient(
  options: ReturnType<typeof parseSuperDoPovoPlaywrightCommandOptions>,
): PlaywrightSuperDoPovoApiClient {
  return new PlaywrightSuperDoPovoApiClient({
    bootstrapUrl: `${options.siteBaseUrl.replace(/\/+$/, '')}/booklets`,
    apiBaseUrl: options.apiBaseUrl,
    timeoutMs: options.timeoutMs,
  });
}

function createLogger(env: Readonly<Record<string, string | undefined>>): Logger {
  if (env['LOG_FORMAT'] === 'json') {
    return new JsonLogger('info');
  }

  return new ConsoleLogger('info');
}

async function countVisualDatasetSamples(rootDirectory: string, runId: string): Promise<number> {
  const filePaths = await listFiles(rootDirectory);

  return filePaths.filter(
    (filePath) => filePath.endsWith('/annotation.json') && filePath.includes(`/${runId}/`),
  ).length;
}

async function listFiles(directoryPath: string): Promise<readonly string[]> {
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  }).catch(() => []);
  const filePaths: string[] = [];

  for (const entry of entries) {
    const entryPath = `${directoryPath}/${entry.name}`;

    if (entry.isDirectory()) {
      filePaths.push(...(await listFiles(entryPath)));
      continue;
    }

    filePaths.push(entryPath);
  }

  return filePaths;
}

void main();
