import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  CaptureVisualDatasetSampleInput,
  VisualDatasetCaptureService,
} from '../../../application/services/visual-dataset-capture-service';
import type { DatasetSplit } from '../../../domain/dataset/dataset-split';
import type { VisualViewport } from '../../../domain/visual/viewport';
import { filterTausteOfferPublications } from './tauste-api-client';
import type {
  ExtractedTaustePdfLeaflet,
  TausteExtractedUnit,
  TausteFailedPublication,
  TaustePublication,
} from './tauste-pdf-leaflet';
import type {
  TausteLeafletPage,
  TausteLeafletPageFactory,
  TausteLeafletVisualTarget,
} from './tauste-leaflet-page';
import {
  TAUSTE_FLIPSNACK_PROFILE_URL,
  TAUSTE_UNIT_ID,
  TAUSTE_UNIT_NAME,
  type TausteStartUrlMode,
} from './tauste-targets';

export interface ExtractTausteLeafletsInput {
  readonly startUrlMode: TausteStartUrlMode;
  readonly institutionalHomeUrl?: string;
  readonly institutionalOffersUrl?: string;
  readonly profileUrl: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly settleDelayMs: number;
  readonly visualDataset?: ExtractTausteVisualDatasetInput;
}

export interface ExtractTausteVisualDatasetInput {
  readonly runId: string;
  readonly split: DatasetSplit;
}

export interface TausteLeafletExtractionResult {
  readonly source: 'tauste-playwright-direct';
  readonly extractedAtIso: string;
  readonly units: readonly TausteExtractedUnit[];
  readonly failedPublications: readonly TausteFailedPublication[];
}

interface TausteVisualDatasetCaptureService {
  captureBeforeAction(
    input: CaptureVisualDatasetSampleInput,
  ): ReturnType<VisualDatasetCaptureService['captureBeforeAction']>;
}

export class TausteLeafletExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TausteLeafletExtractionError';
  }
}

export class TausteLeafletExtractor {
  private readonly pageFactory: TausteLeafletPageFactory;

  private readonly clock: Clock;

  private readonly logger: Logger;

  private readonly visualDatasetCaptureService: TausteVisualDatasetCaptureService | undefined;

  constructor(
    pageFactory: TausteLeafletPageFactory,
    clock: Clock,
    logger: Logger,
    visualDatasetCaptureService?: TausteVisualDatasetCaptureService,
  ) {
    this.pageFactory = pageFactory;
    this.clock = clock;
    this.logger = logger;
    this.visualDatasetCaptureService = visualDatasetCaptureService;
  }

  async extract(input: ExtractTausteLeafletsInput): Promise<TausteLeafletExtractionResult> {
    validateInput(input);
    const page = await this.pageFactory.openPage({
      viewport: input.viewport,
      timeoutMs: input.timeoutMs,
    });
    const leaflets: ExtractedTaustePdfLeaflet[] = [];
    const failedPublications: TausteFailedPublication[] = [];

    try {
      let publications: readonly TaustePublication[];

      try {
        await this.navigateToFlipsnackProfile(page, input);
        publications = filterTausteOfferPublications(await page.listPublicationCards());
      } catch (error) {
        return {
          source: 'tauste-playwright-direct',
          extractedAtIso: this.clock.nowIso(),
          units: [],
          failedPublications: [
            {
              publicationId: 'tauste:flipsnack-profile',
              title: 'Tauste Flipsnack profile',
              sourceUrl: input.profileUrl,
              errorMessage: (error as Error).message,
            },
          ],
        };
      }

      if (publications.length === 0) {
        return {
          source: 'tauste-playwright-direct',
          extractedAtIso: this.clock.nowIso(),
          units: [],
          failedPublications: [
            {
              publicationId: 'tauste:flipsnack-profile',
              title: 'Tauste Flipsnack profile',
              sourceUrl: input.profileUrl,
              errorMessage: `Tauste Flipsnack profile did not expose offer publications: ${input.profileUrl}`,
            },
          ],
        };
      }

      for (const [cardIndex, publication] of publications.entries()) {
        try {
          leaflets.push(await this.extractPublication(page, input, publication, cardIndex));
        } catch (error) {
          failedPublications.push({
            publicationId: publication.publicationId,
            title: publication.title,
            sourceUrl: publication.publicationUrl,
            errorMessage: (error as Error).message,
          });
        }
      }

      return {
        source: 'tauste-playwright-direct',
        extractedAtIso: this.clock.nowIso(),
        units:
          leaflets.length === 0
            ? []
            : [
                {
                  unitId: TAUSTE_UNIT_ID,
                  unitName: TAUSTE_UNIT_NAME,
                  sourceUrl: input.profileUrl,
                  leaflets,
                },
              ],
        failedPublications,
      };
    } finally {
      await page.close();
    }
  }

