import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Logger } from '../../application/ports/logger';
import { VisualDatasetCaptureService } from '../../application/services/visual-dataset-capture-service';
import { createExtractionTarget } from '../../domain/extraction/extraction-target';
import { ConsoleLogger } from '../logging/console-logger';
import { JsonLogger } from '../logging/json-logger';
import { FileSystemVisualDatasetSampleRepository } from '../repositories/file-system-visual-dataset-sample-repository';
import { AtacadaoLeafletExtractor } from '../scrapers/atacadao/atacadao-leaflet-extractor';
import { AtacadaoPlaywrightStrategyAdapter } from '../scrapers/atacadao/atacadao-playwright-strategy-adapter';
import { listAtacadaoMonitoredStores } from '../scrapers/atacadao/atacadao-targets';
import { PlaywrightAtacadaoLeafletPageFactory } from '../scrapers/atacadao/playwright-atacadao-leaflet-page.factory';
import { FetchLeafletPdfHttpClient } from '../storage/fetch-leaflet-pdf-http-client';
import { LocalSharedPdfLeafletStorage } from '../storage/leaflet-pdf-storage';
import { SystemClock } from '../time/system-clock';
import {
  filterAtacadaoStores,
  parseAtacadaoPlaywrightCommandOptions,
} from './atacadao-playwright-command-options';

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected Atacadao Playwright extraction failure.';
    console.error(`[ERROR] ${message}`);
    process.exitCode = 1;
  }
}

async function run(): Promise<void> {
  const options = parseAtacadaoPlaywrightCommandOptions(process.argv.slice(2), process.env);
  const logger = createLogger(process.env);
  const clock = new SystemClock();
  const startedAtIso = clock.nowIso();
  const runId = `atacadao-playwright-${startedAtIso.replace(/[:.]/g, '-')}`;
  const visualDatasetRootDirectory = resolve(process.cwd(), options.visualDatasetRootDirectory);
  const stores = filterAtacadaoStores(listAtacadaoMonitoredStores(), options);

  if (stores.length === 0) {
    throw new Error('No Atacadao monitored stores matched the supplied filters.');
  }

  const adapter = createStrategy(options, stores, visualDatasetRootDirectory, clock, logger);
  const output = await adapter.execute({
    runId,
    startedAtIso,
    target: createExtractionTarget({
      targetId: 'atacadao',
      supermarketId: 'atacadao',
      supermarketName: 'Atacadão',
      mode: 'playwright',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 1,
    }),
    visualDatasetCapturePolicy: options.visualDatasetEnabled ? 'always' : 'disabled',
    logger,
  });

  logger.info('Atacadao Playwright extraction completed.', {
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
  options: ReturnType<typeof parseAtacadaoPlaywrightCommandOptions>,
  stores: ReturnType<typeof filterAtacadaoStores>,
  visualDatasetRootDirectory: string,
  clock: SystemClock,
  logger: Logger,
): AtacadaoPlaywrightStrategyAdapter {
  const visualDatasetCaptureService =
    options.visualDatasetEnabled && visualDatasetRootDirectory.trim().length > 0
      ? new VisualDatasetCaptureService(
          new FileSystemVisualDatasetSampleRepository({
            rootDirectory: visualDatasetRootDirectory,
          }),
          clock,
        )
      : undefined;
  const extractionService = new AtacadaoLeafletExtractor(
    new PlaywrightAtacadaoLeafletPageFactory(),
    clock,
    logger,
    visualDatasetCaptureService,
  );

  return new AtacadaoPlaywrightStrategyAdapter(
    {
      extractionInput: {
        stores,
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
