import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateVisualDataset, VisualDatasetValidationError } from './visual-dataset-validator';

describe('validateVisualDataset', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'visual-dataset-validator-'));
  });

  afterEach(async () => {
    await rm(rootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('validates a complete annotation with screenshot', async () => {
    const sampleDirectory = await createSampleDirectory('sample-1');
    const screenshotPath = join(sampleDirectory, 'sample-1.png');
    await writeFile(screenshotPath, Uint8Array.of(1, 2, 3));
    await writeAnnotation(sampleDirectory, createAnnotation(screenshotPath));

    const report = await validateVisualDataset(rootDirectory);

    expect(report).toEqual({
      rootDirectory,
      annotationsChecked: 1,
      screenshotsChecked: 1,
      issues: [],
      valid: true,
    });
  });

  it('reports invalid annotations without throwing', async () => {
    const sampleDirectory = await createSampleDirectory('sample-1');
    await writeAnnotation(
      sampleDirectory,
      createAnnotation(join(sampleDirectory, 'missing.png'), {
        stateName: 'INVALID_STATE',
        target: {
          label: 'invalid_label',
          viewportBox: {
            xMin: -1,
            yMin: 0,
            xMax: 10,
            yMax: 10,
            width: 10,
            height: 10,
          },
          documentBox: {
            xMin: 0,
            yMin: 0,
            xMax: 0,
            yMax: 10,
            width: 0,
            height: 10,
          },
          normalizedDocumentBox: {
            xCenter: 1.5,
            yCenter: 0.5,
            width: 0.25,
            height: 0.25,
          },
        },
      }),
    );

    const report = await validateVisualDataset(rootDirectory);

    expect(report.valid).toBe(false);
    expect(report.annotationsChecked).toBe(1);
    expect(report.issues.map((issue) => issue.message)).toEqual([
      'stateName is missing or invalid.',
      'screenshotPath does not exist.',
      'target.label is missing or invalid.',
      'target.viewportBox has invalid dimensions.',
      'target.documentBox has invalid dimensions.',
      'target.normalizedDocumentBox.xCenter must be between 0 and 1.',
    ]);
  });

  it('rejects blank roots and unreadable directories', async () => {
    await expect(validateVisualDataset(' ')).rejects.toThrow(VisualDatasetValidationError);
    await expect(validateVisualDataset(join(rootDirectory, 'missing'))).rejects.toThrow(
      VisualDatasetValidationError,
    );
  });

  async function createSampleDirectory(sampleId: string): Promise<string> {
    const sampleDirectory = join(
      rootDirectory,
      'carnauba',
      '2026-07-21',
      'run-1',
      'samples',
      sampleId,
    );
    await mkdir(sampleDirectory, {
      recursive: true,
    });

    return sampleDirectory;
  }
});

async function writeAnnotation(directoryPath: string, annotation: object): Promise<void> {
  await writeFile(
    join(directoryPath, 'annotation.json'),
    `${JSON.stringify(annotation, null, 2)}\n`,
  );
}

function createAnnotation(
  screenshotPath: string,
  overrides: Readonly<Record<string, string | object>> = {},
): object {
  return {
    sampleId: 'sample-1',
    runId: 'run-1',
    supermarketId: 'carnauba',
    stateName: 'LEAFLETS_PAGE',
    pageUrl: 'https://example.com',
    screenshotPath,
    target: {
      label: 'open_leaflet_modal_button',
      viewportBox: {
        xMin: 10,
        yMin: 20,
        xMax: 110,
        yMax: 220,
        width: 100,
        height: 200,
      },
      documentBox: {
        xMin: 10,
        yMin: 20,
        xMax: 110,
        yMax: 220,
        width: 100,
        height: 200,
      },
      normalizedDocumentBox: {
        xCenter: 0.5,
        yCenter: 0.5,
        width: 0.25,
        height: 0.25,
      },
    },
    ...overrides,
  };
}
