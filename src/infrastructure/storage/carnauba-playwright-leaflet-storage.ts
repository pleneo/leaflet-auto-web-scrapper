import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ExtractedLeaflet,
  ExtractedLeafletImage,
} from '../../domain/leaflet/extracted-leaflet';
import type {
  CarnaubaPlaywrightExtractedStore,
  CarnaubaPlaywrightExtractionResult,
} from '../scrapers/carnauba/carnauba-playwright-extraction';
import type { LeafletImageContentType, LeafletImageHttpClient } from './leaflet-image-storage';

export interface StoreCarnaubaPlaywrightExtractionInput {
  readonly rootDirectory: string;
  readonly result: CarnaubaPlaywrightExtractionResult;
}

export interface StoredCarnaubaPlaywrightLeafletImage {
  readonly order: number;
  readonly sourceUrl: string;
  readonly canonicalUrl: string;
  readonly filePath: string;
  readonly contentType: LeafletImageContentType;
  readonly byteLength: number;
  readonly contentHash: string;
}

export interface StoredCarnaubaPlaywrightSharedLeaflet {
  readonly contentSignature: string;
  readonly representativeLeafletId: string;
  readonly title: string;
  readonly directoryPath: string;
  readonly metadataPath: string;
  readonly images: readonly StoredCarnaubaPlaywrightLeafletImage[];
}

export interface StoredCarnaubaPlaywrightLeafletReference {
  readonly leafletId: string;
  readonly title: string;
  readonly cardIndex: number;
  readonly coverImageUrl: string;
  readonly contentSignature: string;
  readonly sharedLeafletDirectoryPath: string;
  readonly referencePath: string;
}

export interface StoredCarnaubaPlaywrightStore {
  readonly storeId: number;
  readonly storeName: string;
  readonly sourceUrl: string;
  readonly directoryPath: string;
  readonly metadataPath: string;
  readonly leafletsDirectoryPath: string;
  readonly leaflets: readonly StoredCarnaubaPlaywrightLeafletReference[];
}

export interface StoredCarnaubaPlaywrightExtraction {
  readonly directoryPath: string;
  readonly metadataPath: string;
  readonly sharedLeafletsDirectoryPath: string;
  readonly sharedLeaflets: readonly StoredCarnaubaPlaywrightSharedLeaflet[];
  readonly sharedLeafletsCreated: number;
  readonly sharedLeafletsReused: number;
  readonly sharedImagesDownloaded: number;
  readonly sharedImagesReused: number;
  readonly stores: readonly StoredCarnaubaPlaywrightStore[];
}

interface CachedDownloadedImage {
  readonly canonicalUrl: string;
  readonly filePath: string;
  readonly contentType: LeafletImageContentType;
  readonly byteLength: number;
  readonly contentHash: string;
}

interface PreparedLeafletImage {
  readonly order: number;
  readonly sourceUrl: string;
  readonly canonicalUrl: string;
  readonly filePath: string;
  readonly contentType: LeafletImageContentType;
  readonly byteLength: number;
  readonly contentHash: string;
}

interface PreparedLeaflet {
  readonly leaflet: ExtractedLeaflet;
  readonly contentSignature: string;
  readonly images: readonly PreparedLeafletImage[];
}

interface StorageCounters {
  sharedLeafletsCreated: number;
  sharedLeafletsReused: number;
  sharedImagesDownloaded: number;
  sharedImagesReused: number;
}

interface PersistentImageIndex {
  readonly version: 1;
  readonly images: readonly PersistentImageIndexEntry[];
}

interface PersistentImageIndexEntry {
  readonly canonicalUrl: string;
  readonly filePath: string;
  readonly contentType: LeafletImageContentType;
  readonly byteLength: number;
  readonly contentHash: string;
}

export class CarnaubaPlaywrightLeafletStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CarnaubaPlaywrightLeafletStorageError';
  }
}

export class LocalCarnaubaPlaywrightLeafletStorage {
  private readonly httpClient: LeafletImageHttpClient;

  constructor(httpClient: LeafletImageHttpClient) {
    this.httpClient = httpClient;
  }

