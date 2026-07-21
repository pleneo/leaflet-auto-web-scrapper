import { describe, expect, it } from 'vitest';
import type { Clock } from '../ports/clock';
import type { DatasetSampleRepository } from '../ports/dataset-sample-repository';
import type {
  VisualActionTarget,
  VisualDatasetPage,
  VisualDatasetPageSnapshot,
} from '../ports/visual-dataset-page';
import { createPixelBoundingBox, type PixelBoundingBox } from '../../domain/dataset/bounding-box';
import type { VisualDatasetSample } from '../../domain/dataset/visual-dataset-sample';
import {
  VisualDatasetCaptureError,
  VisualDatasetCaptureService,
} from './visual-dataset-capture-service';

describe('VisualDatasetCaptureService', () => {
  it('captures and persists a sample before the caller action', async () => {
    const calls: string[] = [];
    const repository = new MemoryDatasetSampleRepository(calls);
    const service = new VisualDatasetCaptureService(
      repository,
      new FixedClock('2026-07-21T08:00:00.000Z'),
    );
    const target = new FakeVisualActionTarget(calls, {
      viewportBox: createPixelBoundingBox({
        xMin: 10,
        yMin: 20,
        xMax: 110,
        yMax: 220,
      }),
    });

    const sample = await service.captureBeforeAction({
      sampleId: 'sample-1',
      runId: 'run-1',
      supermarketId: 'carnauba',
      stateName: 'LEAFLETS_PAGE',
      label: 'open_leaflet_modal_button',
      subject: {
        subjectKind: 'carnauba-leaflet-card',
        storeId: 79,
        storeName: 'Maestro',
        cardIndex: 0,
        leafletTitle: 'São João',
      },
      split: 'unassigned',
      page: new FakeVisualDatasetPage(calls),
      target,
    });

    calls.push('caller-click');

    expect(calls).toEqual([
      'target-scroll',
      'target-visible',
      'target-enabled',
      'target-box',
      'page-snapshot',
      'repository-save',
      'caller-click',
    ]);
    expect(repository.savedSamples).toEqual([sample]);
    expect(sample.screenshotMetadata.fileName).toBe('sample-1.png');
    expect(sample.screenshotMetadata.scrollPosition).toEqual({ scrollX: 5, scrollY: 100 });
    expect(sample.target.documentBox).toMatchObject({
      xMin: 15,
      yMin: 120,
      xMax: 115,
      yMax: 320,
    });
    expect(sample.target.normalizedDocumentBox).toEqual({
      xCenter: 0.08125,
      yCenter: 0.22,
      width: 0.125,
      height: 0.2,
    });
  });

  it('rejects invisible disabled and missing-box targets', async () => {
    const service = new VisualDatasetCaptureService(
      new MemoryDatasetSampleRepository([]),
      new FixedClock('2026-07-21T08:00:00.000Z'),
    );
    const input = createInput({
      page: new FakeVisualDatasetPage([]),
      target: new FakeVisualActionTarget([], { visible: false }),
    });

    await expect(service.captureBeforeAction(input)).rejects.toThrow(VisualDatasetCaptureError);
    await expect(
      service.captureBeforeAction(
        createInput({
          page: new FakeVisualDatasetPage([]),
          target: new FakeVisualActionTarget([], { enabled: false }),
        }),
      ),
    ).rejects.toThrow(VisualDatasetCaptureError);
    await expect(
      service.captureBeforeAction(
        createInput({
          page: new FakeVisualDatasetPage([]),
          target: new FakeVisualActionTarget([], { viewportBox: null }),
        }),
      ),
    ).rejects.toThrow(VisualDatasetCaptureError);
  });

  it('rejects blank identities', async () => {
    const service = new VisualDatasetCaptureService(
      new MemoryDatasetSampleRepository([]),
      new FixedClock('2026-07-21T08:00:00.000Z'),
    );

    await expect(
      service.captureBeforeAction({
        ...createInput({
          page: new FakeVisualDatasetPage([]),
          target: new FakeVisualActionTarget([]),
        }),
        sampleId: ' ',
      }),
    ).rejects.toThrow(VisualDatasetCaptureError);
    await expect(
      service.captureBeforeAction({
        ...createInput({
          page: new FakeVisualDatasetPage([]),
          target: new FakeVisualActionTarget([]),
        }),
        runId: ' ',
      }),
    ).rejects.toThrow(VisualDatasetCaptureError);
  });
});

function createInput(input: {
  readonly page: VisualDatasetPage;
  readonly target: VisualActionTarget;
}): Parameters<VisualDatasetCaptureService['captureBeforeAction']>[0] {
  return {
    sampleId: 'sample-1',
    runId: 'run-1',
    supermarketId: 'carnauba',
    stateName: 'LEAFLETS_PAGE',
    label: 'open_leaflet_modal_button',
    subject: {
      subjectKind: 'carnauba-leaflet-card',
      storeId: 79,
      storeName: 'Maestro',
      cardIndex: 0,
      leafletTitle: 'São João',
    },
    split: 'unassigned',
    page: input.page,
    target: input.target,
  };
}

class FakeVisualDatasetPage implements VisualDatasetPage {
  private readonly calls: string[];

  constructor(calls: string[]) {
    this.calls = calls;
  }

  captureFullPageSnapshot(): Promise<VisualDatasetPageSnapshot> {
    this.calls.push('page-snapshot');

    return Promise.resolve({
      pageUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
      screenshotPng: Uint8Array.of(1, 2, 3),
      viewport: {
        width: 800,
        height: 600,
      },
      documentSize: {
        width: 800,
        height: 1_000,
      },
      scrollPosition: {
        scrollX: 5,
        scrollY: 100,
      },
    });
  }
}

class FakeVisualActionTarget implements VisualActionTarget {
  readonly locatorDescription = 'leaflet card';

  private readonly calls: string[];

  private readonly visible: boolean;

  private readonly enabled: boolean;

  private readonly viewportBox: PixelBoundingBox | null;

  constructor(
    calls: string[],
    config?: {
      readonly visible?: boolean;
      readonly enabled?: boolean;
      readonly viewportBox?: PixelBoundingBox | null;
    },
  ) {
    this.calls = calls;
    this.visible = config?.visible ?? true;
    this.enabled = config?.enabled ?? true;
    this.viewportBox =
      config !== undefined && 'viewportBox' in config
        ? config.viewportBox
        : createPixelBoundingBox({
            xMin: 10,
            yMin: 20,
            xMax: 110,
            yMax: 220,
          });
  }

  scrollIntoView(): Promise<void> {
    this.calls.push('target-scroll');
    return Promise.resolve();
  }

  isVisible(): Promise<boolean> {
    this.calls.push('target-visible');
    return Promise.resolve(this.visible);
  }

  isEnabled(): Promise<boolean> {
    this.calls.push('target-enabled');
    return Promise.resolve(this.enabled);
  }

  getViewportBoundingBox(): Promise<PixelBoundingBox | null> {
    this.calls.push('target-box');
    return Promise.resolve(this.viewportBox);
  }
}

class MemoryDatasetSampleRepository implements DatasetSampleRepository {
  readonly savedSamples: VisualDatasetSample[] = [];

  private readonly calls: string[];

  constructor(calls: string[]) {
    this.calls = calls;
  }

  saveMany(samples: readonly VisualDatasetSample[]): Promise<void> {
    this.calls.push('repository-save');
    this.savedSamples.push(...samples);
    return Promise.resolve();
  }
}

class FixedClock implements Clock {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  nowIso(): string {
    return this.value;
  }
}
