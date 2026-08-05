import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import type { LeafletImageContentType, LeafletImageHttpClient } from './leaflet-image-storage';

export interface StoreSharedImageGalleryExtractionInput {
  readonly rootDirectory: string;
  readonly supermarketId: SupermarketId;
  readonly extractedAtIso: string;
  readonly units: readonly SharedImageGalleryUnitInput[];
}

export interface SharedImageGalleryUnitInput {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly leaflets: readonly SharedImageGalleryLeafletInput[];
}

export interface SharedImageGalleryLeafletInput {
  readonly leafletId: string;
  readonly title: string;
  readonly coverImageUrl: string;
  readonly imageUrls: readonly string[];
}

export interface StoredSharedImageGalleryExtraction {
  readonly directoryPath: string;
  readonly metadataPath: string;
  readonly sharedImagesDirectoryPath: string;
  readonly sharedLeafletsDirectoryPath: string;
  readonly sharedLeafletsCreated: number;
  readonly sharedLeafletsReused: number;
  readonly sharedImagesDownloaded: number;
  readonly sharedImagesReused: number;
  readonly units: readonly StoredSharedImageGalleryUnit[];
  readonly sharedLeaflets: readonly StoredSharedImageGalleryLeaflet[];
}

export interface StoredSharedImageGalleryUnit {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly directoryPath: string;
  readonly metadataPath: string;
  readonly leafletsDirectoryPath: string;
  readonly leaflets: readonly StoredSharedImageGalleryLeafletReference[];
}

export interface StoredSharedImageGalleryLeafletReference {
  readonly leafletId: string;
  readonly title: string;
  readonly coverImageUrl: string;
  readonly contentSignature: string;
  readonly sharedLeafletDirectoryPath: string;
  readonly referencePath: string;
}

export interface StoredSharedImageGalleryLeaflet {
  readonly contentSignature: string;
  readonly representativeLeafletId: string;
  readonly title: string;
  readonly directoryPath: string;
  readonly metadataPath: string;
  readonly images: readonly StoredSharedImageGalleryImage[];
}

export interface StoredSharedImageGalleryImage {
  readonly order: number;
  readonly sourceUrl: string;
  readonly canonicalUrl: string;
  readonly filePath: string;
  readonly contentType: LeafletImageContentType;
  readonly byteLength: number;
  readonly contentHash: string;
}

interface CachedSharedImage {
  readonly canonicalUrl: string;
  readonly filePath: string;
  readonly contentType: LeafletImageContentType;
  readonly byteLength: number;
  readonly contentHash: string;
}

interface PreparedSharedImageGalleryLeaflet {
  readonly leaflet: SharedImageGalleryLeafletInput;
  readonly contentSignature: string;
  readonly images: readonly StoredSharedImageGalleryImage[];
}

interface SharedImageGalleryCounters {
  sharedLeafletsCreated: number;
  sharedLeafletsReused: number;
  sharedImagesDownloaded: number;
  sharedImagesReused: number;
}

interface PersistentSharedImageIndex {
  readonly version: 1;
  readonly images: readonly CachedSharedImage[];
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

export class SharedImageGalleryStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SharedImageGalleryStorageError';
  }
}

export class LocalSharedImageGalleryStorage {
  private readonly httpClient: LeafletImageHttpClient;

  constructor(httpClient: LeafletImageHttpClient) {
    this.httpClient = httpClient;
  }

