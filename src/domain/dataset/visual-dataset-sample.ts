import type { PixelBoundingBox, NormalizedBoundingBox } from './bounding-box';
import type { DatasetSplit } from './dataset-split';
import type { FsmStateName } from '../extraction/fsm-state-name';
import type { ScreenshotMetadata } from './screenshot-metadata';
import type { SupermarketId } from '../supermarket/supermarket-id';
import type { TargetSemanticLabel } from './target-semantic-label';

export interface VisualTargetAnnotation {
  readonly label: TargetSemanticLabel;
  readonly viewportBox: PixelBoundingBox;
  readonly documentBox: PixelBoundingBox;
  readonly normalizedDocumentBox: NormalizedBoundingBox;
}

export interface VisualDatasetSample {
  readonly sampleId: string;
  readonly runId: string;
  readonly supermarketId: SupermarketId;
  readonly stateName: FsmStateName;
  readonly pageUrl: string;
  readonly screenshotPng: Uint8Array;
  readonly screenshotMetadata: ScreenshotMetadata;
  readonly target: VisualTargetAnnotation;
  readonly split: DatasetSplit;
}
