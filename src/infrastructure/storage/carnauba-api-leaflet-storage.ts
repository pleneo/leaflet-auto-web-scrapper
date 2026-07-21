import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CarnaubaApiExtractedImage,
  CarnaubaApiExtractedLeaflet,
  CarnaubaApiExtractedStore,
  CarnaubaApiExtractionResult,
} from '../scrapers/carnauba/carnauba-api-extraction';
import type { LeafletImageContentType, LeafletImageHttpClient } from './leaflet-image-storage';

export interface StoreCarnaubaApiExtractionInput {
  readonly rootDirectory: string;
  readonly result: CarnaubaApiExtractionResult;
}

export interface StoredCarnaubaApiLeafletImage {
  readonly order: number;
  readonly sourceUrl: string;
  readonly filePath: string;
  readonly contentType: LeafletImageContentType;
  readonly byteLength: number;
}

export interface StoredCarnaubaApiLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly directoryPath: string;
  readonly images: readonly StoredCarnaubaApiLeafletImage[];
}

export interface StoredCarnaubaApiStore {
  readonly storeId: number;
  readonly storeName: string;
  readonly directoryPath: string;
  readonly metadataPath: string;
  readonly leaflets: readonly StoredCarnaubaApiLeaflet[];
}

export interface StoredCarnaubaApiExtraction {
  readonly directoryPath: string;
  readonly metadataPath: string;
  readonly stores: readonly StoredCarnaubaApiStore[];
}

export class CarnaubaApiLeafletStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CarnaubaApiLeafletStorageError';
  }
}

export class LocalCarnaubaApiLeafletStorage {
  private readonly httpClient: LeafletImageHttpClient;

  constructor(httpClient: LeafletImageHttpClient) {
    this.httpClient = httpClient;
  }

  async store(input: StoreCarnaubaApiExtractionInput): Promise<StoredCarnaubaApiExtraction> {
    const directoryPath = buildExtractionDirectoryPath(input.rootDirectory, input.result);
    await mkdir(directoryPath, {
      recursive: true,
    });

    const stores: StoredCarnaubaApiStore[] = [];

    for (const store of input.result.stores) {
      stores.push(await this.storeStore(directoryPath, store));
    }

    const metadataPath = join(directoryPath, 'metadata.json');
    const stored = {
      directoryPath,
      metadataPath,
      stores,
    };

    await writeFile(
      metadataPath,
      `${JSON.stringify(
        {
          extraction: input.result,
          storage: stored,
        },
        null,
        2,
      )}\n`,
    );

    return stored;
  }

  private async storeStore(
    extractionDirectoryPath: string,
    extractedStore: CarnaubaApiExtractedStore,
  ): Promise<StoredCarnaubaApiStore> {
    const directoryPath = join(
      extractionDirectoryPath,
      'stores',
      `${String(extractedStore.store.storeId)}-${slugify(extractedStore.store.name)}`,
    );
    const leafletsDirectoryPath = join(directoryPath, 'leaflets');
    await mkdir(leafletsDirectoryPath, {
      recursive: true,
    });

    const leaflets: StoredCarnaubaApiLeaflet[] = [];

    for (const leaflet of extractedStore.leaflets) {
      leaflets.push(await this.storeLeaflet(leafletsDirectoryPath, leaflet));
    }

    const metadataPath = join(directoryPath, 'metadata.json');
    const storedStore = {
      storeId: extractedStore.store.storeId,
      storeName: extractedStore.store.name,
      directoryPath,
      metadataPath,
      leaflets,
    };

    await writeFile(
      metadataPath,
      `${JSON.stringify(
        {
          store: extractedStore.store,
          leaflets: extractedStore.leaflets,
          storage: storedStore,
        },
        null,
        2,
      )}\n`,
    );

    return storedStore;
  }

  private async storeLeaflet(
    leafletsDirectoryPath: string,
    leaflet: CarnaubaApiExtractedLeaflet,
  ): Promise<StoredCarnaubaApiLeaflet> {
    const directoryPath = join(leafletsDirectoryPath, leaflet.leafletId);
    await mkdir(directoryPath, {
      recursive: true,
    });

    const images: StoredCarnaubaApiLeafletImage[] = [];

    for (const image of leaflet.images) {
      images.push(await this.storeImage(directoryPath, image));
    }

    return {
      leafletId: leaflet.leafletId,
      title: leaflet.title,
      directoryPath,
      images,
    };
  }

  private async storeImage(
    leafletDirectoryPath: string,
    image: CarnaubaApiExtractedImage,
  ): Promise<StoredCarnaubaApiLeafletImage> {
    const downloadedImage = await this.httpClient.downloadImage(image.imageUrl);
    const filePath = join(
      leafletDirectoryPath,
      `${image.order.toString().padStart(3, '0')}.${getImageExtension(downloadedImage.contentType)}`,
    );

    await writeFile(filePath, downloadedImage.body);

    return {
      order: image.order,
      sourceUrl: image.imageUrl,
      filePath,
      contentType: downloadedImage.contentType,
      byteLength: downloadedImage.body.byteLength,
    };
  }
}

function buildExtractionDirectoryPath(
  rootDirectory: string,
  result: CarnaubaApiExtractionResult,
): string {
  const trimmedRoot = rootDirectory.trim();

  if (trimmedRoot.length === 0) {
    throw new CarnaubaApiLeafletStorageError('rootDirectory cannot be blank.');
  }

  if (!Number.isFinite(Date.parse(result.extractedAtIso))) {
    throw new CarnaubaApiLeafletStorageError('extractedAtIso must be a valid ISO date.');
  }

  const extractedAtIso = new Date(result.extractedAtIso).toISOString();
  const extractionDate = extractedAtIso.slice(0, 10);
  const extractionHourMinute = extractedAtIso.slice(11, 16).replace(':', '-');

  return join(trimmedRoot, 'carnauba', extractionDate, extractionHourMinute);
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length === 0) {
    return 'store';
  }

  return slug;
}

function getImageExtension(contentType: LeafletImageContentType): string {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
  }
}