  async store(
    input: StoreSharedImageGalleryExtractionInput,
  ): Promise<StoredSharedImageGalleryExtraction> {
    validateInput(input);
    const directoryPath = buildExtractionDirectoryPath(input);
    const sharedImagesDirectoryPath = buildSharedImagesDirectoryPath(input);
    const sharedLeafletsDirectoryPath = buildSharedLeafletsDirectoryPath(input);
    await mkdir(directoryPath, { recursive: true });
    await mkdir(sharedImagesDirectoryPath, { recursive: true });
    await mkdir(sharedLeafletsDirectoryPath, { recursive: true });

    const imageCache = await loadPersistentImageCache(input);
    const sharedLeaflets = new Map<string, StoredSharedImageGalleryLeaflet>();
    const counters: SharedImageGalleryCounters = {
      sharedLeafletsCreated: 0,
      sharedLeafletsReused: 0,
      sharedImagesDownloaded: 0,
      sharedImagesReused: 0,
    };
    const units: StoredSharedImageGalleryUnit[] = [];

    for (const unit of input.units) {
      units.push(
        await this.storeUnit(
          directoryPath,
          sharedImagesDirectoryPath,
          sharedLeafletsDirectoryPath,
          unit,
          imageCache,
          sharedLeaflets,
          counters,
        ),
      );
    }

    await savePersistentImageCache(input, imageCache);

    const stored = {
      directoryPath,
      metadataPath: join(directoryPath, 'metadata.json'),
      sharedImagesDirectoryPath,
      sharedLeafletsDirectoryPath,
      sharedLeafletsCreated: counters.sharedLeafletsCreated,
      sharedLeafletsReused: counters.sharedLeafletsReused,
      sharedImagesDownloaded: counters.sharedImagesDownloaded,
      sharedImagesReused: counters.sharedImagesReused,
      units,
      sharedLeaflets: [...sharedLeaflets.values()],
    };

    await writeFile(
      stored.metadataPath,
      `${JSON.stringify({ input, storage: stored }, null, 2)}\n`,
    );

    return stored;
  }

  private async storeUnit(
    extractionDirectoryPath: string,
    sharedImagesDirectoryPath: string,
    sharedLeafletsDirectoryPath: string,
    unit: SharedImageGalleryUnitInput,
    imageCache: Map<string, CachedSharedImage>,
    sharedLeaflets: Map<string, StoredSharedImageGalleryLeaflet>,
    counters: SharedImageGalleryCounters,
  ): Promise<StoredSharedImageGalleryUnit> {
    const directoryPath = join(
      extractionDirectoryPath,
      'units',
      `${unit.unitId}-${slugify(unit.unitName)}`,
    );
    const leafletsDirectoryPath = join(directoryPath, 'leaflets');
    await mkdir(leafletsDirectoryPath, { recursive: true });

    const leafletReferences: StoredSharedImageGalleryLeafletReference[] = [];

    for (const leaflet of unit.leaflets) {
      const preparedLeaflet = await this.prepareLeaflet(
        leaflet,
        sharedImagesDirectoryPath,
        imageCache,
        counters,
      );
      const sharedLeaflet = await ensureSharedLeaflet(
        sharedLeafletsDirectoryPath,
        preparedLeaflet,
        sharedLeaflets,
        counters,
      );
      leafletReferences.push(
        await storeLeafletReference(leafletsDirectoryPath, preparedLeaflet, sharedLeaflet),
      );
    }

    const storedUnit = {
      unitId: unit.unitId,
      unitName: unit.unitName,
      sourceUrl: unit.sourceUrl,
      directoryPath,
      metadataPath: join(directoryPath, 'metadata.json'),
      leafletsDirectoryPath,
      leaflets: leafletReferences,
    };

    await writeFile(
      storedUnit.metadataPath,
      `${JSON.stringify({ unit, storage: storedUnit }, null, 2)}\n`,
    );

    return storedUnit;
  }

  private async prepareLeaflet(
    leaflet: SharedImageGalleryLeafletInput,
    sharedImagesDirectoryPath: string,
    imageCache: Map<string, CachedSharedImage>,
    counters: SharedImageGalleryCounters,
  ): Promise<PreparedSharedImageGalleryLeaflet> {
    const images: StoredSharedImageGalleryImage[] = [];

    for (const [index, imageUrl] of leaflet.imageUrls.entries()) {
      images.push(
        await this.prepareImage(
          index + 1,
          imageUrl,
          sharedImagesDirectoryPath,
          imageCache,
          counters,
        ),
      );
    }

    return {
      leaflet,
      contentSignature: createContentSignature(images.map((image) => image.contentHash)),
      images,
    };
  }

