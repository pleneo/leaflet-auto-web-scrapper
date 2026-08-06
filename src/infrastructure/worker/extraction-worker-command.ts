import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Logger } from '../../application/ports/logger';
import type { ExtractionStrategy } from '../../application/ports/extraction-strategy';
import { InMemoryExtractionLock } from '../../application/services/extraction-lock';
import {
  createPlaywrightExtractionStrategy,
  ExtractionStrategyRegistry,
} from '../../application/services/extraction-strategy-registry';
import { ExtractionStateService } from '../../application/services/extraction-state-service';
import { ExtractionTargetRegistry } from '../../application/services/extraction-target-registry';
import { HybridExtractionStrategy } from '../../application/services/hybrid-extraction-strategy';
import { ScheduledExtractionRunner } from '../../application/services/scheduled-extraction-runner';
import {
  createExtractionTarget,
  type ExtractionMode,
} from '../../domain/extraction/extraction-target';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import { VisualDatasetCaptureService } from '../../application/services/visual-dataset-capture-service';
import { ConsoleLogger } from '../logging/console-logger';
import { JsonLogger } from '../logging/json-logger';
import { FileSystemExtractionStateRepository } from '../repositories/file-system-extraction-state-repository';
import { FileSystemVisualDatasetSampleRepository } from '../repositories/file-system-visual-dataset-sample-repository';
import { AssaiLeafletExtractor } from '../scrapers/assai/assai-leaflet-extractor';
import { FetchAssaiOfferCatalogClient } from '../scrapers/assai/assai-offer-catalog';
import { AssaiPlaywrightStrategyAdapter } from '../scrapers/assai/assai-playwright-strategy-adapter';
import { AssaiStoreUrlCache } from '../scrapers/assai/assai-store-url-cache';
import { listAssaiMonitoredStores } from '../scrapers/assai/assai-targets';
import { PlaywrightAssaiLeafletPageFactory } from '../scrapers/assai/playwright-assai-leaflet-page.factory';
import { AtacadaoLeafletExtractor } from '../scrapers/atacadao/atacadao-leaflet-extractor';
import { AtacadaoPlaywrightStrategyAdapter } from '../scrapers/atacadao/atacadao-playwright-strategy-adapter';
import { listAtacadaoMonitoredStores } from '../scrapers/atacadao/atacadao-targets';
import { PlaywrightAtacadaoLeafletPageFactory } from '../scrapers/atacadao/playwright-atacadao-leaflet-page.factory';
import { CarnaubaApiExtractionService } from '../scrapers/carnauba/carnauba-api-extraction';
import { CarnaubaApiStrategyAdapter } from '../scrapers/carnauba/carnauba-api-strategy-adapter';
import { CarnaubaLeafletExtractor } from '../scrapers/carnauba/carnauba-leaflet-extractor';
import { CarnaubaPlaywrightExtractionService } from '../scrapers/carnauba/carnauba-playwright-extraction';
import { CarnaubaPlaywrightStrategyAdapter } from '../scrapers/carnauba/carnauba-playwright-strategy-adapter';
import { MercadappCarnaubaApiClient } from '../scrapers/carnauba/mercadapp-api-client';
import { PlaywrightCarnaubaLeafletPageFactory } from '../scrapers/carnauba/playwright-carnauba-leaflet-page.factory';
import { PlaywrightMercadappAuthTokenProvider } from '../scrapers/carnauba/playwright-mercadapp-auth-token-provider';
import { StoreSnapshotCache } from '../scrapers/carnauba/store-snapshot-cache';
import { MixMateusLeafletExtractor } from '../scrapers/mixmateus/mixmateus-leaflet-extractor';
import { MixMateusPlaywrightStrategyAdapter } from '../scrapers/mixmateus/mixmateus-playwright-strategy-adapter';
import { listMixMateusMonitoredStores } from '../scrapers/mixmateus/mixmateus-targets';
import { PlaywrightMixMateusLeafletPageFactory } from '../scrapers/mixmateus/playwright-mixmateus-leaflet-page.factory';
import { PlaywrightSuperDoPovoApiClient } from '../scrapers/superdopovo/playwright-superdopovo-api-client';
import { PlaywrightSuperDoPovoLeafletPageFactory } from '../scrapers/superdopovo/playwright-superdopovo-leaflet-page.factory';
import { SuperDoPovoApiExtractionService } from '../scrapers/superdopovo/superdopovo-api-extraction';
import { SuperDoPovoApiStrategyAdapter } from '../scrapers/superdopovo/superdopovo-api-strategy-adapter';
import { SuperDoPovoLeafletExtractor } from '../scrapers/superdopovo/superdopovo-leaflet-extractor';
import { SuperDoPovoPlaywrightExtractionService } from '../scrapers/superdopovo/superdopovo-playwright-extraction';
import { SuperDoPovoPlaywrightStrategyAdapter } from '../scrapers/superdopovo/superdopovo-playwright-strategy-adapter';
import { FetchLeafletImageHttpClient } from '../storage/fetch-leaflet-image-http-client';
import { FetchLeafletPdfHttpClient } from '../storage/fetch-leaflet-pdf-http-client';
import { LocalCarnaubaPlaywrightLeafletStorage } from '../storage/carnauba-playwright-leaflet-storage';
import { LocalSharedPdfLeafletStorage } from '../storage/leaflet-pdf-storage';
import { LocalSharedImageGalleryStorage } from '../storage/shared-image-gallery-storage';
import { SystemClock } from '../time/system-clock';
import {
  filterAtacadaoStores,
  parseAtacadaoPlaywrightCommandOptions,
} from './atacadao-playwright-command-options';
import {
  filterAssaiStores,
  parseAssaiPlaywrightCommandOptions,
} from './assai-playwright-command-options';
import { parseCarnaubaPlaywrightCommandOptions } from './carnauba-playwright-command-options';
import { parseExtractionWorkerCommandOptions } from './extraction-worker-command-options';
import { parseMixMateusPlaywrightCommandOptions } from './mixmateus-playwright-command-options';
import { parseSuperDoPovoPlaywrightCommandOptions } from './superdopovo-playwright-command-options';

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected extraction worker failure.';
    console.error(`[ERROR] ${message}`);
    process.exitCode = 1;
  }
}

