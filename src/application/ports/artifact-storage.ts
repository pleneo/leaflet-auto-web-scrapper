import type { StoredVisualCaptureArtifact } from '../../domain/visual/capture-artifact';
import type { VisualCaptureResult } from '../../domain/visual/capture-result';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';

export interface StoreVisualCaptureArtifactRequest {
  readonly runId: string;
  readonly supermarketId: SupermarketId;
  readonly capture: VisualCaptureResult;
}

export interface ArtifactStoragePort {
  storeVisualCapture(
    input: StoreVisualCaptureArtifactRequest,
  ): Promise<StoredVisualCaptureArtifact>;
}
