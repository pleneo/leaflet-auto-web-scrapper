import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { Logger, LogContext } from '../../../application/ports/logger';
import type {
  VisualActionTarget,
  VisualDatasetPage,
  VisualDatasetPageSnapshot,
} from '../../../application/ports/visual-dataset-page';
import type { CaptureVisualDatasetSampleInput } from '../../../application/services/visual-dataset-capture-service';
import { createPixelBoundingBox } from '../../../domain/dataset/bounding-box';
import type { VisualDatasetSample } from '../../../domain/dataset/visual-dataset-sample';
import {
  AngeloniLeafletExtractionError,
  AngeloniLeafletExtractor,
  type ExtractAngeloniLeafletsInput,
} from './angeloni-leaflet-extractor';
import type {
  AngeloniLeafletLink,
  AngeloniLeafletPage,
  AngeloniLeafletPageFactory,
  AngeloniLeafletVisualTarget,
  OpenAngeloniLeafletPageInput,
} from './angeloni-leaflet-page';
import type { AngeloniMonitoredRegion } from './angeloni-targets';

describe('AngeloniLeafletExtractor', () => {
  it('navigates from home, captures visual samples, and extracts PDF links', async () => {
    const page = new FakeAngeloniPage({
      links: [
        {
          title: 'Semanal Angeloni',
          cardIndex: 0,
          pdfUrl: 'https://statics.angeloni.com.br/encartes/semanal.pdf',
        },
      ],
    });
    const visualDataset = new FakeVisualDatasetCaptureService();
    const extractor = createExtractor(new FakePageFactory([page]), visualDataset);

    const result = await extractor.extract({
      ...createInput(),
      visualDataset: {
        runId: 'run-1',
        split: 'train',
      },
    });

    expect(result).toEqual({
      source: 'angeloni-playwright',
      extractedAtIso: '2026-08-12T12:00:00.000Z',
      regions: [
        {
          region: createRegion(),
          sourceUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
          leaflets: [
            {
              leafletId: 'regiao-florianopolis-01-semanal-angeloni',
              title: 'Semanal Angeloni',
              cardIndex: 0,
              pdfUrl: 'https://statics.angeloni.com.br/encartes/semanal.pdf',
            },
          ],
        },
      ],
      failedRegions: [],
    });
    expect(page.actions).toEqual([
      'goto:https://encartes.angeloni.com.br/',
      'wait:10',
      'dismiss-cookie',
      'region-target',
      'open-region:regiao-florianopolis',
      'wait-region:regiao-florianopolis',
      'wait:10',
      'discover-links',
      'leaflet-target:0',
      'resolve-pdf:0',
      'close',
    ]);
    expect(visualDataset.inputs.map((input) => input.label)).toEqual([
      'select_region_button',
      'open_pdf_link',
    ]);
  });

  it('extracts without visual dataset capture when capture input is disabled', async () => {
    const page = new FakeAngeloniPage();
    const visualDataset = new FakeVisualDatasetCaptureService();
    const extractor = createExtractor(new FakePageFactory([page]), visualDataset);

    const result = await extractor.extract(createInput());

    expect(result.regions[0]?.leaflets).toEqual([]);
    expect(result.failedRegions).toEqual([]);
    expect(visualDataset.inputs).toEqual([]);
  });

  it('retries failed regions and records final failure without stopping later regions', async () => {
    const failingPage = new FakeAngeloniPage({
      failOnOpenRegion: true,
    });
    const successfulPage = new FakeAngeloniPage();
    const extractor = createExtractor(new FakePageFactory([failingPage, successfulPage]));

    const result = await extractor.extract({
      ...createInput(),
      maxRegionAttempts: 1,
      regions: [createRegion(), createRegion()],
    });

    expect(result.regions).toHaveLength(1);
    expect(result.failedRegions).toEqual([
      {
        region: createRegion(),
        sourceUrl: 'https://encartes.angeloni.com.br/',
        errorMessage: 'Region link failed.',
      },
    ]);
    expect(failingPage.actions.at(-1)).toBe('close');
    expect(successfulPage.actions).toContain('discover-links');
  });

  it('fails a region when a leaflet link does not expose a PDF URL', async () => {
    const page = new FakeAngeloniPage({
      links: [
        {
          title: 'Broken',
          cardIndex: 0,
          pdfUrl: '',
        },
      ],
    });
    const extractor = createExtractor(new FakePageFactory([page]));

    const result = await extractor.extract(createInput());

    expect(result.failedRegions[0]?.errorMessage).toBe(
      'Angeloni leaflet link 0 did not expose a PDF URL.',
    );
  });

  it('validates required input values', async () => {
    const extractor = createExtractor(new FakePageFactory([new FakeAngeloniPage()]));

    await expect(extractor.extract({ ...createInput(), homeUrl: 'invalid' })).rejects.toThrow(
      AngeloniLeafletExtractionError,
    );
    await expect(extractor.extract({ ...createInput(), timeoutMs: 0 })).rejects.toThrow(
      'timeoutMs must be a positive integer.',
    );
    await expect(extractor.extract({ ...createInput(), regionTimeoutMs: 0 })).rejects.toThrow(
      'regionTimeoutMs must be a positive integer.',
    );
    await expect(extractor.extract({ ...createInput(), maxRegionAttempts: 0 })).rejects.toThrow(
      'maxRegionAttempts must be a positive integer.',
    );
    await expect(extractor.extract({ ...createInput(), settleDelayMs: -1 })).rejects.toThrow(
      'settleDelayMs must be a non-negative integer.',
    );
    await expect(extractor.extract({ ...createInput(), regions: [] })).rejects.toThrow(
      'regions cannot be empty.',
    );
  });
});

