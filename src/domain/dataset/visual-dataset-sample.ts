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

export interface CarnaubaLeafletCardVisualDatasetSubject {
  readonly subjectKind: 'carnauba-leaflet-card';
  readonly storeId: number;
  readonly storeName: string;
  readonly cardIndex: number;
  readonly leafletTitle: string;
}

export interface CarnaubaHomeLeafletsLinkVisualDatasetSubject {
  readonly subjectKind: 'carnauba-home-leaflets-link';
  readonly storeId: number;
  readonly storeName: string;
}

export type VisualDatasetSubject =
  CarnaubaHomeLeafletsLinkVisualDatasetSubject | CarnaubaLeafletCardVisualDatasetSubject;

export interface VisualDatasetSample {
  readonly sampleId: string;
  readonly runId: string;
  readonly supermarketId: SupermarketId;
  readonly stateName: FsmStateName;
  readonly pageUrl: string;
  readonly subject: VisualDatasetSubject;
  readonly screenshotPng: Uint8Array;
  readonly screenshotMetadata: ScreenshotMetadata;
  readonly target: VisualTargetAnnotation;
  readonly split: DatasetSplit;
}
