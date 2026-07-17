import { join } from 'node:path';
import type { VisualCaptureMetadata } from '../../domain/visual/capture-result';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';

export interface BuildVisualCaptureArtifactPathsInput {
  readonly rootDirectory: string;
  readonly runId: string;
  readonly supermarketId: SupermarketId;
  readonly metadata: VisualCaptureMetadata;
}

export interface VisualCaptureArtifactPaths {
  readonly directoryPath: string;
  readonly screenshotPath: string;
  readonly metadataPath: string;
}

export class InvalidArtifactPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidArtifactPathError';
  }
}

export function buildVisualCaptureArtifactPaths(
  input: BuildVisualCaptureArtifactPathsInput,
): VisualCaptureArtifactPaths {
  const rootDirectory = validateRootDirectory(input.rootDirectory);
  const runId = validatePathSegment(input.runId, 'runId');
  const captureId = validatePathSegment(input.metadata.captureId, 'captureId');
  const captureDate = getCaptureDate(input.metadata.capturedAtIso);

  const directoryPath = join(
    rootDirectory,
    'captures',
    input.supermarketId,
    captureDate,
    runId,
    captureId,
  );

  return {
    directoryPath,
    screenshotPath: join(directoryPath, `${input.metadata.kind}.png`),
    metadataPath: join(directoryPath, 'metadata.json'),
  };
}

function validateRootDirectory(rootDirectory: string): string {
  const trimmed = rootDirectory.trim();

  if (trimmed.length === 0) {
    throw new InvalidArtifactPathError('Artifact root directory cannot be blank.');
  }

  return trimmed;
}

function validatePathSegment(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) {
    throw new InvalidArtifactPathError(`${fieldName} must be a safe path segment.`);
  }

  return trimmed;
}

function getCaptureDate(capturedAtIso: string): string {
  const captureDate = capturedAtIso.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(captureDate)) {
    throw new InvalidArtifactPathError('capturedAtIso must start with an ISO date.');
  }

  if (!Number.isFinite(Date.parse(capturedAtIso))) {
    throw new InvalidArtifactPathError('capturedAtIso must be a valid ISO date.');
  }

  return captureDate;
}