interface FakeAngeloniPageConfig {
  readonly links?: readonly AngeloniLeafletLink[];
  readonly failOnOpenRegion?: boolean;
}

class FakeAngeloniPage implements AngeloniLeafletPage {
  readonly actions: string[] = [];

  private readonly links: readonly AngeloniLeafletLink[];

  private readonly failOnOpenRegion: boolean;

  constructor(config: FakeAngeloniPageConfig = {}) {
    this.links = config.links ?? [];
    this.failOnOpenRegion = config.failOnOpenRegion ?? false;
  }

  goto(url: string): Promise<void> {
    this.actions.push(`goto:${url}`);
    return Promise.resolve();
  }

  waitForTimeout(timeoutMs: number): Promise<void> {
    this.actions.push(`wait:${String(timeoutMs)}`);
    return Promise.resolve();
  }

  dismissCookieBanner(): Promise<void> {
    this.actions.push('dismiss-cookie');
    return Promise.resolve();
  }

  getRegionLinkVisualTarget(): Promise<AngeloniLeafletVisualTarget> {
    this.actions.push('region-target');
    return Promise.resolve(createVisualTarget('region'));
  }

  openRegion(region: AngeloniMonitoredRegion): Promise<void> {
    this.actions.push(`open-region:${region.regionSlug}`);

    if (this.failOnOpenRegion) {
      return Promise.reject(new Error('Region link failed.'));
    }

    return Promise.resolve();
  }

  waitForRegionLeaflets(region: AngeloniMonitoredRegion): Promise<void> {
    this.actions.push(`wait-region:${region.regionSlug}`);
    return Promise.resolve();
  }

  discoverLeafletLinks(): Promise<readonly AngeloniLeafletLink[]> {
    this.actions.push('discover-links');
    return Promise.resolve(this.links);
  }

  getLeafletLinkVisualTarget(cardIndex: number): Promise<AngeloniLeafletVisualTarget> {
    this.actions.push(`leaflet-target:${String(cardIndex)}`);
    return Promise.resolve(createVisualTarget(`leaflet-${String(cardIndex)}`));
  }

  resolveLeafletPdfUrl(cardIndex: number): Promise<string> {
    this.actions.push(`resolve-pdf:${String(cardIndex)}`);
    return Promise.resolve(this.links.find((link) => link.cardIndex === cardIndex)?.pdfUrl ?? '');
  }

  close(): Promise<void> {
    this.actions.push('close');
    return Promise.resolve();
  }
}

class FakePageFactory implements AngeloniLeafletPageFactory {
  private readonly pages: readonly AngeloniLeafletPage[];

  private nextPageIndex = 0;

  constructor(pages: readonly AngeloniLeafletPage[]) {
    this.pages = pages;
  }

  openPage(input: OpenAngeloniLeafletPageInput): Promise<AngeloniLeafletPage> {
    void input;
    const page = this.pages[this.nextPageIndex];
    this.nextPageIndex += 1;

    if (page === undefined) {
      throw new Error('Missing fake page.');
    }

    return Promise.resolve(page);
  }
}

