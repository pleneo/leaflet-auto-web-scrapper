import { resolve } from 'node:path';
import { ConsoleLogger } from '../logging/console-logger';
import { CarnaubaLeafletExtractor } from '../scrapers/carnauba/carnauba-leaflet-extractor';
import { CarnaubaPlaywrightExtractionService } from '../scrapers/carnauba/carnauba-playwright-extraction';
import { MercadappCarnaubaApiClient } from '../scrapers/carnauba/mercadapp-api-client';
import { PlaywrightCarnaubaLeafletPageFactory } from '../scrapers/carnauba/playwright-carnauba-leaflet-page.factory';
import { PlaywrightMercadappAuthTokenProvider } from '../scrapers/carnauba/playwright-mercadapp-auth-token-provider';
import { StoreSnapshotCache } from '../scrapers/carnauba/store-snapshot-cache';
import { LocalCarnaubaPlaywrightLeafletStorage } from '../storage/carnauba-playwright-leaflet-storage';
import { FetchLeafletImageHttpClient } from '../storage/fetch-leaflet-image-http-client';
import { SystemClock } from '../time/system-clock';
import { parseCarnaubaPlaywrightCommandOptions } from './carnauba-playwright-command-options';

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected Carnauba Playwright extraction failure.';
    console.error(`[ERROR] ${message}`);
    process.exitCode = 1;
  }
}

async function run(): Promise<void> {
  const options = parseCarnaubaPlaywrightCommandOptions(process.argv.slice(2), process.env);
  const logger = new ConsoleLogger('info');
  const authTokenProvider = new PlaywrightMercadappAuthTokenProvider({
    bootstrapUrl: `${options.siteBaseUrl.replace(/\/+$/, '')}/loja/79/encartes`,
    timeoutMs: options.timeoutMs,
  });
  const apiClient = new MercadappCarnaubaApiClient({
    baseUrl: options.apiBaseUrl,
    brandId: options.brandId,
    authTokenProvider,
  });
  const clock = new SystemClock();
  const service = new CarnaubaPlaywrightExtractionService(
    apiClient,
    new StoreSnapshotCache({
      cacheRootDirectory: resolve(process.cwd(), options.cacheRootDirectory),
    }),
    new CarnaubaLeafletExtractor(new PlaywrightCarnaubaLeafletPageFactory(), clock, logger),
    clock,
    logger,
  );
  const storage = new LocalCarnaubaPlaywrightLeafletStorage(new FetchLeafletImageHttpClient());
  const result = await service.extract({
    brandId: options.brandId,
    storeCacheTtlMs: options.cacheTtlMs,
    siteBaseUrl: options.siteBaseUrl,
    viewport: options.viewport,
    timeoutMs: options.timeoutMs,
    settleDelayMs: options.settleDelayMs,
  });
  const stored = await storage.store({
    rootDirectory: resolve(process.cwd(), options.outputRootDirectory),
    result,
  });

  logger.info('Carnauba Playwright extraction completed.', {
    stores: result.stores.length,
    leaflets: result.stores.reduce((total, store) => total + store.leaflets.length, 0),
    output: stored.directoryPath,
  });
}

void main();
