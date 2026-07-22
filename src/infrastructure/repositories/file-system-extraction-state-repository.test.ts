import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FileSystemExtractionStateRepository,
  FileSystemExtractionStateRepositoryError,
} from './file-system-extraction-state-repository';

describe('FileSystemExtractionStateRepository', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'extraction-state-repository-'));
  });

  afterEach(async () => {
    await rm(rootDirectory, {
      force: true,
      recursive: true,
    });
  });

  it('returns an empty snapshot when no state file exists', async () => {
    const repository = new FileSystemExtractionStateRepository({
      rootDirectory,
    });

    await expect(repository.load()).resolves.toEqual({
      version: 1,
      targets: [],
    });
  });

  it('saves and loads the extraction state snapshot', async () => {
    const repository = new FileSystemExtractionStateRepository({
      rootDirectory,
    });

    await repository.save({
      version: 1,
      targets: [
        {
          targetId: 'carnauba',
          supermarketId: 'carnauba',
          lastRunAtIso: '2026-07-22T10:00:00.000Z',
          lastSuccessfulRunAtIso: '2026-07-22T10:00:00.000Z',
          units: [],
        },
      ],
    });

    expect(await repository.load()).toEqual({
      version: 1,
      targets: [
        {
          targetId: 'carnauba',
          supermarketId: 'carnauba',
          lastRunAtIso: '2026-07-22T10:00:00.000Z',
          lastSuccessfulRunAtIso: '2026-07-22T10:00:00.000Z',
          units: [],
        },
      ],
    });
    expect(await readFile(join(rootDirectory, 'extraction-state.json'), 'utf8')).toContain(
      '"targetId": "carnauba"',
    );
  });

  it('rejects blank root directory and falls back from invalid files', async () => {
    expect(
      () =>
        new FileSystemExtractionStateRepository({
          rootDirectory: ' ',
        }),
    ).toThrow(FileSystemExtractionStateRepositoryError);

    await writeFile(join(rootDirectory, 'extraction-state.json'), '{"version":2}');

    const repository = new FileSystemExtractionStateRepository({
      rootDirectory,
    });

    await expect(repository.load()).resolves.toEqual({
      version: 1,
      targets: [],
    });
  });
});