  async store(
    input: StoreCarnaubaPlaywrightExtractionInput,
  ): Promise<StoredCarnaubaPlaywrightExtraction> {
    const directoryPath = buildExtractionDirectoryPath(input.rootDirectory, input.result);
    const sharedLeafletsDirectoryPath = buildSharedLeafletsDirectoryPath(input.rootDirectory);
    const sharedImagesDirectoryPath = buildSharedImagesDirectoryPath(input.rootDirectory);
    await mkdir(sharedLeafletsDirectoryPath, {
      recursive: true,
    });
    await mkdir(sharedImagesDirectoryPath, {
      recursive: true,
    });

    const imageCache = await loadPersistentImageCache(input.rootDirectory);
    const sharedLeaflets = new Map<string, StoredCarnaubaPlaywrightSharedLeaflet>();
    const stores: StoredCarnaubaPlaywrightStore[] = [];
    const counters: StorageCounters = {
      sharedLeafletsCreated: 0,
      sharedLeafletsReused: 0,
      sharedImagesDownloaded: 0,
      sharedImagesReused: 0,
    };

    for (const store of input.result.stores) {
      stores.push(
        await this.storeStore(
          directoryPath,
          sharedLeafletsDirectoryPath,
          sharedImagesDirectoryPath,
          store,
          imageCache,
          sharedLeaflets,
          counters,
        ),
      );
    }

    const storedSharedLeaflets = [...sharedLeaflets.values()];
    const metadataPath = join(directoryPath, 'metadata.json');
    const stored = {
      directoryPath,
      metadataPath,
      sharedLeafletsDirectoryPath,
      sharedLeaflets: storedSharedLeaflets,
      sharedLeafletsCreated: counters.sharedLeafletsCreated,
      sharedLeafletsReused: counters.sharedLeafletsReused,
      sharedImagesDownloaded: counters.sharedImagesDownloaded,
      sharedImagesReused: counters.sharedImagesReused,
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
    await savePersistentImageCache(input.rootDirectory, imageCache);

    return stored;
  }

  private async storeStore(
    extractionDirectoryPath: string,
    sharedLeafletsDirectoryPath: string,
    sharedImagesDirectoryPath: string,
    extractedStore: CarnaubaPlaywrightExtractedStore,
    imageCache: Map<string, CachedDownloadedImage>,
    sharedLeaflets: Map<string, StoredCarnaubaPlaywrightSharedLeaflet>,
    counters: StorageCounters,
  ): Promise<StoredCarnaubaPlaywrightStore> {
    const directoryPath = join(
      extractionDirectoryPath,
      'stores',
      `${String(extractedStore.store.storeId)}-${slugify(extractedStore.store.name)}`,
    );
    const leafletsDirectoryPath = join(directoryPath, 'leaflets');
    await mkdir(leafletsDirectoryPath, {
      recursive: true,
    });

    const leaflets: StoredCarnaubaPlaywrightLeafletReference[] = [];

    for (const leaflet of extractedStore.leaflets) {
      const preparedLeaflet = await this.prepareLeaflet(
        leaflet,
        sharedImagesDirectoryPath,
        imageCache,
        counters,
      );
      const sharedLeaflet = await this.ensureSharedLeaflet(
        sharedLeafletsDirectoryPath,
        preparedLeaflet,
        sharedLeaflets,
        counters,
      );
      leaflets.push(
        await storeLeafletReference(leafletsDirectoryPath, preparedLeaflet, sharedLeaflet),
      );
    }

    const metadataPath = join(directoryPath, 'metadata.json');
    const storedStore = {
      storeId: extractedStore.store.storeId,
      storeName: extractedStore.store.name,
      sourceUrl: extractedStore.sourceUrl,
      directoryPath,
      metadataPath,
      leafletsDirectoryPath,
      leaflets,
    };

    await writeFile(
      metadataPath,
      `${JSON.stringify(
        {
          store: extractedStore.store,
          sourceUrl: extractedStore.sourceUrl,
          leaflets: extractedStore.leaflets,
          storage: storedStore,
        },
        null,
        2,
      )}\n`,
    );

    return storedStore;
  }

  private async prepareLeaflet(
    leaflet: ExtractedLeaflet,
    sharedImagesDirectoryPath: string,
    imageCache: Map<string, CachedDownloadedImage>,
    counters: StorageCounters,
  ): Promise<PreparedLeaflet> {
    const images: PreparedLeafletImage[] = [];

    for (const image of leaflet.images) {
      images.push(await this.prepareImage(image, sharedImagesDirectoryPath, imageCache, counters));
    }

    return {
      leaflet,
      contentSignature: createContentSignature(images.map((image) => image.contentHash)),
      images,
    };
  }

  private async prepareImage(
    image: ExtractedLeafletImage,
    sharedImagesDirectoryPath: string,
    imageCache: Map<string, CachedDownloadedImage>,
    counters: StorageCounters,
  ): Promise<PreparedLeafletImage> {
    const canonicalUrl = canonicalizeLeafletImageUrl(image.imageUrl);
    const cachedImage = imageCache.get(canonicalUrl);

    if (cachedImage !== undefined) {
      counters.sharedImagesReused += 1;

      return {
        order: image.order,
        sourceUrl: image.imageUrl,
        canonicalUrl,
        filePath: cachedImage.filePath,
        contentType: cachedImage.contentType,
        byteLength: cachedImage.byteLength,
        contentHash: cachedImage.contentHash,
      };
    }

    const downloadedImage = await this.httpClient.downloadImage(image.imageUrl);
    const contentHash = createHash('sha256').update(downloadedImage.body).digest('hex');
    const filePath = join(
      sharedImagesDirectoryPath,
      `${contentHash}.${getImageExtension(downloadedImage.contentType)}`,
    );
    await writeFile(filePath, downloadedImage.body);
    imageCache.set(canonicalUrl, {
      canonicalUrl,
      filePath,
      contentType: downloadedImage.contentType,
      byteLength: downloadedImage.body.byteLength,
      contentHash,
    });
    counters.sharedImagesDownloaded += 1;

    return {
      order: image.order,
      sourceUrl: image.imageUrl,
      canonicalUrl,
      filePath,
      contentType: downloadedImage.contentType,
      byteLength: downloadedImage.body.byteLength,
      contentHash,
    };
  }

  private async ensureSharedLeaflet(
    sharedLeafletsDirectoryPath: string,
    preparedLeaflet: PreparedLeaflet,
    sharedLeaflets: Map<string, StoredCarnaubaPlaywrightSharedLeaflet>,
    counters: StorageCounters,
  ): Promise<StoredCarnaubaPlaywrightSharedLeaflet> {
    const existingSharedLeaflet = sharedLeaflets.get(preparedLeaflet.contentSignature);

    if (existingSharedLeaflet !== undefined) {
      counters.sharedLeafletsReused += 1;
      return existingSharedLeaflet;
    }

    const directoryPath = join(sharedLeafletsDirectoryPath, preparedLeaflet.contentSignature);
    const metadataPath = join(directoryPath, 'metadata.json');
    const persistedSharedLeaflet = await loadStoredSharedLeaflet(metadataPath);

    if (persistedSharedLeaflet !== null) {
      sharedLeaflets.set(preparedLeaflet.contentSignature, persistedSharedLeaflet);
      counters.sharedLeafletsReused += 1;
      return persistedSharedLeaflet;
    }

    await mkdir(directoryPath, {
      recursive: true,
    });

    const images: StoredCarnaubaPlaywrightLeafletImage[] = [];

    for (const image of preparedLeaflet.images) {
      images.push(storeSharedLeafletImage(image));
    }

    const sharedLeaflet = {
      contentSignature: preparedLeaflet.contentSignature,
      representativeLeafletId: preparedLeaflet.leaflet.leafletId,
      title: preparedLeaflet.leaflet.title,
      directoryPath,
      metadataPath,
      images,
    };

    await writeFile(metadataPath, `${JSON.stringify(sharedLeaflet, null, 2)}\n`);
    sharedLeaflets.set(preparedLeaflet.contentSignature, sharedLeaflet);
    counters.sharedLeafletsCreated += 1;

    return sharedLeaflet;
  }
}

function storeSharedLeafletImage(
  image: PreparedLeafletImage,
): StoredCarnaubaPlaywrightLeafletImage {
  return {
    order: image.order,
    sourceUrl: image.sourceUrl,
    canonicalUrl: image.canonicalUrl,
    filePath: image.filePath,
    contentType: image.contentType,
    byteLength: image.byteLength,
    contentHash: image.contentHash,
  };
}

async function storeLeafletReference(
  leafletsDirectoryPath: string,
  preparedLeaflet: PreparedLeaflet,
  sharedLeaflet: StoredCarnaubaPlaywrightSharedLeaflet,
): Promise<StoredCarnaubaPlaywrightLeafletReference> {
  const referencePath = join(leafletsDirectoryPath, `${preparedLeaflet.leaflet.leafletId}.json`);
  const reference = {
    leafletId: preparedLeaflet.leaflet.leafletId,
    title: preparedLeaflet.leaflet.title,
    cardIndex: preparedLeaflet.leaflet.cardIndex,
    coverImageUrl: preparedLeaflet.leaflet.coverImageUrl,
    contentSignature: preparedLeaflet.contentSignature,
    sharedLeafletDirectoryPath: sharedLeaflet.directoryPath,
    referencePath,
  };

  await writeFile(
    referencePath,
    `${JSON.stringify(
      {
        leaflet: preparedLeaflet.leaflet,
        reference,
      },
      null,
      2,
    )}\n`,
  );

  return reference;
}

function canonicalizeLeafletImageUrl(value: string): string {
  const url = new URL(value.trim());
  url.hash = '';

  for (const key of ['t', 'timestamp', 'cache', 'cacheBust', 'v']) {
    url.searchParams.delete(key);
  }

  url.searchParams.sort();

  return url.toString();
}

function createContentSignature(contentHashes: readonly string[]): string {
  return createHash('sha256').update(contentHashes.join('\n')).digest('hex');
}

function buildExtractionDirectoryPath(
  rootDirectory: string,
  result: CarnaubaPlaywrightExtractionResult,
): string {
  const trimmedRoot = validateRootDirectory(rootDirectory);

  if (!Number.isFinite(Date.parse(result.extractedAtIso))) {
    throw new CarnaubaPlaywrightLeafletStorageError('extractedAtIso must be a valid ISO date.');
  }

  const extractedAtIso = new Date(result.extractedAtIso).toISOString();
  const extractionDate = extractedAtIso.slice(0, 10);
  const extractionHourMinute = extractedAtIso.slice(11, 16).replace(':', '-');

  return join(trimmedRoot, 'carnauba', extractionDate, extractionHourMinute);
}

function buildSharedLeafletsDirectoryPath(rootDirectory: string): string {
  return join(validateRootDirectory(rootDirectory), 'carnauba', 'shared-leaflets');
}

function buildSharedImagesDirectoryPath(rootDirectory: string): string {
  return join(validateRootDirectory(rootDirectory), 'carnauba', 'shared-images');
}

function buildSharedImagesIndexPath(rootDirectory: string): string {
  return join(buildSharedImagesDirectoryPath(rootDirectory), 'index.json');
}

async function loadPersistentImageCache(
  rootDirectory: string,
): Promise<Map<string, CachedDownloadedImage>> {
  const indexPath = buildSharedImagesIndexPath(rootDirectory);

  try {
    const parsed = JSON.parse(await readFile(indexPath, 'utf8')) as PersistentImageIndex;
    return new Map(
      parsed.images.map((image) => [
        image.canonicalUrl,
        {
          canonicalUrl: image.canonicalUrl,
          filePath: image.filePath,
          contentType: image.contentType,
          byteLength: image.byteLength,
          contentHash: image.contentHash,
        },
      ]),
    );
  } catch {
    return new Map();
  }
}

async function savePersistentImageCache(
  rootDirectory: string,
  imageCache: Map<string, CachedDownloadedImage>,
): Promise<void> {
  const indexPath = buildSharedImagesIndexPath(rootDirectory);
  const index: PersistentImageIndex = {
    version: 1,
    images: [...imageCache.values()].map((image) => ({
      canonicalUrl: image.canonicalUrl,
      filePath: image.filePath,
      contentType: image.contentType,
      byteLength: image.byteLength,
      contentHash: image.contentHash,
    })),
  };

  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

async function loadStoredSharedLeaflet(
  metadataPath: string,
): Promise<StoredCarnaubaPlaywrightSharedLeaflet | null> {
  try {
    return JSON.parse(
      await readFile(metadataPath, 'utf8'),
    ) as StoredCarnaubaPlaywrightSharedLeaflet;
  } catch {
    return null;
  }
}

function validateRootDirectory(rootDirectory: string): string {
  const trimmedRoot = rootDirectory.trim();

  if (trimmedRoot.length === 0) {
    throw new CarnaubaPlaywrightLeafletStorageError('rootDirectory cannot be blank.');
  }

  return trimmedRoot;
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