async function run(): Promise<void> {
  const workerOptions = parseExtractionWorkerCommandOptions(process.argv.slice(2), process.env);
  const carnaubaOptions = parseCarnaubaPlaywrightCommandOptions(process.argv.slice(2), process.env);
  const superDoPovoOptions = parseSuperDoPovoPlaywrightCommandOptions(
    process.argv.slice(2),
    process.env,
  );
  const mixMateusOptions = parseMixMateusPlaywrightCommandOptions(
    process.argv.slice(2),
    process.env,
  );
  const atacadaoOptions = parseAtacadaoPlaywrightCommandOptions(process.argv.slice(2), process.env);
  const assaiOptions = parseAssaiPlaywrightCommandOptions(process.argv.slice(2), process.env);
  const logger = createLogger(process.env);
  const clock = new SystemClock();
  const visualDatasetRootDirectory = resolve(
    process.cwd(),
    carnaubaOptions.visualDatasetRootDirectory,
  );
  const carnaubaPlaywrightStrategy = createPlaywrightExtractionStrategy(
    createCarnaubaStrategy(carnaubaOptions, visualDatasetRootDirectory, clock, logger),
  );
  const superDoPovoPlaywrightStrategy = createPlaywrightExtractionStrategy(
    createSuperDoPovoStrategy(superDoPovoOptions, visualDatasetRootDirectory, clock, logger),
  );
  const carnaubaApiStrategy = createCarnaubaApiStrategy(carnaubaOptions, clock, logger);
  const superDoPovoApiStrategy = createSuperDoPovoApiStrategy(superDoPovoOptions, clock, logger);
  const extractionStrategies: ExtractionStrategy[] = [
    carnaubaPlaywrightStrategy,
    carnaubaApiStrategy,
    new HybridExtractionStrategy('carnauba', {
      apiStrategy: carnaubaApiStrategy,
      playwrightStrategy: carnaubaPlaywrightStrategy,
    }),
    superDoPovoPlaywrightStrategy,
    superDoPovoApiStrategy,
    new HybridExtractionStrategy('superdopovo', {
      apiStrategy: superDoPovoApiStrategy,
      playwrightStrategy: superDoPovoPlaywrightStrategy,
    }),
    createPlaywrightExtractionStrategy(
      createMixMateusStrategy(mixMateusOptions, visualDatasetRootDirectory, clock, logger),
    ),
    createPlaywrightExtractionStrategy(
      createAtacadaoStrategy(atacadaoOptions, visualDatasetRootDirectory, clock, logger),
    ),
    createPlaywrightExtractionStrategy(
      createAssaiStrategy(assaiOptions, visualDatasetRootDirectory, clock, logger),
    ),
  ];
  const runner = new ScheduledExtractionRunner(
    {
      workerId: 'generic-playwright-worker',
      retryBaseDelayMs: workerOptions.retryBaseDelayMs,
      visualDatasetCapturePolicy: workerOptions.visualDatasetCapturePolicy,
      onlyTargetIds: workerOptions.onlyTargetIds,
    },
    {
      targetRegistry: new ExtractionTargetRegistry([
        createExtractionTarget({
          targetId: 'carnauba',
          supermarketId: 'carnauba',
          supermarketName: 'Carnauba Supermercados',
          mode: resolveWorkerTargetMode(workerOptions.extractionMode, 'carnauba'),
          enabled: true,
          intervalMinutes: Math.ceil(workerOptions.intervalMs / 60_000),
          maxAttempts: 1,
        }),
        createExtractionTarget({
          targetId: 'superdopovo',
          supermarketId: 'superdopovo',
          supermarketName: 'Super do Povo',
          mode: resolveWorkerTargetMode(workerOptions.extractionMode, 'superdopovo'),
          enabled: true,
          intervalMinutes: Math.ceil(workerOptions.intervalMs / 60_000),
          maxAttempts: 1,
        }),
        createExtractionTarget({
          targetId: 'mixmateus',
          supermarketId: 'mixmateus',
          supermarketName: 'Mix Mateus',
          mode: resolveWorkerTargetMode(workerOptions.extractionMode, 'mixmateus'),
          enabled: true,
          intervalMinutes: Math.ceil(workerOptions.intervalMs / 60_000),
          maxAttempts: 1,
        }),
        createExtractionTarget({
          targetId: 'atacadao',
          supermarketId: 'atacadao',
          supermarketName: 'Atacadão',
          mode: resolveWorkerTargetMode(workerOptions.extractionMode, 'atacadao'),
          enabled: true,
          intervalMinutes: Math.ceil(workerOptions.intervalMs / 60_000),
          maxAttempts: 1,
        }),
        createExtractionTarget({
          targetId: 'assai',
          supermarketId: 'assai',
          supermarketName: 'Assaí Atacadista',
          mode: resolveWorkerTargetMode(workerOptions.extractionMode, 'assai'),
          enabled: true,
          intervalMinutes: Math.ceil(workerOptions.intervalMs / 60_000),
          maxAttempts: 1,
        }),
      ]),
      strategyRegistry: new ExtractionStrategyRegistry(extractionStrategies),
      lock: new InMemoryExtractionLock(),
      stateService: new ExtractionStateService(
        new FileSystemExtractionStateRepository({
          rootDirectory: resolve(process.cwd(), workerOptions.stateRootDirectory),
        }),
      ),
      clock,
      logger,
      delay,
    },
  );
  const shutdown = createShutdownState(logger, workerOptions.shutdownTimeoutMs);

  registerShutdownHandlers(shutdown);

  if (workerOptions.runImmediately) {
    await runCycle(runner, shutdown);
  }

  while (!isShutdownRequested(shutdown)) {
    await delay(workerOptions.intervalMs);

    if (!isShutdownRequested(shutdown)) {
      await runCycle(runner, shutdown);
    }
  }
}

