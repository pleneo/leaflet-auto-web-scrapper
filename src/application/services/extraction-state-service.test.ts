import { describe, expect, it } from 'vitest';
import type { ExtractionStateSnapshot } from '../../domain/extraction/extraction-state';
import type { ExtractionStateRepository } from '../ports/extraction-state-repository';
import type { PlaywrightExtractionOutput } from '../ports/playwright-extraction-strategy';
import { ExtractionStateService } from './extraction-state-service';

describe('ExtractionStateService', () => {
  it('classifies first-seen leaflets as new and persists target state', async () => {
    const repository = new MemoryExtractionStateRepository();
    const service = new ExtractionStateService(repository);

    const summary = await service.recordOutput(
      createOutput({
        units: [
          createUnit({
            unitId: '79',
            leaflets: [createLeaflet({ leafletKey: 'leaflet-1' })],
          }),
        ],
      }),
      '2026-07-22T10:00:00.000Z',
    );

    expect(summary).toEqual({
      targetId: 'carnauba',
      unitsProcessed: 1,
      newLeaflets: 1,
      unchangedLeaflets: 0,
      removedLeaflets: 0,
      failedUnits: 0,
      emptyUnits: 0,
    });
    expect(repository.snapshot.targets[0]?.units[0]?.leaflets[0]).toMatchObject({
      leafletKey: 'leaflet-1',
      firstSeenAtIso: '2026-07-22T10:00:00.000Z',
      lastSeenAtIso: '2026-07-22T10:00:00.000Z',
      status: 'active',
    });
  });

  it('classifies unchanged, new and removed leaflets on later successful units', async () => {
    const repository = new MemoryExtractionStateRepository();
    const service = new ExtractionStateService(repository);

    await service.recordOutput(
      createOutput({
        units: [
          createUnit({
            unitId: '79',
            leaflets: [
              createLeaflet({ leafletKey: 'leaflet-1' }),
              createLeaflet({ leafletKey: 'leaflet-removed' }),
            ],
          }),
        ],
      }),
      '2026-07-22T10:00:00.000Z',
    );
    const summary = await service.recordOutput(
      createOutput({
        units: [
          createUnit({
            unitId: '79',
            leaflets: [
              createLeaflet({ leafletKey: 'leaflet-1' }),
              createLeaflet({ leafletKey: 'leaflet-2' }),
            ],
          }),
        ],
      }),
      '2026-07-22T11:00:00.000Z',
    );

    expect(summary).toMatchObject({
      newLeaflets: 1,
      unchangedLeaflets: 1,
      removedLeaflets: 1,
    });
    expect(repository.snapshot.targets[0]?.units[0]?.leaflets).toEqual([
      {
        leafletKey: 'leaflet-1',
        title: 'Leaflet leaflet-1',
        contentSignature: 'signature-leaflet-1',
        imageCount: 1,
        sourceUrl: 'https://example.com/leaflet-1',
        firstSeenAtIso: '2026-07-22T10:00:00.000Z',
        lastSeenAtIso: '2026-07-22T11:00:00.000Z',
        status: 'active',
      },
      {
        leafletKey: 'leaflet-2',
        title: 'Leaflet leaflet-2',
        contentSignature: 'signature-leaflet-2',
        imageCount: 1,
        sourceUrl: 'https://example.com/leaflet-2',
        firstSeenAtIso: '2026-07-22T11:00:00.000Z',
        lastSeenAtIso: '2026-07-22T11:00:00.000Z',
        status: 'active',
      },
      {
        leafletKey: 'leaflet-removed',
        title: 'Leaflet leaflet-removed',
        contentSignature: 'signature-leaflet-removed',
        imageCount: 1,
        sourceUrl: 'https://example.com/leaflet-removed',
        firstSeenAtIso: '2026-07-22T10:00:00.000Z',
        lastSeenAtIso: '2026-07-22T11:00:00.000Z',
        status: 'removed',
      },
    ]);
  });

  it('marks empty units without losing historical target information', async () => {
    const repository = new MemoryExtractionStateRepository();
    const service = new ExtractionStateService(repository);

    await service.recordOutput(
      createOutput({
        units: [
          createUnit({
            unitId: '79',
            leaflets: [createLeaflet({ leafletKey: 'leaflet-1' })],
          }),
        ],
      }),
      '2026-07-22T10:00:00.000Z',
    );
    const summary = await service.recordOutput(
      createOutput({
        units: [
          createUnit({
            unitId: '79',
            status: 'empty',
            leaflets: [],
          }),
        ],
      }),
      '2026-07-22T11:00:00.000Z',
    );

    expect(summary.emptyUnits).toBe(1);
    expect(summary.removedLeaflets).toBe(1);
    expect(repository.snapshot.targets[0]?.units[0]).toMatchObject({
      status: 'empty',
      lastSuccessfulSeenAtIso: '2026-07-22T11:00:00.000Z',
    });
  });

  it('keeps previous leaflets active when a unit fails', async () => {
    const repository = new MemoryExtractionStateRepository();
    const service = new ExtractionStateService(repository);

    await service.recordOutput(
      createOutput({
        units: [
          createUnit({
            unitId: '79',
            leaflets: [createLeaflet({ leafletKey: 'leaflet-1' })],
          }),
        ],
      }),
      '2026-07-22T10:00:00.000Z',
    );
    const summary = await service.recordOutput(
      createOutput({
        status: 'partially_succeeded',
        units: [
          createUnit({
            unitId: '79',
            status: 'failed',
            leaflets: [],
            errorMessage: 'Store unavailable.',
          }),
        ],
      }),
      '2026-07-22T11:00:00.000Z',
    );

    expect(summary.failedUnits).toBe(1);
    expect(summary.removedLeaflets).toBe(0);
    expect(repository.snapshot.targets[0]?.units[0]).toMatchObject({
      status: 'failed',
      errorMessage: 'Store unavailable.',
      lastSuccessfulSeenAtIso: '2026-07-22T10:00:00.000Z',
      leaflets: [
        {
          leafletKey: 'leaflet-1',
          status: 'active',
        },
      ],
    });
  });

  it('records failed target output without previous successful state', async () => {
    const repository = new MemoryExtractionStateRepository();
    const service = new ExtractionStateService(repository);

    const summary = await service.recordOutput(
      createOutput({
        status: 'failed',
        units: [
          createUnit({
            unitId: '79',
            status: 'failed',
            leaflets: [],
          }),
        ],
      }),
      '2026-07-22T10:00:00.000Z',
    );

    expect(summary.failedUnits).toBe(1);
    expect(repository.snapshot.targets[0]).toMatchObject({
      lastSuccessfulRunAtIso: null,
      units: [
        {
          status: 'failed',
          lastSuccessfulSeenAtIso: null,
          errorMessage: 'Extraction unit failed.',
          leaflets: [],
        },
      ],
    });
  });

  it('preserves previous successful run timestamp when the target fails later', async () => {
    const repository = new MemoryExtractionStateRepository();
    const service = new ExtractionStateService(repository);

    await service.recordOutput(
      createOutput({
        units: [
          createUnit({
            unitId: '79',
            leaflets: [createLeaflet({ leafletKey: 'leaflet-1' })],
          }),
        ],
      }),
      '2026-07-22T10:00:00.000Z',
    );
    await service.recordOutput(
      createOutput({
        status: 'failed',
        units: [
          createUnit({
            unitId: '79',
            status: 'failed',
            leaflets: [],
          }),
        ],
      }),
      '2026-07-22T11:00:00.000Z',
    );

    expect(repository.snapshot.targets[0]).toMatchObject({
      lastRunAtIso: '2026-07-22T11:00:00.000Z',
      lastSuccessfulRunAtIso: '2026-07-22T10:00:00.000Z',
    });
  });
});

