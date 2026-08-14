import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type { CaptureVisualDatasetSampleInput } from '../../../application/services/visual-dataset-capture-service';
import { createVisualViewport } from '../../../domain/visual/viewport';
import type { TaustePublication } from './tauste-pdf-leaflet';
import {
  TausteLeafletExtractionError,
  TausteLeafletExtractor,
  createDefaultTausteLeafletExtractionInput,
  type ExtractTausteLeafletsInput,
} from './tauste-leaflet-extractor';
import type {
  TausteLeafletPage,
  TausteLeafletPageFactory,
  TausteLeafletVisualTarget,
  TausteOpenedPublicationPage,
} from './tauste-leaflet-page';
import type { VisualDatasetSample } from '../../../domain/dataset/visual-dataset-sample';

describe('TausteLeafletExtractor', () => {
  it('extracts direct Flipsnack PDF leaflets and captures visual targets', async () => {
    const page = new FakeTausteLeafletPage([
      createPublication('tauste:ofertas-tauste-bauru', 'Ofertas Tauste Bauru'),
    ]);
    const captureService = new FakeCaptureService();
    const extractor = new TausteLeafletExtractor(
      new FakePageFactory(page),
      new FixedClock(),
      new NullLogger(),
      captureService,
    );

    await expect(extractor.extract(createInput())).resolves.toEqual({
      source: 'tauste-playwright-direct',
      extractedAtIso: '2026-08-13T10:00:00.000Z',
      units: [
        {
          unitId: 'tauste-supermercados',
          unitName: 'Tauste Supermercados',
          sourceUrl: 'https://www.flipsnack.com/taustesupermercado/',
          leaflets: [
            {
              leafletId: 'tauste:ofertas-tauste-bauru',
              title: 'Ofertas Tauste Bauru',
              publicationUrl:
                'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-bauru.html',
              coverImageUrl: 'https://cdn.example.com/cover.jpg',
              publishedAtIso: '2026-08-11T09:00:03.000Z',
              pdfUrl: 'https://cdn.example.com/ofertas-tauste-bauru.pdf',
            },
          ],
        },
      ],
      failedPublications: [],
    });
    expect(page.actions).toEqual([
      'goto:https://www.flipsnack.com/taustesupermercado/',
      'wait-profile',
      'wait:1000',
      'target:card:0',
      'open:0',
      'wait-player',
      'wait:1000',
      'resolve-pdf',
      'target:download',
      'close-publication',
      'close-page',
    ]);
    expect(captureService.inputs.map((input) => [input.stateName, input.label])).toEqual([
      ['LEAFLETS_PAGE', 'open_leaflet_modal_button'],
      ['PDF_DOWNLOAD', 'download_pdf_button'],
    ]);
  });

  it('records failed publications and profile failures without stopping cleanup', async () => {
    const page = new FakeTausteLeafletPage([
      createPublication('tauste:ofertas-tauste-marilia', 'Ofertas Tauste Marília'),
    ]);
    page.pdfUrl = '';
    const extractor = new TausteLeafletExtractor(
      new FakePageFactory(page),
      new FixedClock(),
      new NullLogger(),
    );

    const result = await extractor.extract(createInputWithoutVisualDataset());

    expect(result.units).toEqual([]);
    expect(result.failedPublications).toEqual([
      {
        publicationId: 'tauste:ofertas-tauste-marilia',
        title: 'Ofertas Tauste Marília',
        sourceUrl: 'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-marilia.html',
        errorMessage:
          'Tauste publication did not expose a PDF download URL: https://www.flipsnack.com/taustesupermercado/ofertas-tauste-marilia.html',
      },
    ]);
    expect(page.actions.includes('close-page')).toBe(true);

    const emptyPage = new FakeTausteLeafletPage([]);
    await expect(
      new TausteLeafletExtractor(
        new FakePageFactory(emptyPage),
        new FixedClock(),
        new NullLogger(),
      ).extract(createInput()),
    ).resolves.toMatchObject({
      units: [],
      failedPublications: [
        {
          publicationId: 'tauste:flipsnack-profile',
        },
      ],
    });
  });

  it('extracts direct PDF leaflets without visual dataset configuration', async () => {
    const page = new FakeTausteLeafletPage([
      createPublication('tauste:ofertas-tauste-bauru', 'Ofertas Tauste Bauru'),
    ]);
    const extractor = new TausteLeafletExtractor(
      new FakePageFactory(page),
      new FixedClock(),
      new NullLogger(),
    );

    await expect(extractor.extract(createInputWithoutVisualDataset())).resolves.toMatchObject({
      units: [
        {
          leaflets: [
            {
              pdfUrl: 'https://cdn.example.com/ofertas-tauste-bauru.pdf',
            },
          ],
        },
      ],
      failedPublications: [],
    });
  });

  it('rejects invalid direct extraction input', async () => {
    const extractor = new TausteLeafletExtractor(
      new FakePageFactory(new FakeTausteLeafletPage([])),
      new FixedClock(),
      new NullLogger(),
    );

    await expect(
      extractor.extract({
        ...createInput(),
        startUrlMode: 'institutional-home',
      }),
    ).resolves.toMatchObject({
      failedPublications: [
        {
          errorMessage: 'Unsupported Tauste startUrlMode in direct extractor: institutional-home',
        },
      ],
    });
    await expect(
      extractor.extract({
        ...createInput(),
        profileUrl: ' ',
      }),
    ).rejects.toThrow(TausteLeafletExtractionError);
    await expect(
      extractor.extract({
        ...createInput(),
        timeoutMs: 0,
      }),
    ).rejects.toThrow('timeoutMs must be positive.');
  });

  it('creates default direct extraction input', () => {
    expect(
      createDefaultTausteLeafletExtractionInput(
        createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
        30_000,
        1_000,
      ),
    ).toMatchObject({
      startUrlMode: 'flipsnack-profile',
      profileUrl: 'https://www.flipsnack.com/taustesupermercado/',
      timeoutMs: 30_000,
      settleDelayMs: 1_000,
    });
  });
});

