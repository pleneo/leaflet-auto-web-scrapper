import { mkdir, writeFile } from 'node:fs/promises';
import type {
  ArtifactStoragePort,
  StoreVisualCaptureArtifactRequest,
} from '../../application/ports/artifact-storage';
import type { StoredVisualCaptureArtifact } from '../../domain/visual/capture-artifact';
import { buildVisualCaptureArtifactPaths } from './artifact-path-builder';

export interface LocalArtifactStorageConfig {
  readonly rootDirectory: string;
}

export class LocalArtifactStorageAdapter implements ArtifactStoragePort {
  private readonly rootDirectory: string;

  constructor(config: LocalArtifactStorageConfig) {
    this.rootDirectory = config.rootDirectory;
  }

  async storeVisualCapture(
    input: StoreVisualCaptureArtifactRequest,
  ): Promise<StoredVisualCaptureArtifact> {
    const paths = buildVisualCaptureArtifactPaths({
      rootDirectory: this.rootDirectory,
      runId: input.runId,
      supermarketId: input.supermarketId,
      metadata: input.capture.metadata,
    });

    await mkdir(paths.directoryPath, {
      recursive: true,
    });
    await writeFile(paths.screenshotPath, input.capture.screenshotPng);
    await writeFile(paths.metadataPath, `${JSON.stringify(input.capture.metadata, null, 2)}\n`);

    return {
      captureId: input.capture.metadata.captureId,
      screenshotPath: paths.screenshotPath,
      metadataPath: paths.metadataPath,
      metadata: input.capture.metadata,
    };
  }
}
