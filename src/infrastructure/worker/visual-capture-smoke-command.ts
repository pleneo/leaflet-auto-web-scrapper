import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { ConsoleLogger } from '../logging/console-logger';
import { PlaywrightBrowserFactory } from '../playwright/playwright-browser.factory';
import { PlaywrightVisualCaptureAdapter } from '../playwright/playwright-visual-capture.adapter';
import { LocalArtifactStorageAdapter } from '../storage/local-artifact-storage.adapter';
import { SystemClock } from '../time/system-clock';
import { parseVisualCaptureSmokeCommandOptions } from './visual-capture-smoke-command-options';

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected smoke command failure.';
    console.error(`[ERROR] ${message}`);
    process.exitCode = 1;
  }
}

async function run(): Promise<void> {
  const options = parseVisualCaptureSmokeCommandOptions(process.argv.slice(2));
  const logger = new ConsoleLogger('info');
  const clock = new SystemClock();
  const capture = new PlaywrightVisualCaptureAdapter(new PlaywrightBrowserFactory(), clock, logger);
  const storage = new LocalArtifactStorageAdapter({
    rootDirectory: resolve(process.cwd(), options.artifactRootDirectory),
  });
  const runId = `smoke-${randomUUID()}`;
  const captureId = `capture-${randomUUID()}`;

  const result = await capture.capturePage({
    captureId,
    url: options.url,
    viewport: options.viewport,
    fullPage: options.fullPage,
    timeoutMs: options.timeoutMs,
    settleDelayMs: options.settleDelayMs,
  });

  const artifact = await storage.storeVisualCapture({
    runId,
    supermarketId: options.supermarketId,
    capture: result,
  });

  logger.info('Visual capture smoke command completed.', {
    captureId: artifact.captureId,
    metadataPath: artifact.metadataPath,
    screenshotPath: artifact.screenshotPath,
  });
}

void main();