function createCarnaubaStrategy(
  carnaubaOptions: ReturnType<typeof parseCarnaubaPlaywrightCommandOptions>,
  visualDatasetRootDirectory: string,
  clock: SystemClock,
  logger: Logger,
): CarnaubaPlaywrightStrategyAdapter {
  const authTokenProvider = new PlaywrightMercadappAuthTokenProvider({
    bootstrapUrl: `${carnaubaOptions.siteBaseUrl.replace(/\/+$/, '')}/loja/79/encartes`,
    timeoutMs: carnaubaOptions.timeoutMs,
  });
  const apiClient = new MercadappCarnaubaApiClient({
    baseUrl: carnaubaOptions.apiBaseUrl,
    brandId: carnaubaOptions.brandId,
    authTokenProvider,
  });
  const visualDatasetCaptureService =
    carnaubaOptions.visualDatasetEnabled && visualDatasetRootDirectory.trim().length > 0
      ? new VisualDatasetCaptureService(
          new FileSystemVisualDatasetSampleRepository({
            rootDirectory: visualDatasetRootDirectory,
          }),
          clock,
        )
      : undefined;
  const extractionService = new CarnaubaPlaywrightExtractionService(
    apiClient,
    new StoreSnapshotCache({
      cacheRootDirectory: resolve(process.cwd(), carnaubaOptions.cacheRootDirectory),
    }),
    new CarnaubaLeafletExtractor(
      new PlaywrightCarnaubaLeafletPageFactory(),
      clock,
      logger,
      visualDatasetCaptureService,
    ),
    clock,
    logger,
  );

  return new CarnaubaPlaywrightStrategyAdapter(
    {
      extractionInput: {
        brandId: carnaubaOptions.brandId,
        storeCacheTtlMs: carnaubaOptions.cacheTtlMs,
        siteBaseUrl: carnaubaOptions.siteBaseUrl,
        viewport: carnaubaOptions.viewport,
        timeoutMs: carnaubaOptions.timeoutMs,
        storeTimeoutMs: carnaubaOptions.storeTimeoutMs,
        maxStoreAttempts: carnaubaOptions.maxStoreAttempts,
        settleDelayMs: carnaubaOptions.settleDelayMs,
      },
      outputRootDirectory: resolve(process.cwd(), carnaubaOptions.outputRootDirectory),
      visualDatasetRootDirectory,
      visualDatasetSplit: carnaubaOptions.visualDatasetSplit,
    },
    {
      extractionService,
      storage: new LocalCarnaubaPlaywrightLeafletStorage(new FetchLeafletImageHttpClient()),
      countVisualDatasetSamples,
      nowIso: () => clock.nowIso(),
    },
  );
}

