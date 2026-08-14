import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';

export type LeafletPdfContentType = 'application/pdf';

export interface DownloadedLeafletPdf {
  readonly body: Uint8Array;
  readonly contentType: LeafletPdfContentType;
}

export interface LeafletPdfHttpClient {
  downloadPdf(url: string): Promise<DownloadedLeafletPdf>;
}

export interface StoreSharedPdfLeafletExtractionInput {
  readonly rootDirectory: string;
  readonly supermarketId: SupermarketId;
  readonly extractedAtIso: string;
  readonly units: readonly SharedPdfLeafletUnitInput[];
}

export interface SharedPdfLeafletUnitInput {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly leaflets: readonly SharedPdfLeafletInput[];
}

export interface SharedPdfLeafletInput {
  readonly leafletId: string;
  readonly title: string;
  readonly pdfUrl: string;
}

export interface StoredSharedPdfLeafletExtraction {
  readonly directoryPath: string;
  readonly metadataPath: string;
  readonly sharedPdfsDirectoryPath: string;
  readonly sharedLeafletsCreated: number;
  readonly sharedLeafletsReused: number;
  readonly sharedPdfsDownloaded: number;
  readonly sharedPdfsReused: number;
  readonly units: readonly StoredSharedPdfLeafletUnit[];
  readonly sharedLeaflets: readonly StoredSharedPdfLeaflet[];
}

export interface StoredSharedPdfLeafletUnit {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly directoryPath: string;
  readonly metadataPath: string;
  readonly leafletsDirectoryPath: string;
  readonly leaflets: readonly StoredSharedPdfLeafletReference[];
}

export interface StoredSharedPdfLeafletReference {
  readonly leafletId: string;
  readonly title: string;
  readonly pdfUrl: string;
  readonly contentSignature: string;
  readonly sharedLeafletDirectoryPath: string;
  readonly referencePath: string;
}

export interface StoredSharedPdfLeaflet {
  readonly contentSignature: string;
  readonly representativeLeafletId: string;
  readonly title: string;
  readonly directoryPath: string;
  readonly metadataPath: string;
  readonly pdf: StoredSharedPdf;
}

export interface StoredSharedPdf {
  readonly sourceUrl: string;
  readonly canonicalUrl: string;
  readonly filePath: string;
  readonly contentType: LeafletPdfContentType;
  readonly byteLength: number;
  readonly contentHash: string;
}

interface CachedSharedPdf {
  readonly canonicalUrl: string;
  readonly filePath: string;
  readonly contentType: LeafletPdfContentType;
  readonly byteLength: number;
  readonly contentHash: string;
}

interface PreparedSharedPdfLeaflet {
  readonly leaflet: SharedPdfLeafletInput;
  readonly contentSignature: string;
  readonly pdf: StoredSharedPdf;
}

interface SharedPdfCounters {
  sharedLeafletsCreated: number;
  sharedLeafletsReused: number;
  sharedPdfsDownloaded: number;
  sharedPdfsReused: number;
}

interface PersistentSharedPdfIndex {
  readonly version: 1;
  readonly pdfs: readonly CachedSharedPdf[];
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

export class LeafletPdfStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeafletPdfStorageError';
  }
}

export class LocalSharedPdfLeafletStorage {
  private readonly httpClient: LeafletPdfHttpClient;

  constructor(httpClient: LeafletPdfHttpClient) {
    this.httpClient = httpClient;
  }

