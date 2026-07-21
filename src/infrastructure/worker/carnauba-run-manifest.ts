import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CarnaubaPlaywrightExtractionResult } from '../scrapers/carnauba/carnauba-playwright-extraction';
import type { StoredCarnaubaPlaywrightExtraction } from '../storage/carnauba-playwright-leaflet-storage';

export type CarnaubaRunManifestStatus = 'succeeded' | 'partially_succeeded' | 'failed';

export interface CarnaubaRunManifestStoreSummary {
  readonly storeId: number;
  readonly storeName: string;
  readonly status: CarnaubaRunManifestStatus;
  readonly leafletsFound: number;
  readonly imagesFound: number;
  readonly sourceUrl: string;
  readonly errorMessage: string | null;
}

export interface CarnaubaRunManifestVisualDatasetSummary {
  readonly enabled: boolean;
  readonly rootDirectory: string | null;
  readonly samplesCreated: number;
}

export interface CarnaubaRunManifestInput {
  readonly runId: string;
  readonly startedAtIso: string;
  readonly completedAtIso: string;
  readonly outputDirectoryPath: string;
  readonly metadataPath: string;
  readonly result: CarnaubaPlaywrightExtractionResult;
  readonly stored: StoredCarnaubaPlaywrightExtraction;
  readonly visualDataset: CarnaubaRunManifestVisualDatasetSummary;
}

export interface CarnaubaRunManifest {
  readonly runId: string;
  readonly supermarketId: 'carnauba';
  readonly mode: 'playwright';
  readonly status: CarnaubaRunManifestStatus;
  readonly startedAtIso: string;
  readonly completedAtIso: string;
  readonly durationMs: number;
  readonly outputDirectoryPath: string;
  readonly metadataPath: string;
  readonly storesProcessed: number;
  readonly storesSucceeded: number;
  readonly storesFailed: number;
  readonly leafletsFound: number;
  readonly imagesFound: number;
  readonly sharedLeafletsStored: number;
  readonly sharedImagesStored: number;
  readonly visualDataset: CarnaubaRunManifestVisualDatasetSummary;
  readonly stores: readonly CarnaubaRunManifestStoreSummary[];
}

export class CarnaubaRunManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CarnaubaRunManifestError';
  }
}

export function createCarnaubaRunManifest(input: CarnaubaRunManifestInput): CarnaubaRunManifest {
  validateIso(input.startedAtIso, 'startedAtIso');
  validateIso(input.completedAtIso, 'completedAtIso');

  const startedMs = Date.parse(input.startedAtIso);
  const completedMs = Date.parse(input.completedAtIso);

  if (completedMs < startedMs) {
    throw new CarnaubaRunManifestError('completedAtIso cannot be before startedAtIso.');
  }

  const succeededStores = input.result.stores.map((store): CarnaubaRunManifestStoreSummary => {
    return {
      storeId: store.store.storeId,
      storeName: store.store.name,
      status: 'succeeded',
      leafletsFound: store.leaflets.length,
      imagesFound: store.leaflets.reduce((total, leaflet) => total + leaflet.images.length, 0),
      sourceUrl: store.sourceUrl,
      errorMessage: null,
    };
  });
  const failedStores = input.result.failedStores.map((store): CarnaubaRunManifestStoreSummary => {
    return {
      storeId: store.store.storeId,
      storeName: store.store.name,
      status: 'failed',
      leafletsFound: 0,
      imagesFound: 0,
      sourceUrl: store.sourceUrl,
      errorMessage: store.errorMessage,
    };
  });
  const stores = [...succeededStores, ...failedStores];

  return {
    runId: input.runId,
    supermarketId: 'carnauba',
    mode: 'playwright',
    status: createManifestStatus(succeededStores.length, failedStores.length),
    startedAtIso: input.startedAtIso,
    completedAtIso: input.completedAtIso,
    durationMs: completedMs - startedMs,
    outputDirectoryPath: input.outputDirectoryPath,
    metadataPath: input.metadataPath,
    storesProcessed: stores.length,
    storesSucceeded: succeededStores.length,
    storesFailed: failedStores.length,
    leafletsFound: stores.reduce((total, store) => total + store.leafletsFound, 0),
    imagesFound: stores.reduce((total, store) => total + store.imagesFound, 0),
    sharedLeafletsStored: input.stored.sharedLeaflets.length,
    sharedImagesStored: input.stored.sharedLeaflets.reduce(
      (total, leaflet) => total + leaflet.images.length,
      0,
    ),
    visualDataset: input.visualDataset,
    stores,
  };
}

function createManifestStatus(
  storesSucceeded: number,
  storesFailed: number,
): CarnaubaRunManifestStatus {
  if (storesFailed === 0 && storesSucceeded > 0) {
    return 'succeeded';
  }

  if (storesSucceeded > 0) {
    return 'partially_succeeded';
  }

  return 'failed';
}

export async function writeCarnaubaRunManifest(
  outputDirectoryPath: string,
  manifest: CarnaubaRunManifest,
): Promise<string> {
  const manifestPath = join(outputDirectoryPath, 'run.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return manifestPath;
}

function validateIso(value: string, fieldName: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new CarnaubaRunManifestError(`${fieldName} must be a valid ISO date.`);
  }
}
