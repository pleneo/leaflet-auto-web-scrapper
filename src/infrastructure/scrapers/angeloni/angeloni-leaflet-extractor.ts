import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  CaptureVisualDatasetSampleInput,
  VisualDatasetCaptureService,
} from '../../../application/services/visual-dataset-capture-service';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { VisualViewport } from '../../../domain/visual/viewport';
import type {
  AngeloniLeafletLink,
  AngeloniLeafletPage,
  AngeloniLeafletPageFactory,
} from './angeloni-leaflet-page';
import type {
  AngeloniExtractedRegion,
  AngeloniFailedRegion,
  ExtractedAngeloniPdfLeaflet,
} from './angeloni-pdf-leaflet';
import type { AngeloniMonitoredRegion } from './angeloni-targets';

export interface ExtractAngeloniLeafletsInput {
  readonly homeUrl: string;
  readonly regions: readonly AngeloniMonitoredRegion[];
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly regionTimeoutMs: number;
  readonly maxRegionAttempts: number;
  readonly settleDelayMs: number;
  readonly visualDataset?: ExtractAngeloniVisualDatasetInput;
}

export interface ExtractAngeloniVisualDatasetInput {
  readonly runId: string;
  readonly split: DatasetSplit;
}

export interface AngeloniLeafletExtractionResult {
  readonly source: 'angeloni-playwright';
  readonly extractedAtIso: string;
  readonly regions: readonly AngeloniExtractedRegion[];
  readonly failedRegions: readonly AngeloniFailedRegion[];
}

interface AngeloniVisualDatasetCaptureService {
  captureBeforeAction(
    input: CaptureVisualDatasetSampleInput,
  ): ReturnType<VisualDatasetCaptureService['captureBeforeAction']>;
}

export class AngeloniLeafletExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AngeloniLeafletExtractionError';
  }
}

export class AngeloniLeafletExtractor {
  private readonly pageFactory: AngeloniLeafletPageFactory;

  private readonly clock: Clock;

  private readonly logger: Logger;

  private readonly visualDatasetCaptureService: AngeloniVisualDatasetCaptureService | undefined;

  constructor(
    pageFactory: AngeloniLeafletPageFactory,
    clock: Clock,
    logger: Logger,
    visualDatasetCaptureService?: AngeloniVisualDatasetCaptureService,
  ) {
    this.pageFactory = pageFactory;
    this.clock = clock;
    this.logger = logger;
    this.visualDatasetCaptureService = visualDatasetCaptureService;
  }

  async extract(input: ExtractAngeloniLeafletsInput): Promise<AngeloniLeafletExtractionResult> {
    validateInput(input);

    const extractedRegions: AngeloniExtractedRegion[] = [];
    const failedRegions: AngeloniFailedRegion[] = [];

    for (const region of input.regions) {
      this.logger.info('Starting Angeloni PDF leaflet extraction.', {
        regionSlug: region.regionSlug,
        regionName: region.regionName,
      });

      const result = await this.extractRegionWithRetry(input, region);

      if (result.status === 'failed') {
        failedRegions.push({
          region,
          sourceUrl: input.homeUrl,
          errorMessage: result.errorMessage,
        });
        continue;
      }

      if (result.leaflets.length === 0) {
        this.logger.info('No Angeloni leaflets found for region.', {
          regionSlug: region.regionSlug,
          regionName: region.regionName,
          attempts: result.attempts,
        });
      }

      extractedRegions.push({
        region,
        sourceUrl: result.sourceUrl,
        leaflets: result.leaflets,
      });
    }

    return {
      source: 'angeloni-playwright',
      extractedAtIso: this.clock.nowIso(),
      regions: extractedRegions,
      failedRegions,
    };
  }

  private async extractRegionWithRetry(
    input: ExtractAngeloniLeafletsInput,
    region: AngeloniMonitoredRegion,
  ): Promise<
    | {
        readonly status: 'succeeded';
        readonly attempts: number;
        readonly sourceUrl: string;
        readonly leaflets: readonly ExtractedAngeloniPdfLeaflet[];
      }
    | {
        readonly status: 'failed';
        readonly errorMessage: string;
      }
  > {
    let lastErrorMessage = 'Unknown Angeloni region extraction failure.';

    for (let attempt = 1; attempt <= input.maxRegionAttempts; attempt += 1) {
      try {
        const output = await withTimeout(
          this.extractRegion(input, region),
          input.regionTimeoutMs,
          `Angeloni region ${region.regionSlug} extraction timed out.`,
        );

        return {
          ...output,
          attempts: attempt,
        };
      } catch (error) {
        lastErrorMessage =
          error instanceof Error ? error.message : 'Unexpected Angeloni region extraction failure.';
        this.logger.warn('Angeloni region extraction attempt failed.', {
          regionSlug: region.regionSlug,
          regionName: region.regionName,
          attempt,
          errorMessage: lastErrorMessage,
        });
      }
    }

    return {
      status: 'failed',
      errorMessage: lastErrorMessage,
    };
  }

