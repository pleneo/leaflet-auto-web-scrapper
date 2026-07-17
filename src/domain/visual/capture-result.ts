import type { CaptureRegion } from './capture-region';
import type { VisualViewport } from './viewport';

export type VisualCaptureKind = 'page' | 'region';
export type VisualCaptureMimeType = 'image/png';

export interface VisualCaptureMetadata {
  readonly captureId: string;
  readonly kind: VisualCaptureKind;
  readonly sourceUrl: string;
  readonly finalUrl: string;
  readonly title: string;
  readonly capturedAtIso: string;
  readonly viewport: VisualViewport;
  readonly fullPage: boolean;
  readonly mimeType: VisualCaptureMimeType;
  readonly byteLength: number;
  readonly region?: CaptureRegion;
}

export interface VisualCaptureResult {
  readonly screenshotPng: Uint8Array;
  readonly metadata: VisualCaptureMetadata;
}