function createInput(): ExtractTausteLeafletsInput {
  return {
    startUrlMode: 'flipsnack-profile',
    profileUrl: 'https://www.flipsnack.com/taustesupermercado/',
    viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
    timeoutMs: 30_000,
    settleDelayMs: 1_000,
    visualDataset: {
      runId: 'run-1',
      split: 'unassigned',
    },
  };
}

function createInputWithoutVisualDataset(): ExtractTausteLeafletsInput {
  return {
    startUrlMode: 'flipsnack-profile',
    profileUrl: 'https://www.flipsnack.com/taustesupermercado/',
    viewport: createVisualViewport({ width: 1366, height: 768, deviceScaleFactor: 1 }),
    timeoutMs: 30_000,
    settleDelayMs: 1_000,
  };
}

function createPublication(publicationId: string, title: string): TaustePublication {
  const slug = publicationId.replace('tauste:', '');

  return {
    publicationId,
    title,
    directLink: `${slug}.html`,
    publicationUrl: `https://www.flipsnack.com/taustesupermercado/${slug}.html`,
    coverImageUrl: 'https://cdn.example.com/cover.jpg',
    publishedAtIso: '2026-08-11T09:00:03.000Z',
  };
}

class FakePageFactory implements TausteLeafletPageFactory {
  private readonly page: FakeTausteLeafletPage;

  constructor(page: FakeTausteLeafletPage) {
    this.page = page;
  }

  openPage(): Promise<TausteLeafletPage> {
    return Promise.resolve(this.page);
  }
}

class FakeTausteLeafletPage implements TausteLeafletPage {
  readonly actions: string[] = [];

  pdfUrl = 'https://cdn.example.com/ofertas-tauste-bauru.pdf';

  private readonly publications: readonly TaustePublication[];

  constructor(publications: readonly TaustePublication[]) {
    this.publications = publications;
  }

  goto(url: string): Promise<void> {
    this.actions.push(`goto:${url}`);
    return Promise.resolve();
  }

  waitForTimeout(timeoutMs: number): Promise<void> {
    this.actions.push(`wait:${String(timeoutMs)}`);
    return Promise.resolve();
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve('https://www.flipsnack.com/taustesupermercado/');
  }

  waitForInstitutionalHomePage(): Promise<void> {
    this.actions.push('wait-home');
    return Promise.resolve();
  }

  getHeroOffersVisualTarget(): Promise<TausteLeafletVisualTarget> {
    this.actions.push('target:hero');
    return Promise.resolve(createVisualTarget('hero'));
  }

  openHeroOffersPage(): Promise<void> {
    this.actions.push('open-hero');
    return Promise.resolve();
  }

