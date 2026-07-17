import { resolve } from 'node:path';
import { ConsoleLogger } from '../logging/console-logger';
import { PlaywrightCarnaubaLeafletPageFactory } from '../scrapers/carnauba/playwright-carnauba-leaflet-page.factory';
import { FetchLeafletImageHttpClient } from '../storage/fetch-leaflet-image-http-client';
import { LocalLeafletImageStorage } from '../storage/leaflet-image-storage';
import { SystemClock } from '../time/system-clock';
import { parseCarnaubaLeafletsSmokeCommandOptions } from './carnauba-leaflets-smoke-command-options';
import { CarnaubaLeafletExtractor } from '../scrapers/carnauba/carnauba-leaflet-extractor';

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected Carnauba smoke failure.';
    console.error(`[ERROR] ${message}`);
    process.exitCode = 1;
  }
}

async function run(): Promise<void> {
  const options = parseCarnaubaLeafletsSmokeCommandOptions(process.argv.slice(2));
  const logger = new ConsoleLogger('info');
  const extractor = new CarnaubaLeafletExtractor(
    new PlaywrightCarnaubaLeafletPageFactory(),
    new SystemClock(),
    logger,
  );
  const storage = new LocalLeafletImageStorage(new FetchLeafletImageHttpClient());

  const result = await extractor.extract({
    sourceUrl: options.url,
    viewport: options.viewport,
    timeoutMs: options.timeoutMs,
    settleDelayMs: options.settleDelayMs,
  });
  const stored = await storage.store({
    rootDirectory: resolve(process.cwd(), options.outputRootDirectory),
    result,
  });

  logger.info('Carnauba leaflet extraction completed.', {
    leaflets: result.leaflets.length,
    output: stored.directoryPath,
  });

  for (const leaflet of stored.leaflets) {
    logger.info('Stored Carnauba leaflet images.', {
      leafletId: leaflet.leafletId,
      images: leaflet.images.length,
    });
  }
}

void main();
