import type {
  DocumentScrollPosition,
  PixelBoundingBox,
  ViewportSize,
} from '../../domain/dataset/bounding-box';

export interface VisualDatasetPageSnapshot {
  readonly pageUrl: string;
  readonly screenshotPng: Uint8Array;
  readonly viewport: ViewportSize;
  readonly documentSize: ViewportSize;
  readonly scrollPosition: DocumentScrollPosition;
}

export interface VisualDatasetPage {
  captureFullPageSnapshot(): Promise<VisualDatasetPageSnapshot>;
}

export interface VisualActionTarget {
  readonly locatorDescription: string;
  scrollIntoView(): Promise<void>;
  isVisible(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  getViewportBoundingBox(): Promise<PixelBoundingBox | null>;
}
