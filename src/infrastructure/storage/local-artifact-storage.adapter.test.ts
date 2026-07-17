import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { VisualCaptureResult } from '../../domain/visual/capture-result';
import { createVisualViewport } from '../../domain/visual/viewport';
import { LocalArtifactStorageAdapter } from './local-artifact-storage.adapter';

describe('LocalArtifactStorageAdapter', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'leaflet-artifacts-'));
  });

  afterEach(async () => {
    await rm(rootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('stores screenshot bytes and metadata json', async () => {
    const adapter = new LocalArtifactStorageAdapter({
      rootDirectory,
    });
    const capture = createCapture();

    const artifact = await adapter.storeVisualCapture({
      runId: 'run-1',
      supermarketId: 'carnauba',
      capture,
    });

    const storedScreenshot = await readFile(artifact.screenshotPath);
    const storedMetadata = await readFile(artifact.metadataPath, 'utf8');

    expect([...storedScreenshot]).toEqual([1, 2, 3]);
    expect(storedMetadata).toBe(`${JSON.stringify(capture.metadata, null, 2)}\n`);
    expect(artifact).toEqual({
      captureId: 'capture-1',
      screenshotPath: join(rootDirectory, 'captures/carnauba/2026-07-17/run-1/capture-1/page.png'),
      metadataPath: join(
        rootDirectory,
        'captures/carnauba/2026-07-17/run-1/capture-1/metadata.json',
      ),
      metadata: capture.metadata,
    });
  });
});

function createCapture(): VisualCaptureResult {
  return {
    screenshotPng: Uint8Array.of(1, 2, 3),
    metadata: {
      captureId: 'capture-1',
      kind: 'page',
      sourceUrl: 'https://example.com',
      finalUrl: 'https://example.com/final',
      title: 'Leaflet page',
      capturedAtIso: '2026-07-17T10:00:00.000Z',
      viewport: createVisualViewport({
        width: 1366,
        height: 768,
      }),
      fullPage: true,
      mimeType: 'image/png',
      byteLength: 3,
    },
  };
}