  private async navigateToFlipsnackProfile(
    page: TausteLeafletPage,
    input: ExtractTausteLeafletsInput,
  ): Promise<void> {
    if (input.startUrlMode !== 'flipsnack-profile') {
      throw new TausteLeafletExtractionError(
        `Unsupported Tauste startUrlMode in direct extractor: ${input.startUrlMode}`,
      );
    }

    this.logger.info('Tauste FSM state entered.', {
      stateName: 'LEAFLETS_PAGE',
      sourceUrl: input.profileUrl,
    });
    await page.goto(input.profileUrl);
    await page.waitForFlipsnackProfilePage();
    await page.waitForTimeout(input.settleDelayMs);
  }

  private async extractPublication(
    page: TausteLeafletPage,
    input: ExtractTausteLeafletsInput,
    publication: TaustePublication,
    cardIndex: number,
  ): Promise<ExtractedTaustePdfLeaflet> {
    await this.capturePublicationCardTarget(page, input, publication, cardIndex);
    const publicationPage = await page.openPublication(cardIndex);

    try {
      await publicationPage.waitForPublicationPlayer();
      await page.waitForTimeout(input.settleDelayMs);
      this.logger.info('Tauste FSM state entered.', {
        stateName: 'PDF_DOWNLOAD',
        publicationId: publication.publicationId,
      });
      const pdfUrl = await publicationPage.resolvePdfDownloadUrl();

      if (pdfUrl.trim().length === 0) {
        throw new TausteLeafletExtractionError(
          `Tauste publication did not expose a PDF download URL: ${publication.publicationUrl}`,
        );
      }

      await this.capturePdfDownloadTarget(publicationPage, input, publication, pdfUrl);

      return {
        leafletId: publication.publicationId,
        title: publication.title,
        publicationUrl: await publicationPage.getCurrentUrl(),
        coverImageUrl: publication.coverImageUrl,
        publishedAtIso: publication.publishedAtIso,
        pdfUrl,
      };
    } finally {
      await publicationPage.close();
    }
  }

  private async capturePublicationCardTarget(
    page: TausteLeafletPage,
    input: ExtractTausteLeafletsInput,
    publication: TaustePublication,
    cardIndex: number,
  ): Promise<void> {
    const visualTarget = await page.getPublicationCardVisualTarget(cardIndex);
    await this.captureBeforeAction(input, visualTarget, {
      sampleId: createSampleId(
        input.visualDataset?.runId ?? 'tauste',
        `${publication.publicationId}-card`,
      ),
      stateName: 'LEAFLETS_PAGE',
      label: 'open_leaflet_modal_button',
      subject: {
        subjectKind: 'tauste-publication-card',
        publicationId: publication.publicationId,
        publicationTitle: publication.title,
        publicationUrl: publication.publicationUrl,
        publishedAtIso: publication.publishedAtIso,
        coverImageUrl: publication.coverImageUrl,
      },
    });
  }

  private async capturePdfDownloadTarget(
    page: { getPdfDownloadVisualTarget(): Promise<TausteLeafletVisualTarget> },
    input: ExtractTausteLeafletsInput,
    publication: TaustePublication,
    pdfUrl: string,
  ): Promise<void> {
    const visualTarget = await page.getPdfDownloadVisualTarget();
    await this.captureBeforeAction(input, visualTarget, {
      sampleId: createSampleId(
        input.visualDataset?.runId ?? 'tauste',
        `${publication.publicationId}-download-pdf`,
      ),
      stateName: 'PDF_DOWNLOAD',
      label: 'download_pdf_button',
      subject: {
        subjectKind: 'tauste-pdf-download',
        publicationId: publication.publicationId,
        publicationTitle: publication.title,
        publicationUrl: publication.publicationUrl,
        pdfUrl,
      },
    });
  }

  private async captureBeforeAction(
    input: ExtractTausteLeafletsInput,
    visualTarget: TausteLeafletVisualTarget,
    capture: Omit<
      CaptureVisualDatasetSampleInput,
      'runId' | 'supermarketId' | 'split' | 'page' | 'target'
    >,
  ): Promise<void> {
    if (this.visualDatasetCaptureService === undefined || input.visualDataset === undefined) {
      return;
    }

    await this.visualDatasetCaptureService.captureBeforeAction({
      ...capture,
      runId: input.visualDataset.runId,
      supermarketId: 'tauste',
      split: input.visualDataset.split,
      page: visualTarget.page,
      target: visualTarget.target,
    });
  }
}

export function createDefaultTausteLeafletExtractionInput(
  viewport: VisualViewport,
  timeoutMs: number,
  settleDelayMs: number,
): ExtractTausteLeafletsInput {
  return {
    startUrlMode: 'flipsnack-profile',
    profileUrl: TAUSTE_FLIPSNACK_PROFILE_URL,
    viewport,
    timeoutMs,
    settleDelayMs,
  };
}

function validateInput(input: ExtractTausteLeafletsInput): void {
  if (input.profileUrl.trim().length === 0) {
    throw new TausteLeafletExtractionError('profileUrl cannot be blank.');
  }

  if (input.timeoutMs <= 0) {
    throw new TausteLeafletExtractionError('timeoutMs must be positive.');
  }
}

function createSampleId(runId: string, value: string): string {
  return `${runId}-${value}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