class MemoryExtractionStateRepository implements ExtractionStateRepository {
  snapshot: ExtractionStateSnapshot = {
    version: 1,
    targets: [],
  };

  load(): Promise<ExtractionStateSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  save(snapshot: ExtractionStateSnapshot): Promise<void> {
    this.snapshot = snapshot;
    return Promise.resolve();
  }
}

function createOutput(input: {
  readonly status?: PlaywrightExtractionOutput['status'];
  readonly units: PlaywrightExtractionOutput['units'];
}): PlaywrightExtractionOutput {
  return {
    runId: 'run-1',
    targetId: 'carnauba',
    supermarketId: 'carnauba',
    status: input.status ?? 'succeeded',
    leafletsFound: input.units.reduce((total, unit) => total + unit.leaflets.length, 0),
    artifactsDownloaded: 0,
    artifactsReused: 0,
    datasetSamplesCreated: 0,
    units: input.units,
    failures: [],
  };
}

function createUnit(input: {
  readonly unitId: string;
  readonly status?: 'succeeded' | 'failed' | 'empty';
  readonly leaflets: PlaywrightExtractionOutput['units'][number]['leaflets'];
  readonly errorMessage?: string;
}): PlaywrightExtractionOutput['units'][number] {
  return {
    unitId: input.unitId,
    unitName: `Unit ${input.unitId}`,
    status: input.status ?? 'succeeded',
    sourceUrl: `https://example.com/unit/${input.unitId}`,
    leaflets: input.leaflets,
    errorMessage: input.errorMessage ?? null,
  };
}

function createLeaflet(input: {
  readonly leafletKey: string;
}): PlaywrightExtractionOutput['units'][number]['leaflets'][number] {
  return {
    leafletKey: input.leafletKey,
    title: `Leaflet ${input.leafletKey}`,
    contentSignature: `signature-${input.leafletKey}`,
    imageCount: 1,
    sourceUrl: `https://example.com/${input.leafletKey}`,
  };
}
