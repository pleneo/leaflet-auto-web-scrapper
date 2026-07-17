import type { CaptureRegion } from '../../domain/visual/capture-region';
import type { VisualCaptureResult } from '../../domain/visual/capture-result';
import type { VisualViewport } from '../../domain/visual/viewport';

export interface CapturePageRequest {
  readonly captureId: string;
  readonly url: string;
  readonly viewport: VisualViewport;
  readonly fullPage: boolean;
  readonly timeoutMs: number;
}

export interface CaptureRegionRequest {
  readonly captureId: string;
  readonly url: string;
  readonly viewport: VisualViewport;
  readonly region: CaptureRegion;
  readonly timeoutMs: number;
}

export interface VisualCapturePort {
  capturePage(input: CapturePageRequest): Promise<VisualCaptureResult>;
  captureRegion(input: CaptureRegionRequest): Promise<VisualCaptureResult>;
}
