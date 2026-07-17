import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ExtractedLeaflet,
  ExtractedLeafletImage,
  LeafletExtractionResult,
} from '../../domain/leaflet/extracted-leaflet';
import type { SupermarketId } from '../../domain/supermarket/supermarket-id';

export type LeafletImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface DownloadedLeafletImage {
  readonly body: Uint8Array;
  readonly contentType: LeafletImageContentType;
}

export interface LeafletImageHttpClient {
  downloadImage(url: string): Promise<DownloadedLeafletImage>;
}

export interface StoreLeafletExtractionInput {
  readonly rootDirectory: string;
  readonly result: LeafletExtractionResult;
}

export interface StoredLeafletImage {
  readonly order: number;
  readonly sourceUrl: string;
  readonly filePath: string;
  readonly contentType: LeafletImageContentType;
  readonly byteLength: number;
}

export interface StoredLeaflet {
  readonly leafletId: string;
  readonly title: string;
  readonly directoryPath: string;
  readonly images: readonly StoredLeafletImage[];
}

export interface StoredLeafletExtraction {
  readonly supermarketId: SupermarketId;
  readonly directoryPath: string;
  readonly metadataPath: string;
  readonly leaflets: readonly StoredLeaflet[];
}

export class LeafletImageStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeafletImageStorageError';
  }
}

export class LocalLeafletImageStorage {
  private readonly httpClient: LeafletImageHttpClient;

  constructor(httpClient: LeafletImageHttpClient) {
    this.httpClient = httpClient;
  }

  async store(input: StoreLeafletExtractionInput): Promise<StoredLeafletExtraction> {
    const extractionDirectoryPath = buildExtractionDirectoryPath(input.rootDirectory, input.result);
    await mkdir(extractionDirectoryPath, {
      recursive: true,
    });

    const storedLeaflets: StoredLeaflet[] = [];

    for (const leaflet of input.result.leaflets) {
      storedLeaflets.push(await this.storeLeaflet(extractionDirectoryPath, leaflet));
    }

    const metadataPath = join(extractionDirectoryPath, 'metadata.json');
    const storedExtraction = {
      supermarketId: input.result.supermarketId,
      directoryPath: extractionDirectoryPath,
      metadataPath,
      leaflets: storedLeaflets,
    };

    await writeFile(
      metadataPath,
      `${JSON.stringify(
        {
          extraction: input.result,
          storage: storedExtraction,
        },
        null,
        2,
      )}\n`,
    );

    return storedExtraction;
  }

  private async storeLeaflet(
    extractionDirectoryPath: string,
    leaflet: ExtractedLeaflet,
  ): Promise<StoredLeaflet> {
    const leafletDirectoryPath = join(extractionDirectoryPath, leaflet.leafletId);
    await mkdir(leafletDirectoryPath, {
      recursive: true,
    });

    const storedImages: StoredLeafletImage[] = [];

    for (const image of leaflet.images) {
      storedImages.push(await this.storeImage(leafletDirectoryPath, image));
    }

    return {
      leafletId: leaflet.leafletId,
      title: leaflet.title,
      directoryPath: leafletDirectoryPath,
      images: storedImages,
    };
  }

  private async storeImage(
    leafletDirectoryPath: string,
    image: ExtractedLeafletImage,
  ): Promise<StoredLeafletImage> {
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
  result: LeafletExtractionResult,
): string {
  const trimmedRootDirectory = rootDirectory.trim();

  if (trimmedRootDirectory.length === 0) {
    throw new LeafletImageStorageError('rootDirectory cannot be blank.');
  }

  const extractionDate = result.extractedAtIso.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(extractionDate)) {
    throw new LeafletImageStorageError('extractedAtIso must start with an ISO date.');
  }

  if (!Number.isFinite(Date.parse(result.extractedAtIso))) {
    throw new LeafletImageStorageError('extractedAtIso must be a valid ISO date.');
  }

  return join(trimmedRootDirectory, result.supermarketId, extractionDate);
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