function createCarnaubaApiStrategy(
  carnaubaOptions: ReturnType<typeof parseCarnaubaPlaywrightCommandOptions>,
  clock: SystemClock,
  logger: Logger,
): CarnaubaApiStrategyAdapter {
  const authTokenProvider = new PlaywrightMercadappAuthTokenProvider({
    bootstrapUrl: `${carnaubaOptions.siteBaseUrl.replace(/\/+$/, '')}/loja/79/encartes`,
    timeoutMs: carnaubaOptions.timeoutMs,
  });
  const apiClient = new MercadappCarnaubaApiClient({
    baseUrl: carnaubaOptions.apiBaseUrl,
    brandId: carnaubaOptions.brandId,
    authTokenProvider,
  });
  const extractionService = new CarnaubaApiExtractionService(
    apiClient,
    apiClient,
    new StoreSnapshotCache({
      cacheRootDirectory: resolve(process.cwd(), carnaubaOptions.cacheRootDirectory),
    }),
    clock,
    logger,
  );

  return new CarnaubaApiStrategyAdapter(
    {
      extractionInput: {
        brandId: carnaubaOptions.brandId,
        storeCacheTtlMs: carnaubaOptions.cacheTtlMs,
      },
      outputRootDirectory: resolve(process.cwd(), carnaubaOptions.outputRootDirectory),
      siteBaseUrl: carnaubaOptions.siteBaseUrl,
    },
    {
      extractionService,
      storage: new LocalSharedImageGalleryStorage(new FetchLeafletImageHttpClient()),
    },
  );
}

