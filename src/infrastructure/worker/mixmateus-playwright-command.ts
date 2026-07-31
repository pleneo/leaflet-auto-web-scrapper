import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Logger } from '../../application/ports/logger';
import { VisualDatasetCaptureService } from '../../application/services/visual-dataset-capture-service';
import { createExtractionTarget } from '../../domain/extraction/extraction-target';
import { ConsoleLogger } from '../logging/console-logger';
import { JsonLogger } from '../logging/json-logger';
import { FileSystemVisualDatasetSampleRepository } from '../repositories/file-system-visual-dataset-sample-repository';
import { PlaywrightMixMateusLeafletPageFactory } from '../scrapers/mixmateus/playwright-mixmateus-leaflet-page.factory';
import { MixMateusLeafletExtractor } from '../scrapers/mixmateus/mixmateus-leaflet-extractor';
import { MixMateusPlaywrightStrategyAdapter } from '../scrapers/mixmateus/mixmateus-playwright-strategy-adapter';
import { listMixMateusMonitoredStores } from '../scrapers/mixmateus/mixmateus-targets';
import { FetchLeafletPdfHttpClient } from '../storage/fetch-leaflet-pdf-http-client';
import { LocalSharedPdfLeafletStorage } from '../storage/leaflet-pdf-storage';
import { SystemClock } from '../time/system-clock';
import { parseMixMateusPlaywrightCommandOptions } from './mixmateus-playwright-command-options';

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unexpected Mix Mateus Playwright extraction failure.';
    console.error(`[ERROR] ${message}`);
    process.exitCode = 1;
  }
}

async function run(): Promise<void> {
  const options = parseMixMateusPlaywrightCommandOptions(process.argv.slice(2), process.env);
  const logger = createLogger(process.env);
  const clock = new SystemClock();
  const startedAtIso = clock.nowIso();
  const runId = `mixmateus-playwright-${startedAtIso.replace(/[:.]/g, '-')}`;
  const visualDatasetRootDirectory = resolve(process.cwd(), options.visualDatasetRootDirectory);
  const adapter = createStrategy(options, visualDatasetRootDirectory, clock, logger);
  const output = await adapter.execute({
    runId,
    startedAtIso,
    target: createExtractionTarget({
      targetId: 'mixmateus',
      supermarketId: 'mixmateus',
      supermarketName: 'Mix Mateus',
      mode: 'playwright',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    }),
    visualDatasetCapturePolicy: options.visualDatasetEnabled ? 'always' : 'disabled',
    logger,
  });

  logger.info('Mix Mateus Playwright extraction completed.', {
    status: output.status,
    stores: output.units.length,
    leaflets: output.leafletsFound,
    artifactsDownloaded: output.artifactsDownloaded,
    artifactsReused: output.artifactsReused,
    datasetSamplesCreated: output.datasetSamplesCreated,
    runId,
  });
}

function createStrategy(
  options: ReturnType<typeof parseMixMateusPlaywrightCommandOptions>,
  visualDatasetRootDirectory: string,
  clock: SystemClock,
  logger: Logger,
): MixMateusPlaywrightStrategyAdapter {
  const visualDatasetCaptureService =
    options.visualDatasetEnabled && visualDatasetRootDirectory.trim().length > 0
      ? new VisualDatasetCaptureService(
          new FileSystemVisualDatasetSampleRepository({
            rootDirectory: visualDatasetRootDirectory,
          }),
          clock,
        )
      : undefined;
  const extractionService = new MixMateusLeafletExtractor(
    new PlaywrightMixMateusLeafletPageFactory(),
    clock,
    logger,
    visualDatasetCaptureService,
  );

  return new MixMateusPlaywrightStrategyAdapter(
    {
      extractionInput: {
        homeUrl: options.siteBaseUrl,
        stores: listMixMateusMonitoredStores(),
        viewport: options.viewport,
        timeoutMs: options.timeoutMs,
        storeTimeoutMs: options.storeTimeoutMs,
        maxStoreAttempts: options.maxStoreAttempts,
        settleDelayMs: options.settleDelayMs,
      },
      outputRootDirectory: resolve(process.cwd(), options.outputRootDirectory),
      visualDatasetRootDirectory,
      visualDatasetSplit: options.visualDatasetSplit,
    },
    {
      extractionService,
      storage: new LocalSharedPdfLeafletStorage(new FetchLeafletPdfHttpClient()),
      countVisualDatasetSamples,
    },
  );
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