  private async prepareImage(
    order: number,
    sourceUrl: string,
    sharedImagesDirectoryPath: string,
    imageCache: Map<string, CachedSharedImage>,
    counters: SharedImageGalleryCounters,
  ): Promise<StoredSharedImageGalleryImage> {
    const canonicalUrl = canonicalizeImageUrl(sourceUrl);
    const cachedImage = imageCache.get(canonicalUrl);

    if (cachedImage !== undefined) {
      counters.sharedImagesReused += 1;
      return {
        order,
        sourceUrl,
        ...cachedImage,
      };
    }

    const downloadedImage = await this.httpClient.downloadImage(sourceUrl);
    const contentHash = createHash('sha256').update(downloadedImage.body).digest('hex');
    const filePath = join(
      sharedImagesDirectoryPath,
      `${contentHash}.${getImageExtension(downloadedImage.contentType)}`,
    );
    await writeFile(filePath, downloadedImage.body);

    const cached: CachedSharedImage = {
      canonicalUrl,
      filePath,
      contentType: downloadedImage.contentType,
      byteLength: downloadedImage.body.byteLength,
      contentHash,
    };
    imageCache.set(canonicalUrl, cached);
    counters.sharedImagesDownloaded += 1;

    return {
      order,
      sourceUrl,
      ...cached,
    };
  }
}

async function ensureSharedLeaflet(
  sharedLeafletsDirectoryPath: string,
  preparedLeaflet: PreparedSharedImageGalleryLeaflet,
  sharedLeaflets: Map<string, StoredSharedImageGalleryLeaflet>,
  counters: SharedImageGalleryCounters,
): Promise<StoredSharedImageGalleryLeaflet> {
  const existingSharedLeaflet = sharedLeaflets.get(preparedLeaflet.contentSignature);

  if (existingSharedLeaflet !== undefined) {
    counters.sharedLeafletsReused += 1;
    return existingSharedLeaflet;
  }

  const directoryPath = join(sharedLeafletsDirectoryPath, preparedLeaflet.contentSignature);
  const metadataPath = join(directoryPath, 'metadata.json');
  const persistedSharedLeaflet = await loadSharedLeaflet(metadataPath);

  if (persistedSharedLeaflet !== null) {
    sharedLeaflets.set(preparedLeaflet.contentSignature, persistedSharedLeaflet);
    counters.sharedLeafletsReused += 1;
    return persistedSharedLeaflet;
  }

  await mkdir(directoryPath, { recursive: true });
  const sharedLeaflet = {
    contentSignature: preparedLeaflet.contentSignature,
    representativeLeafletId: preparedLeaflet.leaflet.leafletId,
    title: preparedLeaflet.leaflet.title,
    directoryPath,
    metadataPath,
    images: preparedLeaflet.images,
  };

  await writeFile(metadataPath, `${JSON.stringify(sharedLeaflet, null, 2)}\n`);
  sharedLeaflets.set(preparedLeaflet.contentSignature, sharedLeaflet);
  counters.sharedLeafletsCreated += 1;

  return sharedLeaflet;
}

async function storeLeafletReference(
  leafletsDirectoryPath: string,
  preparedLeaflet: PreparedSharedImageGalleryLeaflet,
  sharedLeaflet: StoredSharedImageGalleryLeaflet,
): Promise<StoredSharedImageGalleryLeafletReference> {
  const reference = {
    leafletId: preparedLeaflet.leaflet.leafletId,
    title: preparedLeaflet.leaflet.title,
    coverImageUrl: preparedLeaflet.leaflet.coverImageUrl,
    contentSignature: preparedLeaflet.contentSignature,
    sharedLeafletDirectoryPath: sharedLeaflet.directoryPath,
    referencePath: join(leafletsDirectoryPath, `${preparedLeaflet.leaflet.leafletId}.json`),
  };

  await writeFile(
    reference.referencePath,
    `${JSON.stringify({ leaflet: preparedLeaflet.leaflet, reference }, null, 2)}\n`,
  );

  return reference;
}

