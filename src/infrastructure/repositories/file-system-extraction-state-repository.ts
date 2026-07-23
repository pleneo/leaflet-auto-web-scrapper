import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ExtractionStateRepository } from '../../application/ports/extraction-state-repository';
import type { ExtractionStateSnapshot } from '../../domain/extraction/extraction-state';
import { createEmptyExtractionStateSnapshot } from '../../domain/extraction/extraction-state';

export interface FileSystemExtractionStateRepositoryConfig {
  readonly rootDirectory: string;
}

export class FileSystemExtractionStateRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileSystemExtractionStateRepositoryError';
  }
}

export class FileSystemExtractionStateRepository implements ExtractionStateRepository {
  private readonly filePath: string;

  constructor(config: FileSystemExtractionStateRepositoryConfig) {
    const rootDirectory = config.rootDirectory.trim();

    if (rootDirectory.length === 0) {
      throw new FileSystemExtractionStateRepositoryError('rootDirectory cannot be blank.');
    }

    this.filePath = join(rootDirectory, 'extraction-state.json');
  }

  async load(): Promise<ExtractionStateSnapshot> {
    try {
      return parseSnapshot(await readFile(this.filePath, 'utf8'));
    } catch {
      return createEmptyExtractionStateSnapshot();
    }
  }

  async save(snapshot: ExtractionStateSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), {
      recursive: true,
    });
    await writeFile(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`);
  }
}

interface PersistedExtractionStateSnapshot {
  readonly version: number;
  readonly targets: ExtractionStateSnapshot['targets'];
}

function parseSnapshot(content: string): ExtractionStateSnapshot {
  const snapshot = JSON.parse(content) as PersistedExtractionStateSnapshot;

  if (snapshot.version !== 1 || !Array.isArray(snapshot.targets)) {
    throw new FileSystemExtractionStateRepositoryError('Invalid extraction state snapshot.');
  }

  return {
    version: 1,
    targets: snapshot.targets,
  };
}
