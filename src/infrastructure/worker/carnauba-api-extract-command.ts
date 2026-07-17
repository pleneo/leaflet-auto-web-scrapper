import { resolve } from 'node:path';
import { ConsoleLogger } from '../logging/console-logger';
import { CarnaubaApiExtractionService } from '../scrapers/carnauba/carnauba-api-extraction';
import { MercadappCarnaubaApiClient } from '../scrapers/carnauba/mercadapp-api-client';
import { PlaywrightMercadappAuthTokenProvider } from '../scrapers/carnauba/playwright-mercadapp-auth-token-provider';
import { StoreSnapshotCache } from '../scrapers/carnauba/store-snapshot-cache';
import { FetchLeafletImageHttpClient } from '../storage/fetch-leaflet-image-http-client';
import { LocalCarnaubaApiLeafletStorage } from '../storage/carnauba-api-leaflet-storage';
import { SystemClock } from '../time/system-clock';
import { parseCarnaubaApiExtractCommandOptions } from './carnauba-api-extract-command-options';

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected Carnauba API extraction failure.';
    console.error(`[ERROR] ${message}`);
    process.exitCode = 1;
  }
}

async function run(): Promise<void> {
  const options = parseCarnaubaApiExtractCommandOptions(process.argv.slice(2), process.env);
  const logger = new ConsoleLogger('info');
  const authTokenProvider = new PlaywrightMercadappAuthTokenProvider({
    bootstrapUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
    timeoutMs: 30_000,
  });
  const apiClient = new MercadappCarnaubaApiClient({
    baseUrl: options.apiBaseUrl,
    brandId: options.brandId,
    authTokenProvider,
  });
  const service = new CarnaubaApiExtractionService(
    apiClient,
    apiClient,
    new StoreSnapshotCache({
      cacheRootDirectory: resolve(process.cwd(), options.cacheRootDirectory),
    }),
    new SystemClock(),
    logger,
  );
  const storage = new LocalCarnaubaApiLeafletStorage(new FetchLeafletImageHttpClient());
  const result = await service.extract({
    brandId: options.brandId,
    storeCacheTtlMs: options.cacheTtlMs,
  });
  const stored = await storage.store({
    rootDirectory: resolve(process.cwd(), options.outputRootDirectory),
    result,
  });

  logger.info('Carnauba API extraction completed.', {
    stores: result.stores.length,
    leaflets: result.stores.reduce((total, store) => total + store.leaflets.length, 0),
    output: stored.directoryPath,
  });
}

void main();