class FakeVisualDatasetCaptureService {
  readonly inputs: CaptureVisualDatasetSampleInput[] = [];

  captureBeforeAction(input: CaptureVisualDatasetSampleInput): Promise<VisualDatasetSample> {
    this.inputs.push(input);
    const box = createPixelBoundingBox({
      xMin: 10,
      yMin: 20,
      xMax: 110,
      yMax: 60,
    });

    return Promise.resolve({
      sampleId: input.sampleId,
      runId: input.runId,
      supermarketId: input.supermarketId,
      stateName: input.stateName,
      pageUrl: 'https://encartes.angeloni.com.br/',
      subject: input.subject,
      screenshotPng: new Uint8Array([1]),
      screenshotMetadata: {
        fileName: `${input.sampleId}.png`,
        mimeType: 'image/png',
        fullPage: true,
        viewport: {
          width: 1280,
          height: 720,
        },
        documentWidth: 1280,
        documentHeight: 1200,
        scrollPosition: {
          scrollX: 0,
          scrollY: 0,
        },
        capturedAtIso: '2026-08-12T12:00:00.000Z',
      },
      target: {
        label: input.label,
        viewportBox: box,
        documentBox: box,
        normalizedDocumentBox: {
          xCenter: 0.046875,
          yCenter: 0.03333333333333333,
          width: 0.078125,
          height: 0.03333333333333333,
        },
      },
      split: input.split,
    });
  }
}

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-08-12T12:00:00.000Z';
  }
}

class NullLogger implements Logger {
  debug(message: string, context?: LogContext): void {
    void message;
    void context;
  }

  info(message: string, context?: LogContext): void {
    void message;
    void context;
  }

  warn(message: string, context?: LogContext): void {
    void message;
    void context;
  }

  error(message: string, context?: LogContext): void {
    void message;
    void context;
  }
}

class FakeVisualDatasetPage implements VisualDatasetPage {
  captureFullPageSnapshot(): Promise<VisualDatasetPageSnapshot> {
    return Promise.resolve({
      pageUrl: 'https://encartes.angeloni.com.br/',
      screenshotPng: new Uint8Array([1]),
      viewport: {
        width: 1280,
        height: 720,
      },
      documentSize: {
        width: 1280,
        height: 1200,
      },
      scrollPosition: {
        scrollX: 0,
        scrollY: 0,
      },
    });
  }
}

class FakeVisualActionTarget implements VisualActionTarget {
  readonly locatorDescription: string;

  constructor(locatorDescription: string) {
    this.locatorDescription = locatorDescription;
  }

  scrollIntoView(): Promise<void> {
    return Promise.resolve();
  }

  isVisible(): Promise<boolean> {
    return Promise.resolve(true);
  }

  isEnabled(): Promise<boolean> {
    return Promise.resolve(true);
  }

  getViewportBoundingBox(): Promise<ReturnType<typeof createPixelBoundingBox>> {
    return Promise.resolve(
      createPixelBoundingBox({
        xMin: 10,
        yMin: 20,
        xMax: 110,
        yMax: 60,
      }),
    );
  }
}

function createExtractor(
  pageFactory: AngeloniLeafletPageFactory,
  visualDatasetCaptureService?: FakeVisualDatasetCaptureService,
): AngeloniLeafletExtractor {
  return new AngeloniLeafletExtractor(
    pageFactory,
    new FixedClock(),
    new NullLogger(),
    visualDatasetCaptureService,
  );
}

function createInput(): ExtractAngeloniLeafletsInput {
  return {
    homeUrl: 'https://encartes.angeloni.com.br/',
    regions: [createRegion()],
    viewport: {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
    },
    timeoutMs: 30_000,
    regionTimeoutMs: 30_000,
    maxRegionAttempts: 1,
    settleDelayMs: 10,
  };
}

function createRegion(): AngeloniMonitoredRegion {
  return {
    regionSlug: 'regiao-florianopolis',
    regionName: 'Florianópolis',
    stateCode: 'SC',
    cityName: 'Florianópolis',
    homeUrl: 'https://encartes.angeloni.com.br/',
    regionUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
  };
}

function createVisualTarget(locatorDescription: string): AngeloniLeafletVisualTarget {
  return {
    page: new FakeVisualDatasetPage(),
    target: new FakeVisualActionTarget(locatorDescription),
  };
}
