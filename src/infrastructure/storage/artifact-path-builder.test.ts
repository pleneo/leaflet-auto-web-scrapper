import { describe, expect, it } from 'vitest';
import type { VisualCaptureMetadata } from '../../domain/visual/capture-result';
import { createVisualViewport } from '../../domain/visual/viewport';
import { InvalidArtifactPathError, buildVisualCaptureArtifactPaths } from './artifact-path-builder';

describe('buildVisualCaptureArtifactPaths', () => {
  it('builds deterministic local paths for capture artifacts', () => {
    const paths = buildVisualCaptureArtifactPaths({
      rootDirectory: '/tmp/artifacts',
      runId: 'run-1',
      supermarketId: 'carnauba',
      metadata: createMetadata('capture-1', 'page', '2026-07-17T10:00:00.000Z'),
    });

    expect(paths).toEqual({
      directoryPath: '/tmp/artifacts/captures/carnauba/2026-07-17/run-1/capture-1',
      screenshotPath: '/tmp/artifacts/captures/carnauba/2026-07-17/run-1/capture-1/page.png',
      metadataPath: '/tmp/artifacts/captures/carnauba/2026-07-17/run-1/capture-1/metadata.json',
    });
  });

  it('rejects blank root directories', () => {
    expect(() =>
      buildVisualCaptureArtifactPaths({
        rootDirectory: ' ',
        runId: 'run-1',
        supermarketId: 'carnauba',
        metadata: createMetadata('capture-1', 'page', '2026-07-17T10:00:00.000Z'),
      }),
    ).toThrow(InvalidArtifactPathError);
  });

  it('rejects unsafe run and capture identifiers', () => {
    expect(() =>
      buildVisualCaptureArtifactPaths({
        rootDirectory: '/tmp/artifacts',
        runId: '../run-1',
        supermarketId: 'carnauba',
        metadata: createMetadata('capture-1', 'page', '2026-07-17T10:00:00.000Z'),
      }),
    ).toThrow(InvalidArtifactPathError);

    expect(() =>
      buildVisualCaptureArtifactPaths({
        rootDirectory: '/tmp/artifacts',
        runId: 'run-1',
        supermarketId: 'carnauba',
        metadata: createMetadata('/capture-1', 'page', '2026-07-17T10:00:00.000Z'),
      }),
    ).toThrow(InvalidArtifactPathError);
  });

  it('rejects invalid capture dates', () => {
    expect(() =>
      buildVisualCaptureArtifactPaths({
        rootDirectory: '/tmp/artifacts',
        runId: 'run-1',
        supermarketId: 'carnauba',
        metadata: createMetadata('capture-1', 'page', 'invalid-date'),
      }),
    ).toThrow(InvalidArtifactPathError);

    expect(() =>
      buildVisualCaptureArtifactPaths({
        rootDirectory: '/tmp/artifacts',
        runId: 'run-1',
        supermarketId: 'carnauba',
        metadata: createMetadata('capture-1', 'page', '2026-99-99T10:00:00.000Z'),
      }),
    ).toThrow(InvalidArtifactPathError);
  });
});

function createMetadata(
  captureId: string,
  kind: VisualCaptureMetadata['kind'],
  capturedAtIso: string,
): VisualCaptureMetadata {
  return {
    captureId,
    kind,
    sourceUrl: 'https://example.com',
    finalUrl: 'https://example.com/final',
    title: 'Leaflet page',
    capturedAtIso,
    viewport: createVisualViewport({
      width: 1366,
      height: 768,
    }),
    fullPage: kind === 'page',
    mimeType: 'image/png',
    byteLength: 3,
  };
}
