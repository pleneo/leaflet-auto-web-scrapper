import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatasetSampleRepository } from '../../application/ports/dataset-sample-repository';
import type { VisualDatasetSample } from '../../domain/dataset/visual-dataset-sample';

export interface FileSystemVisualDatasetSampleRepositoryConfig {
  readonly rootDirectory: string;
}

interface VisualDatasetAnnotation {
  readonly sampleId: string;
  readonly runId: string;
  readonly supermarketId: string;
  readonly stateName: string;
  readonly pageUrl: string;
  readonly subject: VisualDatasetSample['subject'];
  readonly screenshotPath: string;
  readonly screenshotMetadata: VisualDatasetSample['screenshotMetadata'];
  readonly target: VisualDatasetSample['target'];
  readonly split: VisualDatasetSample['split'];
}

export class FileSystemVisualDatasetSampleRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileSystemVisualDatasetSampleRepositoryError';
  }
}

export class FileSystemVisualDatasetSampleRepository implements DatasetSampleRepository {
  private readonly rootDirectory: string;

  constructor(config: FileSystemVisualDatasetSampleRepositoryConfig) {
    this.rootDirectory = config.rootDirectory;
  }

  async saveMany(samples: readonly VisualDatasetSample[]): Promise<void> {
    const rootDirectory = this.getRootDirectory();

    for (const sample of samples) {
      await this.saveSample(rootDirectory, sample);
    }
  }

  private async saveSample(rootDirectory: string, sample: VisualDatasetSample): Promise<void> {
    validatePathSegment(sample.runId, 'runId');
    validatePathSegment(sample.sampleId, 'sampleId');
    validateScreenshotFileName(sample.screenshotMetadata.fileName);

    const sampleDirectory = join(
      rootDirectory,
      sample.supermarketId,
      sample.screenshotMetadata.capturedAtIso.slice(0, 10),
      sample.runId,
      'samples',
      sample.sampleId,
    );
    await mkdir(sampleDirectory, {
      recursive: true,
    });

    const screenshotPath = join(sampleDirectory, sample.screenshotMetadata.fileName);
    const annotationPath = join(sampleDirectory, 'annotation.json');

    await writeFile(screenshotPath, sample.screenshotPng);
    await writeFile(
      annotationPath,
      `${JSON.stringify(createAnnotation(sample, screenshotPath), null, 2)}\n`,
    );
  }

  private getRootDirectory(): string {
    const trimmed = this.rootDirectory.trim();

    if (trimmed.length === 0) {
      throw new FileSystemVisualDatasetSampleRepositoryError('rootDirectory cannot be blank.');
    }

    return trimmed;
  }
}

function createAnnotation(
  sample: VisualDatasetSample,
  screenshotPath: string,
): VisualDatasetAnnotation {
  return {
    sampleId: sample.sampleId,
    runId: sample.runId,
    supermarketId: sample.supermarketId,
    stateName: sample.stateName,
    pageUrl: sample.pageUrl,
    subject: sample.subject,
    screenshotPath,
    screenshotMetadata: sample.screenshotMetadata,
    target: sample.target,
    split: sample.split,
  };
}

function validatePathSegment(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new FileSystemVisualDatasetSampleRepositoryError(`${fieldName} cannot be blank.`);
  }

  if (value.includes('/') || value.includes('\\')) {
    throw new FileSystemVisualDatasetSampleRepositoryError(
      `${fieldName} cannot contain path separators.`,
    );
  }
}

function validateScreenshotFileName(value: string): void {
  validatePathSegment(value, 'screenshot fileName');

  if (!value.endsWith('.png')) {
    throw new FileSystemVisualDatasetSampleRepositoryError(
      'screenshot fileName must end with .png.',
    );
  }
}