  async store(
    input: StoreSharedPdfLeafletExtractionInput,
  ): Promise<StoredSharedPdfLeafletExtraction> {
    validateInput(input);
    const directoryPath = buildExtractionDirectoryPath(input);
    const sharedPdfsDirectoryPath = buildSharedPdfsDirectoryPath(input);
    const sharedLeafletsDirectoryPath = buildSharedLeafletsDirectoryPath(input);
    await mkdir(directoryPath, { recursive: true });
    await mkdir(sharedPdfsDirectoryPath, { recursive: true });
    await mkdir(sharedLeafletsDirectoryPath, { recursive: true });

    const pdfCache = await loadPersistentPdfCache(input);
    const sharedLeaflets = new Map<string, StoredSharedPdfLeaflet>();
    const counters: SharedPdfCounters = {
      sharedLeafletsCreated: 0,
      sharedLeafletsReused: 0,
      sharedPdfsDownloaded: 0,
      sharedPdfsReused: 0,
    };
    const units: StoredSharedPdfLeafletUnit[] = [];

    for (const unit of input.units) {
      units.push(
        await this.storeUnit(
          directoryPath,
          sharedPdfsDirectoryPath,
          sharedLeafletsDirectoryPath,
          unit,
          pdfCache,
          sharedLeaflets,
          counters,
        ),
      );
    }

    await savePersistentPdfCache(input, pdfCache);

    const stored = {
      directoryPath,
      metadataPath: join(directoryPath, 'metadata.json'),
      sharedPdfsDirectoryPath,
      sharedLeafletsCreated: counters.sharedLeafletsCreated,
      sharedLeafletsReused: counters.sharedLeafletsReused,
      sharedPdfsDownloaded: counters.sharedPdfsDownloaded,
      sharedPdfsReused: counters.sharedPdfsReused,
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
    sharedPdfsDirectoryPath: string,
    sharedLeafletsDirectoryPath: string,
    unit: SharedPdfLeafletUnitInput,
    pdfCache: Map<string, CachedSharedPdf>,
    sharedLeaflets: Map<string, StoredSharedPdfLeaflet>,
    counters: SharedPdfCounters,
  ): Promise<StoredSharedPdfLeafletUnit> {
    const directoryPath = join(
      extractionDirectoryPath,
      'units',
      `${unit.unitId}-${slugify(unit.unitName)}`,
    );
    const leafletsDirectoryPath = join(directoryPath, 'leaflets');
    await mkdir(leafletsDirectoryPath, { recursive: true });

    const leafletReferences: StoredSharedPdfLeafletReference[] = [];

    for (const leaflet of unit.leaflets) {
      const preparedLeaflet = await this.prepareLeaflet(
        leaflet,
        sharedPdfsDirectoryPath,
        pdfCache,
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
    leaflet: SharedPdfLeafletInput,
    sharedPdfsDirectoryPath: string,
    pdfCache: Map<string, CachedSharedPdf>,
    counters: SharedPdfCounters,
  ): Promise<PreparedSharedPdfLeaflet> {
    const pdf = await this.preparePdf(leaflet.pdfUrl, sharedPdfsDirectoryPath, pdfCache, counters);

    return {
      leaflet,
      contentSignature: pdf.contentHash,
      pdf,
    };
  }

  private async preparePdf(
    sourceUrl: string,
    sharedPdfsDirectoryPath: string,
    pdfCache: Map<string, CachedSharedPdf>,
    counters: SharedPdfCounters,
  ): Promise<StoredSharedPdf> {
    const canonicalUrl = canonicalizePdfUrl(sourceUrl);
    const cachedPdf = pdfCache.get(canonicalUrl);

    if (cachedPdf !== undefined && (await cachedPdfExists(cachedPdf))) {
      counters.sharedPdfsReused += 1;
      return {
        sourceUrl,
        ...cachedPdf,
      };
    }

    if (cachedPdf !== undefined) {
      pdfCache.delete(canonicalUrl);
    }

    const downloadedPdf = await this.httpClient.downloadPdf(sourceUrl);
    const contentHash = createHash('sha256').update(downloadedPdf.body).digest('hex');
    const filePath = join(sharedPdfsDirectoryPath, `${contentHash}.pdf`);
    await writeFile(filePath, downloadedPdf.body);

    const cached: CachedSharedPdf = {
      canonicalUrl,
      filePath,
      contentType: downloadedPdf.contentType,
      byteLength: downloadedPdf.body.byteLength,
      contentHash,
    };
    pdfCache.set(canonicalUrl, cached);
    counters.sharedPdfsDownloaded += 1;

    return {
      sourceUrl,
      ...cached,
    };
  }
}

async function cachedPdfExists(pdf: CachedSharedPdf): Promise<boolean> {
  try {
    const fileStats = await stat(pdf.filePath);

    if (!fileStats.isFile() || fileStats.size !== pdf.byteLength) {
      return false;
    }

    const body = await readFile(pdf.filePath);
    const contentHash = createHash('sha256').update(body).digest('hex');

    return contentHash === pdf.contentHash;
  } catch {
    return false;
  }
}

async function ensureSharedLeaflet(
  sharedLeafletsDirectoryPath: string,
  preparedLeaflet: PreparedSharedPdfLeaflet,
  sharedLeaflets: Map<string, StoredSharedPdfLeaflet>,
  counters: SharedPdfCounters,
): Promise<StoredSharedPdfLeaflet> {
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
    pdf: preparedLeaflet.pdf,
  };

  await writeFile(metadataPath, `${JSON.stringify(sharedLeaflet, null, 2)}\n`);
  sharedLeaflets.set(preparedLeaflet.contentSignature, sharedLeaflet);
  counters.sharedLeafletsCreated += 1;

  return sharedLeaflet;
}

async function storeLeafletReference(
  leafletsDirectoryPath: string,
  preparedLeaflet: PreparedSharedPdfLeaflet,
  sharedLeaflet: StoredSharedPdfLeaflet,
): Promise<StoredSharedPdfLeafletReference> {
  const reference = {
    leafletId: preparedLeaflet.leaflet.leafletId,
    title: preparedLeaflet.leaflet.title,
    pdfUrl: preparedLeaflet.leaflet.pdfUrl,
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

function validateInput(input: StoreSharedPdfLeafletExtractionInput): void {
  validateNonBlank(input.rootDirectory, 'rootDirectory');
  validateNonBlank(input.supermarketId, 'supermarketId');

  if (!Number.isFinite(Date.parse(input.extractedAtIso))) {
    throw new LeafletPdfStorageError('extractedAtIso must be a valid ISO date.');
  }
}

async function loadPersistentPdfCache(
  input: StoreSharedPdfLeafletExtractionInput,
): Promise<Map<string, CachedSharedPdf>> {
  try {
    const parsed = JSON.parse(await readFile(buildSharedPdfsIndexPath(input), 'utf8')) as JsonValue;
    const index = parsePersistentSharedPdfIndex(parsed);

    if (index === null) {
      return new Map();
    }

    return new Map(index.pdfs.map((pdf) => [pdf.canonicalUrl, pdf]));
  } catch {
    return new Map();
  }
}

function parsePersistentSharedPdfIndex(value: JsonValue): PersistentSharedPdfIndex | null {
  if (!isJsonObject(value) || value['version'] !== 1) {
    return null;
  }

  const pdfValues = value['pdfs'];

  if (!isJsonArray(pdfValues)) {
    return null;
  }

  const pdfs: CachedSharedPdf[] = [];

  for (const pdfValue of pdfValues) {
    const pdf = parseCachedSharedPdf(pdfValue);

    if (pdf === null) {
      return null;
    }

    pdfs.push(pdf);
  }

  return {
    version: 1,
    pdfs,
  };
}

function parseCachedSharedPdf(value: JsonValue): CachedSharedPdf | null {
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
    contentType !== 'application/pdf' ||
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

async function savePersistentPdfCache(
  input: StoreSharedPdfLeafletExtractionInput,
  pdfCache: Map<string, CachedSharedPdf>,
): Promise<void> {
  const index: PersistentSharedPdfIndex = {
    version: 1,
    pdfs: [...pdfCache.values()],
  };

  await writeFile(buildSharedPdfsIndexPath(input), `${JSON.stringify(index, null, 2)}\n`);
}

async function loadSharedLeaflet(metadataPath: string): Promise<StoredSharedPdfLeaflet | null> {
  try {
    return JSON.parse(await readFile(metadataPath, 'utf8')) as StoredSharedPdfLeaflet;
  } catch {
    return null;
  }
}

function buildExtractionDirectoryPath(input: StoreSharedPdfLeafletExtractionInput): string {
  const extractedAtIso = new Date(input.extractedAtIso).toISOString();
  return join(
    input.rootDirectory.trim(),
    input.supermarketId,
    extractedAtIso.slice(0, 10),
    extractedAtIso.slice(11, 16).replace(':', '-'),
  );
}

function buildSharedPdfsDirectoryPath(input: StoreSharedPdfLeafletExtractionInput): string {
  return join(input.rootDirectory.trim(), input.supermarketId, 'shared-pdfs');
}

function buildSharedLeafletsDirectoryPath(input: StoreSharedPdfLeafletExtractionInput): string {
  return join(input.rootDirectory.trim(), input.supermarketId, 'shared-leaflets');
}

function buildSharedPdfsIndexPath(input: StoreSharedPdfLeafletExtractionInput): string {
  return join(buildSharedPdfsDirectoryPath(input), 'index.json');
}

function canonicalizePdfUrl(value: string): string {
  const url = new URL(value.trim());
  url.hash = '';

  for (const key of ['t', 'timestamp', 'cache', 'cacheBust', 'v']) {
    url.searchParams.delete(key);
  }

  url.searchParams.sort();

  return url.toString();
}

function validateNonBlank(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new LeafletPdfStorageError(`${fieldName} cannot be blank.`);
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
