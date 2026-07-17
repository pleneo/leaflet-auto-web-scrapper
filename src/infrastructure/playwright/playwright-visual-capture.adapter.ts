import type {
  CapturePageRequest,
  CaptureRegionRequest,
  VisualCapturePort,
} from '../../application/ports/visual-capture';
import type { Clock } from '../../application/ports/clock';
import type { Logger } from '../../application/ports/logger';
import type {
  VisualCaptureMetadata,
  VisualCaptureResult,
} from '../../domain/visual/capture-result';
import type { VisualBrowserFactory, VisualBrowserPage } from './visual-browser';

export class InvalidVisualCaptureRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidVisualCaptureRequestError';
  }
}

export class PlaywrightVisualCaptureAdapter implements VisualCapturePort {
  private readonly browserFactory: VisualBrowserFactory;

  private readonly clock: Clock;

  private readonly logger: Logger;

  constructor(browserFactory: VisualBrowserFactory, clock: Clock, logger: Logger) {
    this.browserFactory = browserFactory;
    this.clock = clock;
    this.logger = logger;
  }

  async capturePage(input: CapturePageRequest): Promise<VisualCaptureResult> {
    validateCaptureRequest(input.captureId, input.url, input.timeoutMs);
    this.logger.info('Starting visual page capture.', {
      captureId: input.captureId,
      url: input.url,
    });

    const page = await this.browserFactory.openPage({
      viewport: input.viewport,
    });

    try {
      await page.goto(input.url, input.timeoutMs);
      const screenshotPng = await page.screenshotPage(input.fullPage);
      const metadata = await this.createMetadata(page, {
        captureId: input.captureId,
        kind: 'page',
        sourceUrl: input.url,
        capturedAtIso: this.clock.nowIso(),
        viewport: input.viewport,
        fullPage: input.fullPage,
        byteLength: screenshotPng.byteLength,
      });

      this.logger.info('Completed visual page capture.', {
        captureId: input.captureId,
        byteLength: screenshotPng.byteLength,
      });

      return {
        screenshotPng,
        metadata,
      };
    } finally {
      await page.close();
    }
  }

  async captureRegion(input: CaptureRegionRequest): Promise<VisualCaptureResult> {
    validateCaptureRequest(input.captureId, input.url, input.timeoutMs);
    this.logger.info('Starting visual region capture.', {
      captureId: input.captureId,
      url: input.url,
    });

    const page = await this.browserFactory.openPage({
      viewport: input.viewport,
    });

    try {
      await page.goto(input.url, input.timeoutMs);
      const screenshotPng = await page.screenshotRegion(input.region);
      const metadata = await this.createMetadata(page, {
        captureId: input.captureId,
        kind: 'region',
        sourceUrl: input.url,
        capturedAtIso: this.clock.nowIso(),
        viewport: input.viewport,
        fullPage: false,
        byteLength: screenshotPng.byteLength,
        region: input.region,
      });

      this.logger.info('Completed visual region capture.', {
        captureId: input.captureId,
        byteLength: screenshotPng.byteLength,
      });

      return {
        screenshotPng,
        metadata,
      };
    } finally {
      await page.close();
    }
  }

  private async createMetadata(
    page: VisualBrowserPage,
    input: Omit<VisualCaptureMetadata, 'finalUrl' | 'mimeType' | 'title'>,
  ): Promise<VisualCaptureMetadata> {
    return {
      ...input,
      finalUrl: page.currentUrl(),
      mimeType: 'image/png',
      title: await page.title(),
    };
  }
}

function validateCaptureRequest(captureId: string, url: string, timeoutMs: number): void {
  if (captureId.trim().length === 0) {
    throw new InvalidVisualCaptureRequestError('captureId cannot be blank.');
  }

  validateUrl(url);

  if (!Number.isFinite(timeoutMs)) {
    throw new InvalidVisualCaptureRequestError('timeoutMs must be a finite number.');
  }

  if (timeoutMs <= 0) {
    throw new InvalidVisualCaptureRequestError('timeoutMs must be greater than zero.');
  }
}

function validateUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new InvalidVisualCaptureRequestError('url must be absolute and valid.');
  }
}
