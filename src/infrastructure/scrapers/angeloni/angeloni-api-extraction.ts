import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type { AngeloniApiLeaflet, AngeloniRegionLeafletProvider } from './angeloni-api-types';
import type {
  AngeloniExtractedRegion,
  AngeloniFailedRegion,
  ExtractedAngeloniPdfLeaflet,
} from './angeloni-pdf-leaflet';
import type { AngeloniMonitoredRegion } from './angeloni-targets';

export interface AngeloniApiExtractionInput {
  readonly regions: readonly AngeloniMonitoredRegion[];
}

export interface AngeloniApiExtractionResult {
  readonly source: 'angeloni-api';
  readonly extractedAtIso: string;
  readonly regions: readonly AngeloniExtractedRegion[];
  readonly failedRegions: readonly AngeloniFailedRegion[];
}

export class AngeloniApiExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AngeloniApiExtractionError';
  }
}

export class AngeloniApiExtractionService {
  private readonly leafletProvider: AngeloniRegionLeafletProvider;

  private readonly clock: Clock;

  private readonly logger: Logger;

  constructor(leafletProvider: AngeloniRegionLeafletProvider, clock: Clock, logger: Logger) {
    this.leafletProvider = leafletProvider;
    this.clock = clock;
    this.logger = logger;
  }

  async extract(input: AngeloniApiExtractionInput): Promise<AngeloniApiExtractionResult> {
    validateInput(input);

    const extractedRegions: AngeloniExtractedRegion[] = [];
    const failedRegions: AngeloniFailedRegion[] = [];

    for (const region of input.regions) {
      try {
        const leaflets = await this.extractRegionLeaflets(region);

        extractedRegions.push({
          region,
          sourceUrl: region.regionUrl,
          leaflets,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unexpected Angeloni API failure.';
        this.logger.warn('Angeloni API region extraction failed.', {
          regionSlug: region.regionSlug,
          regionName: region.regionName,
          errorMessage,
        });
        failedRegions.push({
          region,
          sourceUrl: region.regionUrl,
          errorMessage,
        });
      }
    }

    return {
      source: 'angeloni-api',
      extractedAtIso: this.clock.nowIso(),
      regions: extractedRegions,
      failedRegions,
    };
  }

  private async extractRegionLeaflets(
    region: AngeloniMonitoredRegion,
  ): Promise<readonly ExtractedAngeloniPdfLeaflet[]> {
    const leaflets = await this.leafletProvider.listRegionLeaflets({
      regionUrl: region.regionUrl,
    });

    this.logger.info('Fetched Angeloni API leaflets from regional page.', {
      regionSlug: region.regionSlug,
      leaflets: leaflets.length,
    });

    return leaflets.map((leaflet, index) => createExtractedLeaflet(leaflet, index));
  }
}

function createExtractedLeaflet(
  leaflet: AngeloniApiLeaflet,
  index: number,
): ExtractedAngeloniPdfLeaflet {
  return {
    leafletId: leaflet.leafletId,
    title: leaflet.title,
    cardIndex: index,
    pdfUrl: leaflet.pdfUrl,
  };
}

function validateInput(input: AngeloniApiExtractionInput): void {
  if (input.regions.length === 0) {
    throw new AngeloniApiExtractionError('regions cannot be empty.');
  }
}