function validateInput(input: StoreSharedImageGalleryExtractionInput): void {
  validateNonBlank(input.rootDirectory, 'rootDirectory');
  validateNonBlank(input.supermarketId, 'supermarketId');

  if (!Number.isFinite(Date.parse(input.extractedAtIso))) {
    throw new SharedImageGalleryStorageError('extractedAtIso must be a valid ISO date.');
  }
}

async function loadPersistentImageCache(
  input: StoreSharedImageGalleryExtractionInput,
): Promise<Map<string, CachedSharedImage>> {
  try {
    const parsed = JSON.parse(
      await readFile(buildSharedImagesIndexPath(input), 'utf8'),
    ) as JsonValue;

    const index = parsePersistentSharedImageIndex(parsed);

    if (index === null) {
      return new Map();
    }

    return new Map(index.images.map((image) => [image.canonicalUrl, image]));
  } catch {
    return new Map();
  }
}

function parsePersistentSharedImageIndex(value: JsonValue): PersistentSharedImageIndex | null {
  if (!isJsonObject(value) || value['version'] !== 1) {
    return null;
  }

  const imageValues = value['images'];

  if (!isJsonArray(imageValues)) {
    return null;
  }

  const images: CachedSharedImage[] = [];

  for (const imageValue of imageValues) {
    const image = parseCachedSharedImage(imageValue);

    if (image === null) {
      return null;
    }

    images.push(image);
  }

  return {
    version: 1,
    images,
  };
}

function parseCachedSharedImage(value: JsonValue): CachedSharedImage | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const canonicalUrl = value['canonicalUrl'];
  const filePath = value['filePath'];
  const contentType = value['contentType'];
  const byteLength = value['byteLength'];
  const contentHash = value['contentHash'];

  if (
    typeof canonicalUrl !== 'string' ||
    typeof filePath !== 'string' ||
    !isLeafletImageContentType(contentType) ||
    typeof byteLength !== 'number' ||
    typeof contentHash !== 'string'
  ) {
    return null;
  }

  return {
    canonicalUrl,
    filePath,
    contentType,
    byteLength,
    contentHash,
  };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isLeafletImageContentType(value: JsonValue | undefined): value is LeafletImageContentType {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

async function savePersistentImageCache(
  input: StoreSharedImageGalleryExtractionInput,
  imageCache: Map<string, CachedSharedImage>,
): Promise<void> {
  const index: PersistentSharedImageIndex = {
    version: 1,
    images: [...imageCache.values()],
  };

  await writeFile(buildSharedImagesIndexPath(input), `${JSON.stringify(index, null, 2)}\n`);
}

async function loadSharedLeaflet(
  metadataPath: string,
): Promise<StoredSharedImageGalleryLeaflet | null> {
  try {
    return JSON.parse(await readFile(metadataPath, 'utf8')) as StoredSharedImageGalleryLeaflet;
  } catch {
    return null;
  }
}

function buildExtractionDirectoryPath(input: StoreSharedImageGalleryExtractionInput): string {
  const extractedAtIso = new Date(input.extractedAtIso).toISOString();
  return join(
    input.rootDirectory.trim(),
    input.supermarketId,
    extractedAtIso.slice(0, 10),
    extractedAtIso.slice(11, 16).replace(':', '-'),
  );
}

function buildSharedImagesDirectoryPath(input: StoreSharedImageGalleryExtractionInput): string {
  return join(input.rootDirectory.trim(), input.supermarketId, 'shared-images');
}

function buildSharedLeafletsDirectoryPath(input: StoreSharedImageGalleryExtractionInput): string {
  return join(input.rootDirectory.trim(), input.supermarketId, 'shared-leaflets');
}

function buildSharedImagesIndexPath(input: StoreSharedImageGalleryExtractionInput): string {
  return join(buildSharedImagesDirectoryPath(input), 'index.json');
}

function canonicalizeImageUrl(value: string): string {
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

function validateNonBlank(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new SharedImageGalleryStorageError(`${fieldName} cannot be blank.`);
  }
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : 'unit';
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