function createSuperDoPovoStrategy(
  options: ReturnType<typeof parseSuperDoPovoPlaywrightCommandOptions>,
  visualDatasetRootDirectory: string,
  clock: SystemClock,
  logger: Logger,
): SuperDoPovoPlaywrightStrategyAdapter {
  const apiClient = new PlaywrightSuperDoPovoApiClient({
    bootstrapUrl: `${options.siteBaseUrl.replace(/\/+$/, '')}/booklets`,
    apiBaseUrl: options.apiBaseUrl,
    timeoutMs: options.timeoutMs,
  });
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

function createSuperDoPovoApiStrategy(
  options: ReturnType<typeof parseSuperDoPovoPlaywrightCommandOptions>,
  clock: SystemClock,
  logger: Logger,
): SuperDoPovoApiStrategyAdapter {
  const apiClient = new PlaywrightSuperDoPovoApiClient({
    bootstrapUrl: `${options.siteBaseUrl.replace(/\/+$/, '')}/booklets`,
    apiBaseUrl: options.apiBaseUrl,
    timeoutMs: options.timeoutMs,
  });
  const extractionService = new SuperDoPovoApiExtractionService(
    apiClient,
    apiClient,
    clock,
    logger,
  );

  return new SuperDoPovoApiStrategyAdapter(
    {
      extractionInput: {
        siteBaseUrl: options.siteBaseUrl,
      },
      outputRootDirectory: resolve(process.cwd(), options.outputRootDirectory),
    },
    {
      extractionService,
      storage: new LocalSharedImageGalleryStorage(new FetchLeafletImageHttpClient()),
    },
  );
}

function createMixMateusStrategy(
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

function createAtacadaoStrategy(
  options: ReturnType<typeof parseAtacadaoPlaywrightCommandOptions>,
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
        stores: filterAtacadaoStores(listAtacadaoMonitoredStores(), options),
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

function createAssaiStrategy(
  options: ReturnType<typeof parseAssaiPlaywrightCommandOptions>,
  visualDatasetRootDirectory: string,
  clock: SystemClock,
  logger: Logger,
): AssaiPlaywrightStrategyAdapter {
  const visualDatasetCaptureService =
    options.visualDatasetEnabled && visualDatasetRootDirectory.trim().length > 0
      ? new VisualDatasetCaptureService(
          new FileSystemVisualDatasetSampleRepository({
            rootDirectory: visualDatasetRootDirectory,
          }),
          clock,
        )
      : undefined;
  const extractionService = new AssaiLeafletExtractor(
    new PlaywrightAssaiLeafletPageFactory(),
    new FetchAssaiOfferCatalogClient({
      catalogUrl: options.catalogUrl,
    }),
    new AssaiStoreUrlCache({
      cacheRootDirectory: resolve(process.cwd(), options.cacheRootDirectory),
    }),
    clock,
    logger,
    visualDatasetCaptureService,
  );

  return new AssaiPlaywrightStrategyAdapter(
    {
      extractionInput: {
        stores: filterAssaiStores(listAssaiMonitoredStores(), options),
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
      storage: new LocalSharedImageGalleryStorage(new FetchLeafletImageHttpClient()),
      countVisualDatasetSamples,
    },
  );
}

async function runCycle(runner: ScheduledExtractionRunner, shutdown: ShutdownState): Promise<void> {
  shutdown.activeCycle = runner.runCycle().then(() => undefined);
  await shutdown.activeCycle.finally(() => {
    shutdown.activeCycle = null;
  });
}

interface ShutdownState {
  requested: boolean;
  activeCycle: Promise<void> | null;
  readonly logger: Logger;
  readonly timeoutMs: number;
}

function createShutdownState(logger: Logger, timeoutMs: number): ShutdownState {
  return {
    requested: false,
    activeCycle: null,
    logger,
    timeoutMs,
  };
}

function isShutdownRequested(shutdown: ShutdownState): boolean {
  return shutdown.requested;
}

function registerShutdownHandlers(shutdown: ShutdownState): void {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      shutdown.requested = true;
      shutdown.logger.info('Extraction worker shutdown requested.', {
        signal,
      });

      if (shutdown.activeCycle !== null) {
        void Promise.race([shutdown.activeCycle, delay(shutdown.timeoutMs)]).then(() => undefined);
      }
    });
  }
}

function createLogger(env: Readonly<Record<string, string | undefined>>): Logger {
  if (env['LOG_FORMAT'] === 'json') {
    return new JsonLogger('info');
  }

  return new ConsoleLogger('info');
}

function resolveWorkerTargetMode(
  requestedMode: ExtractionMode,
  supermarketId: SupermarketId,
): ExtractionMode {
  if (requestedMode === 'playwright' || supportsApiExtraction(supermarketId)) {
    return requestedMode;
  }

  return 'playwright';
}

function supportsApiExtraction(supermarketId: SupermarketId): boolean {
  return supermarketId === 'carnauba' || supermarketId === 'superdopovo';
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, durationMs);
  });
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
