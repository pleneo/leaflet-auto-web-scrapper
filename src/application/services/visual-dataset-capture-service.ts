import type { Clock } from '../ports/clock';
import type { DatasetSampleRepository } from '../ports/dataset-sample-repository';
import type { VisualActionTarget, VisualDatasetPage } from '../ports/visual-dataset-page';
import { createPixelBoundingBox, normalizeBoundingBox } from '../../domain/dataset/bounding-box';
import type {
  VisualDatasetSample,
  VisualDatasetSubject,
} from '../../domain/dataset/visual-dataset-sample';
import type { DatasetSplit } from '../../domain/dataset/dataset-split';
import type { TargetSemanticLabel } from '../../domain/dataset/target-semantic-label';
import type { FsmStateName } from '../../domain/extraction/fsm-state-name';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';

export interface CaptureVisualDatasetSampleInput {
  readonly sampleId: string;
  readonly runId: string;
  readonly supermarketId: SupermarketId;
  readonly stateName: FsmStateName;
  readonly label: TargetSemanticLabel;
  readonly subject: VisualDatasetSubject;
  readonly split: DatasetSplit;
  readonly page: VisualDatasetPage;
  readonly target: VisualActionTarget;
}

export class VisualDatasetCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisualDatasetCaptureError';
  }
}

export class VisualDatasetCaptureService {
  private readonly repository: DatasetSampleRepository;

  private readonly clock: Clock;

  constructor(repository: DatasetSampleRepository, clock: Clock) {
    this.repository = repository;
    this.clock = clock;
  }

  async captureBeforeAction(
    input: CaptureVisualDatasetSampleInput,
  ): Promise<VisualDatasetSample> {
    validateIdentity(input.sampleId, 'sampleId');
    validateIdentity(input.runId, 'runId');

    await input.target.scrollIntoView();
    await this.assertTargetReady(input.target);

    const viewportBox = await input.target.getViewportBoundingBox();

    if (viewportBox === null) {
      throw new VisualDatasetCaptureError(
        `Target bounding box is not available: ${input.target.locatorDescription}.`,
      );
    }

    const snapshot = await input.page.captureFullPageSnapshot();
    const documentBox = createPixelBoundingBox({
      xMin: viewportBox.xMin + snapshot.scrollPosition.scrollX,
      yMin: viewportBox.yMin + snapshot.scrollPosition.scrollY,
      xMax: viewportBox.xMax + snapshot.scrollPosition.scrollX,
      yMax: viewportBox.yMax + snapshot.scrollPosition.scrollY,
    });
    const normalizedDocumentBox = normalizeBoundingBox(documentBox, snapshot.documentSize);
    const sample: VisualDatasetSample = {
      sampleId: input.sampleId,
      runId: input.runId,
      supermarketId: input.supermarketId,
      stateName: input.stateName,
      pageUrl: snapshot.pageUrl,
      subject: input.subject,
      screenshotPng: snapshot.screenshotPng,
      screenshotMetadata: {
        fileName: `${input.sampleId}.png`,
        mimeType: 'image/png',
        fullPage: true,
        viewport: snapshot.viewport,
        documentWidth: snapshot.documentSize.width,
        documentHeight: snapshot.documentSize.height,
        scrollPosition: snapshot.scrollPosition,
        capturedAtIso: this.clock.nowIso(),
      },
      target: {
        label: input.label,
        viewportBox,
        documentBox,
        normalizedDocumentBox,
      },
      split: input.split,
    };

    await this.repository.saveMany([sample]);

    return sample;
  }

  private async assertTargetReady(target: VisualActionTarget): Promise<void> {
    if (!(await target.isVisible())) {
      throw new VisualDatasetCaptureError(`Target is not visible: ${target.locatorDescription}.`);
    }

    if (!(await target.isEnabled())) {
      throw new VisualDatasetCaptureError(`Target is not enabled: ${target.locatorDescription}.`);
    }
  }
}

function validateIdentity(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new VisualDatasetCaptureError(`${fieldName} cannot be blank.`);
  }
}