  getFooterOffersVisualTarget(): Promise<TausteLeafletVisualTarget> {
    this.actions.push('target:footer');
    return Promise.resolve(createVisualTarget('footer'));
  }

  openFooterOffersPage(): Promise<void> {
    this.actions.push('open-footer');
    return Promise.resolve();
  }

  waitForFlipsnackProfilePage(): Promise<void> {
    this.actions.push('wait-profile');
    return Promise.resolve();
  }

  listPublicationCards(): Promise<readonly TaustePublication[]> {
    return Promise.resolve(this.publications);
  }

  getPublicationCardVisualTarget(cardIndex: number): Promise<TausteLeafletVisualTarget> {
    this.actions.push(`target:card:${String(cardIndex)}`);
    return Promise.resolve(createVisualTarget(`card:${String(cardIndex)}`));
  }

  openPublication(cardIndex: number): Promise<TausteOpenedPublicationPage> {
    this.actions.push(`open:${String(cardIndex)}`);
    return Promise.resolve(new FakeOpenedPublicationPage(this));
  }

  close(): Promise<void> {
    this.actions.push('close-page');
    return Promise.resolve();
  }
}

class FakeOpenedPublicationPage implements TausteOpenedPublicationPage {
  private readonly parent: FakeTausteLeafletPage;

  constructor(parent: FakeTausteLeafletPage) {
    this.parent = parent;
  }

  waitForPublicationPlayer(): Promise<void> {
    this.parent.actions.push('wait-player');
    return Promise.resolve();
  }

  getPdfDownloadVisualTarget(): Promise<TausteLeafletVisualTarget> {
    this.parent.actions.push('target:download');
    return Promise.resolve(createVisualTarget('download'));
  }

  resolvePdfDownloadUrl(): Promise<string> {
    this.parent.actions.push('resolve-pdf');
    return Promise.resolve(this.parent.pdfUrl);
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(
      'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-bauru.html',
    );
  }

  close(): Promise<void> {
    this.parent.actions.push('close-publication');
    return Promise.resolve();
  }
}

function createVisualTarget(locatorDescription: string): TausteLeafletVisualTarget {
  return {
    page: {
      captureFullPageSnapshot: () => {
        throw new Error('Snapshot should not be captured by fake capture service.');
      },
    },
    target: {
      locatorDescription,
      scrollIntoView: () => Promise.resolve(),
      isVisible: () => Promise.resolve(true),
      isEnabled: () => Promise.resolve(true),
      getViewportBoundingBox: () => Promise.resolve(null),
    },
  };
}

class FakeCaptureService {
  readonly inputs: CaptureVisualDatasetSampleInput[] = [];

  captureBeforeAction(input: CaptureVisualDatasetSampleInput): Promise<VisualDatasetSample> {
    this.inputs.push(input);
    return Promise.resolve({
      sampleId: input.sampleId,
      runId: input.runId,
      supermarketId: input.supermarketId,
      stateName: input.stateName,
      pageUrl: 'https://example.com',
      subject: input.subject,
      screenshotPng: new Uint8Array(),
      screenshotMetadata: {
        fileName: `${input.sampleId}.png`,
        mimeType: 'image/png',
        fullPage: true,
        viewport: {
          width: 1366,
          height: 768,
        },
        documentWidth: 1366,
        documentHeight: 768,
        scrollPosition: {
          scrollX: 0,
          scrollY: 0,
        },
        capturedAtIso: '2026-08-13T10:00:00.000Z',
      },
      target: {
        label: input.label,
        viewportBox: {
          xMin: 1,
          yMin: 1,
          xMax: 2,
          yMax: 2,
          width: 1,
          height: 1,
        },
        documentBox: {
          xMin: 1,
          yMin: 1,
          xMax: 2,
          yMax: 2,
          width: 1,
          height: 1,
        },
        normalizedDocumentBox: {
          xCenter: 0.5,
          yCenter: 0.5,
          width: 0.1,
          height: 0.1,
        },
      },
      split: input.split,
    });
  }
}

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-08-13T10:00:00.000Z';
  }
}

class NullLogger implements Logger {
  private callCount = 0;

  debug(): void {
    this.callCount += 1;
  }

  info(): void {
    this.callCount += 1;
  }

  warn(): void {
    this.callCount += 1;
  }

  error(): void {
    this.callCount += 1;
  }
}
