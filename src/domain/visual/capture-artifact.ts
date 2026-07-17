import type { VisualCaptureMetadata } from './capture-result';

export interface StoredVisualCaptureArtifact {
  readonly captureId: string;
  readonly screenshotPath: string;
  readonly metadataPath: string;
  readonly metadata: VisualCaptureMetadata;
}