  private async extractRegion(
    input: ExtractAngeloniLeafletsInput,
    region: AngeloniMonitoredRegion,
  ): Promise<{
    readonly status: 'succeeded';
    readonly sourceUrl: string;
    readonly leaflets: readonly ExtractedAngeloniPdfLeaflet[];
  }> {
    const page = await this.pageFactory.openPage({
      viewport: input.viewport,
      timeoutMs: input.timeoutMs,
    });

    try {
      await page.goto(input.homeUrl);
      await page.waitForTimeout(input.settleDelayMs);
      await page.dismissCookieBanner();
      await this.captureRegionSelectionIfEnabled(page, input, region);
      await page.openRegion(region);
      await page.waitForRegionLeaflets(region);
      await page.waitForTimeout(input.settleDelayMs);

      const links = await page.discoverLeafletLinks();
      const leaflets: ExtractedAngeloniPdfLeaflet[] = [];

      for (const link of links) {
        await this.captureLeafletLinkIfEnabled(page, input, region, link);
        const pdfUrl = await page.resolveLeafletPdfUrl(link.cardIndex);

        if (pdfUrl.trim().length === 0) {
          throw new AngeloniLeafletExtractionError(
            `Angeloni leaflet link ${String(link.cardIndex)} did not expose a PDF URL.`,
          );
        }

        leaflets.push({
          leafletId: createAngeloniLeafletId(region, link),
          title: link.title,
          cardIndex: link.cardIndex,
          pdfUrl,
        });
      }

      return {
        status: 'succeeded',
        sourceUrl: region.regionUrl,
        leaflets,
      };
    } finally {
      await page.close();
    }
  }

  private async captureRegionSelectionIfEnabled(
    page: AngeloniLeafletPage,
    input: ExtractAngeloniLeafletsInput,
    region: AngeloniMonitoredRegion,
  ): Promise<void> {
    if (input.visualDataset === undefined || this.visualDatasetCaptureService === undefined) {
      return;
    }

    const visualTarget = await page.getRegionLinkVisualTarget(region);

    await this.visualDatasetCaptureService.captureBeforeAction({
      sampleId: `${input.visualDataset.runId}-${region.regionSlug}-select-region`,
      runId: input.visualDataset.runId,
      supermarketId: 'angeloni',
      stateName: 'ANCHOR_PAGE',
      label: 'select_region_button',
      subject: {
        subjectKind: 'angeloni-region-selection',
        regionSlug: region.regionSlug,
        regionName: region.regionName,
        stateCode: region.stateCode,
        cityName: region.cityName,
      },
      split: input.visualDataset.split,
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }

  private async captureLeafletLinkIfEnabled(
    page: AngeloniLeafletPage,
    input: ExtractAngeloniLeafletsInput,
    region: AngeloniMonitoredRegion,
    link: AngeloniLeafletLink,
  ): Promise<void> {
    if (input.visualDataset === undefined || this.visualDatasetCaptureService === undefined) {
      return;
    }

    const visualTarget = await page.getLeafletLinkVisualTarget(link.cardIndex);

    await this.visualDatasetCaptureService.captureBeforeAction({
      sampleId: `${input.visualDataset.runId}-${createAngeloniLeafletId(region, link)}-open-pdf`,
      runId: input.visualDataset.runId,
      supermarketId: 'angeloni',
      stateName: 'LEAFLETS_PAGE',
      label: 'open_pdf_link',
      subject: {
        subjectKind: 'angeloni-leaflet-link',
        regionSlug: region.regionSlug,
        regionName: region.regionName,
        stateCode: region.stateCode,
        cityName: region.cityName,
        cardIndex: link.cardIndex,
        leafletTitle: link.title,
      },
      split: input.visualDataset.split,
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }
}

function validateInput(input: ExtractAngeloniLeafletsInput): void {
  validateUrl(input.homeUrl);
  validatePositiveInteger(input.timeoutMs, 'timeoutMs');
  validatePositiveInteger(input.regionTimeoutMs, 'regionTimeoutMs');
  validatePositiveInteger(input.maxRegionAttempts, 'maxRegionAttempts');

  if (!Number.isInteger(input.settleDelayMs) || input.settleDelayMs < 0) {
    throw new AngeloniLeafletExtractionError('settleDelayMs must be a non-negative integer.');
  }

  if (input.regions.length === 0) {
    throw new AngeloniLeafletExtractionError('regions cannot be empty.');
  }
}

function validateUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new AngeloniLeafletExtractionError('homeUrl must be absolute and valid.');
  }
}

function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AngeloniLeafletExtractionError(`${fieldName} must be a positive integer.`);
  }
}

function createAngeloniLeafletId(
  region: AngeloniMonitoredRegion,
  link: AngeloniLeafletLink,
): string {
  return `${region.regionSlug}-${String(link.cardIndex + 1).padStart(2, '0')}-${slugify(
    link.title,
  )}`;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : 'leaflet';
}

function withTimeout<TValue>(
  promise: Promise<TValue>,
  timeoutMs: number,
  message: string,
): Promise<TValue> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new AngeloniLeafletExtractionError(message));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timeout);
      });
  });
}
