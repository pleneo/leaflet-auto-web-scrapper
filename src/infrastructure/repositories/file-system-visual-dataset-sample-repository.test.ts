import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPixelBoundingBox, normalizeBoundingBox } from '../../domain/dataset/bounding-box';
import type { VisualDatasetSample } from '../../domain/dataset/visual-dataset-sample';
import {
  FileSystemVisualDatasetSampleRepository,
  FileSystemVisualDatasetSampleRepositoryError,
} from './file-system-visual-dataset-sample-repository';

describe('FileSystemVisualDatasetSampleRepository', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'visual-dataset-'));
  });

  afterEach(async () => {
    await rm(rootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('stores screenshots and annotations by supermarket date and run', async () => {
    const repository = new FileSystemVisualDatasetSampleRepository({ rootDirectory });
    const sample = createSample();

    await repository.saveMany([sample]);

    const sampleDirectory = join(rootDirectory, 'carnauba/2026-07-21/run-1/samples/sample-1');
    const screenshotPath = join(sampleDirectory, 'sample-1.png');
    const annotation = JSON.parse(
      await readFile(join(sampleDirectory, 'annotation.json'), 'utf8'),
    ) as {
      readonly sampleId: string;
      readonly screenshotPath: string;
      readonly subject: { readonly subjectKind: string; readonly storeId: number };
    };

    expect(await readFile(screenshotPath)).toEqual(Buffer.from([1, 2, 3]));
    expect(annotation.sampleId).toBe('sample-1');
    expect(annotation.screenshotPath).toBe(screenshotPath);
    expect(annotation.subject).toEqual({
      subjectKind: 'carnauba-leaflet-card',
      storeId: 79,
      storeName: 'Maestro',
      cardIndex: 0,
      leafletTitle: 'São João',
    });
  });

  it('rejects invalid paths and filenames', async () => {
    await expect(
      new FileSystemVisualDatasetSampleRepository({ rootDirectory: ' ' }).saveMany([
        createSample(),
      ]),
    ).rejects.toThrow(FileSystemVisualDatasetSampleRepositoryError);

    await expect(
      new FileSystemVisualDatasetSampleRepository({ rootDirectory }).saveMany([
        {
          ...createSample(),
          runId: '../invalid',
        },
      ]),
    ).rejects.toThrow(FileSystemVisualDatasetSampleRepositoryError);

    await expect(
      new FileSystemVisualDatasetSampleRepository({ rootDirectory }).saveMany([
        {
          ...createSample(),
          screenshotMetadata: {
            ...createSample().screenshotMetadata,
            fileName: 'sample.txt',
          },
        },
      ]),
    ).rejects.toThrow(FileSystemVisualDatasetSampleRepositoryError);
  });
});

function createSample(): VisualDatasetSample {
  const viewportBox = createPixelBoundingBox({
    xMin: 10,
    yMin: 20,
    xMax: 110,
    yMax: 220,
  });
  const documentBox = createPixelBoundingBox({
    xMin: 10,
    yMin: 120,
    xMax: 110,
    yMax: 320,
  });

  return {
    sampleId: 'sample-1',
    runId: 'run-1',
    supermarketId: 'carnauba',
    stateName: 'LEAFLETS_PAGE',
    pageUrl: 'https://carnaubasupermercados.com.br/loja/79/encartes',
    subject: {
      subjectKind: 'carnauba-leaflet-card',
      storeId: 79,
      storeName: 'Maestro',
      cardIndex: 0,
      leafletTitle: 'São João',
    },
    screenshotPng: Uint8Array.of(1, 2, 3),
    screenshotMetadata: {
      fileName: 'sample-1.png',
      mimeType: 'image/png',
      fullPage: true,
      viewport: {
        width: 800,
        height: 600,
      },
      documentWidth: 800,
      documentHeight: 1_000,
      scrollPosition: {
        scrollX: 0,
        scrollY: 100,
      },
      capturedAtIso: '2026-07-21T08:00:00.000Z',
    },
    target: {
      label: 'open_leaflet_modal_button',
      viewportBox,
      documentBox,
      normalizedDocumentBox: normalizeBoundingBox(documentBox, {
        width: 800,
        height: 1_000,
      }),
    },
    split: 'unassigned',
  };
}
