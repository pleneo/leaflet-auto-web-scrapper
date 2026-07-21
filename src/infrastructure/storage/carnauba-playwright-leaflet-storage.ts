import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ExtractedLeaflet,
  ExtractedLeafletImage,
} from '../../domain/leaflet/extracted-leaflet';
import type {
  CarnaubaPlaywrightExtractedStore,
  CarnaubaPlaywrightExtractionResult,
} from '../scrapers/carnauba/carnauba-playwright-extraction';
import type {
  DownloadedLeafletImage,
  LeafletImageContentType,
  LeafletImageHttpClient,
} from './leaflet-image-storage';

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
  readonly stores: readonly StoredCarnaubaPlaywrightStore[];
}

interface CachedDownloadedImage {
  readonly canonicalUrl: string;
  readonly downloadedImage: DownloadedLeafletImage;
  readonly contentHash: string;
}

interface PreparedLeafletImage {
  readonly order: number;
  readonly sourceUrl: string;
  readonly canonicalUrl: string;
  readonly downloadedImage: DownloadedLeafletImage;
  readonly contentHash: string;
}

interface PreparedLeaflet {
  readonly leaflet: ExtractedLeaflet;
  readonly contentSignature: string;
  readonly images: readonly PreparedLeafletImage[];
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
    const sharedLeafletsDirectoryPath = join(directoryPath, 'shared-leaflets');
    await mkdir(sharedLeafletsDirectoryPath, {
      recursive: true,
    });

    const imageCache = new Map<string, CachedDownloadedImage>();
    const sharedLeaflets = new Map<string, StoredCarnaubaPlaywrightSharedLeaflet>();
    const stores: StoredCarnaubaPlaywrightStore[] = [];

    for (const store of input.result.stores) {
      stores.push(
        await this.storeStore(
          directoryPath,
          sharedLeafletsDirectoryPath,
          store,
          imageCache,
          sharedLeaflets,
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
    sharedLeafletsDirectoryPath: string,
    extractedStore: CarnaubaPlaywrightExtractedStore,
    imageCache: Map<string, CachedDownloadedImage>,
    sharedLeaflets: Map<string, StoredCarnaubaPlaywrightSharedLeaflet>,
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
      const preparedLeaflet = await this.prepareLeaflet(leaflet, imageCache);
      const sharedLeaflet = await this.ensureSharedLeaflet(
        sharedLeafletsDirectoryPath,
        preparedLeaflet,
        sharedLeaflets,
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
    imageCache: Map<string, CachedDownloadedImage>,
  ): Promise<PreparedLeaflet> {
    const images: PreparedLeafletImage[] = [];

    for (const image of leaflet.images) {
      images.push(await this.prepareImage(image, imageCache));
    }

    return {
      leaflet,
      contentSignature: createContentSignature(images.map((image) => image.contentHash)),
      images,
    };
  }

  private async prepareImage(
    image: ExtractedLeafletImage,
    imageCache: Map<string, CachedDownloadedImage>,
  ): Promise<PreparedLeafletImage> {
    const canonicalUrl = canonicalizeLeafletImageUrl(image.imageUrl);
    const cachedImage = imageCache.get(canonicalUrl);

    if (cachedImage !== undefined) {
      return {
        order: image.order,
        sourceUrl: image.imageUrl,
        canonicalUrl,
        downloadedImage: cachedImage.downloadedImage,
        contentHash: cachedImage.contentHash,
      };
    }

    const downloadedImage = await this.httpClient.downloadImage(image.imageUrl);
    const contentHash = createHash('sha256').update(downloadedImage.body).digest('hex');
    imageCache.set(canonicalUrl, {
      canonicalUrl,
      downloadedImage,
      contentHash,
    });

    return {
      order: image.order,
      sourceUrl: image.imageUrl,
      canonicalUrl,
      downloadedImage,
      contentHash,
    };
  }

  private async ensureSharedLeaflet(
    sharedLeafletsDirectoryPath: string,
    preparedLeaflet: PreparedLeaflet,
    sharedLeaflets: Map<string, StoredCarnaubaPlaywrightSharedLeaflet>,
  ): Promise<StoredCarnaubaPlaywrightSharedLeaflet> {
    const existingSharedLeaflet = sharedLeaflets.get(preparedLeaflet.contentSignature);

    if (existingSharedLeaflet !== undefined) {
      return existingSharedLeaflet;
    }

    const directoryPath = join(sharedLeafletsDirectoryPath, preparedLeaflet.contentSignature);
    await mkdir(directoryPath, {
      recursive: true,
    });

    const images: StoredCarnaubaPlaywrightLeafletImage[] = [];

    for (const image of preparedLeaflet.images) {
      images.push(await storeSharedLeafletImage(directoryPath, image));
    }

    const metadataPath = join(directoryPath, 'metadata.json');
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

    return sharedLeaflet;
  }
}

async function storeSharedLeafletImage(
  sharedLeafletDirectoryPath: string,
  image: PreparedLeafletImage,
): Promise<StoredCarnaubaPlaywrightLeafletImage> {
  const filePath = join(
    sharedLeafletDirectoryPath,
    `${image.order.toString().padStart(3, '0')}.${getImageExtension(image.downloadedImage.contentType)}`,
  );

  await writeFile(filePath, image.downloadedImage.body);

  return {
    order: image.order,
    sourceUrl: image.sourceUrl,
    canonicalUrl: image.canonicalUrl,
    filePath,
    contentType: image.downloadedImage.contentType,
    byteLength: image.downloadedImage.body.byteLength,
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
  const trimmedRoot = rootDirectory.trim();

  if (trimmedRoot.length === 0) {
    throw new CarnaubaPlaywrightLeafletStorageError('rootDirectory cannot be blank.');
  }

  if (!Number.isFinite(Date.parse(result.extractedAtIso))) {
    throw new CarnaubaPlaywrightLeafletStorageError('extractedAtIso must be a valid ISO date.');
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
