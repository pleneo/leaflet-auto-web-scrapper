import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import {
  createDefaultTaustePublicationDiscoveryInput,
  filterTausteOfferPublications,
  type TaustePublicationDiscoveryInput,
  type TaustePublicationDiscoveryProvider,
  type TaustePublicationPageFetcher,
} from './tauste-api-client';
import type {
  ExtractedTaustePdfLeaflet,
  TausteExtractedUnit,
  TausteFailedPublication,
  TaustePublication,
} from './tauste-pdf-leaflet';
import { TAUSTE_UNIT_ID, TAUSTE_UNIT_NAME } from './tauste-targets';

export interface TausteApiExtractionInput {
  readonly discoveryInput?: TaustePublicationDiscoveryInput;
}

export interface TausteApiExtractionResult {
  readonly source: 'tauste-api';
  readonly extractedAtIso: string;
  readonly units: readonly TausteExtractedUnit[];
  readonly failedPublications: readonly TausteFailedPublication[];
}

export interface TaustePublicationPageMetadata {
  readonly publicationUrl: string;
  readonly title: string;
  readonly accountId: string | null;
  readonly flipbookHash: string | null;
  readonly playerUrl: string | null;
  readonly coverImageUrl: string | null;
  readonly publishedAtIso: string | null;
}

export class TausteApiExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TausteApiExtractionError';
  }
}

export class TausteApiExtractionService {
  private readonly discoveryProvider: TaustePublicationDiscoveryProvider;

  private readonly pageFetcher: TaustePublicationPageFetcher;

  private readonly clock: Clock;

  private readonly logger: Logger;

  constructor(
    discoveryProvider: TaustePublicationDiscoveryProvider,
    pageFetcher: TaustePublicationPageFetcher,
    clock: Clock,
    logger: Logger,
  ) {
    this.discoveryProvider = discoveryProvider;
    this.pageFetcher = pageFetcher;
    this.clock = clock;
    this.logger = logger;
  }

  async extract(input: TausteApiExtractionInput = {}): Promise<TausteApiExtractionResult> {
    const discoveryInput = input.discoveryInput ?? createDefaultTaustePublicationDiscoveryInput();
    const extractedAtIso = this.clock.nowIso();
    const failedPublications: TausteFailedPublication[] = [];
    let publications: readonly TaustePublication[];

    try {
      publications = filterTausteOfferPublications(
        await this.discoveryProvider.listPublications(discoveryInput),
      );
    } catch (error) {
      return {
        source: 'tauste-api',
        extractedAtIso,
        units: [],
        failedPublications: [
          {
            publicationId: 'tauste:discovery',
            title: 'Tauste publication discovery',
            sourceUrl: discoveryInput.profileUrl,
            errorMessage: (error as Error).message,
          },
        ],
      };
    }

    const leaflets: ExtractedTaustePdfLeaflet[] = [];

    for (const publication of publications) {
      try {
        leaflets.push(await this.extractPublication(publication));
      } catch (error) {
        failedPublications.push({
          publicationId: publication.publicationId,
          title: publication.title,
          sourceUrl: publication.publicationUrl,
          errorMessage: (error as Error).message,
        });
      }
    }

    return {
      source: 'tauste-api',
      extractedAtIso,
      units:
        leaflets.length === 0
          ? []
          : [
              {
                unitId: TAUSTE_UNIT_ID,
                unitName: TAUSTE_UNIT_NAME,
                sourceUrl: discoveryInput.profileUrl,
                leaflets,
              },
            ],
      failedPublications,
    };
  }

  private async extractPublication(
    publication: TaustePublication,
  ): Promise<ExtractedTaustePdfLeaflet> {
    const html = await this.pageFetcher.fetchHtml(publication.publicationUrl);
    const metadata = parseTaustePublicationPageMetadata(publication.publicationUrl, html);
    const pdfUrl = resolveTaustePublicationPdfUrl(publication.publicationUrl, html);

    if (pdfUrl === null) {
      throw new TausteApiExtractionError(
        `Tauste Flipsnack publication did not expose a PDF download URL: ${publication.publicationUrl}`,
      );
    }

    this.logger.info('Resolved Tauste PDF leaflet through API path.', {
      publicationId: publication.publicationId,
      title: publication.title,
      pdfUrl,
    });

    return {
      leafletId: publication.publicationId,
      title: metadata.title,
      publicationUrl: publication.publicationUrl,
      coverImageUrl: metadata.coverImageUrl ?? publication.coverImageUrl,
      publishedAtIso: metadata.publishedAtIso ?? publication.publishedAtIso,
      pdfUrl,
    };
  }
}

export function parseTaustePublicationPageMetadata(
  publicationUrl: string,
  html: string,
): TaustePublicationPageMetadata {
  validateNonBlank(publicationUrl, 'publicationUrl');
  validateNonBlank(html, 'html');

  return {
    publicationUrl,
    title:
      readMetaContent(html, 'og:title') ??
      readMetaContent(html, 'twitter:title') ??
      readTitle(html) ??
      'Tauste publication',
    accountId: readWindowString(html, 'accountId'),
    flipbookHash: readWindowString(html, 'flipbookHash'),
    playerUrl: readIframeDataSrc(html),
    coverImageUrl: readMetaContent(html, 'og:image') ?? readMetaContent(html, 'twitter:image'),
    publishedAtIso: readJsonLdDate(html, 'datePublished'),
  };
}

export function resolveTaustePublicationPdfUrl(
  publicationUrl: string,
  html: string,
): string | null {
  validateNonBlank(publicationUrl, 'publicationUrl');
  validateNonBlank(html, 'html');
  const candidates = [
    ...readAnchorHrefs(html),
    ...readJsonStringFields(html, ['pdfUrl', 'downloadUrl', 'sourcePdfUrl']),
  ];

  for (const candidate of candidates) {
    const pdfUrl = resolvePdfCandidate(publicationUrl, candidate);

    if (pdfUrl !== null) {
      return pdfUrl;
    }
  }

  return null;
}

function readMetaContent(html: string, propertyName: string): string | null {
  const escapedName = escapeRegExp(propertyName);
  const expression = new RegExp(
    `<meta\\b(?=[^>]*(?:property|name)=["']${escapedName}["'])(?=[^>]*content=["']([^"']+)["'])[^>]*>`,
    'i',
  );
  const match = expression.exec(html);

  return match?.[1] === undefined ? null : decodeHtmlEntities(match[1]).trim();
}

function readTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);

  return match?.[1] === undefined ? null : decodeHtmlEntities(stripTags(match[1])).trim();
}

function readWindowString(html: string, fieldName: string): string | null {
  const expression = new RegExp(`window\\.${escapeRegExp(fieldName)}\\s*=\\s*'([^']*)'`, 'i');
  const singleQuoteMatch = expression.exec(html);

  if (singleQuoteMatch?.[1] !== undefined) {
    return decodeJavascriptString(singleQuoteMatch[1]);
  }

  const doubleQuoteExpression = new RegExp(
    `window\\.${escapeRegExp(fieldName)}\\s*=\\s*"([^"]*)"`,
    'i',
  );
  const doubleQuoteMatch = doubleQuoteExpression.exec(html);

  return doubleQuoteMatch?.[1] === undefined ? null : decodeJavascriptString(doubleQuoteMatch[1]);
}

function readIframeDataSrc(html: string): string | null {
  const match =
    /<iframe\b(?=[^>]*\bid=["']player-iframe["'])(?=[^>]*(?:data-src|src)=["']([^"']+)["'])[^>]*>/i.exec(
      html,
    );

  return match?.[1] === undefined ? null : decodeHtmlEntities(match[1]).trim();
}

function readJsonLdDate(html: string, fieldName: string): string | null {
  const expression = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"([^"]+)"`, 'i');
  const match = expression.exec(html);

  if (match?.[1] === undefined) {
    return null;
  }

  const value = match[1].trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00.000Z`;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value;
  }

  return null;
}

function readAnchorHrefs(html: string): readonly string[] {
  const hrefs: string[] = [];
  const expression = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let match = expression.exec(html);

  while (match !== null) {
    if (match[1] !== undefined) {
      hrefs.push(decodeHtmlEntities(match[1]).trim());
    }

    match = expression.exec(html);
  }

  return hrefs;
}

function readJsonStringFields(html: string, fieldNames: readonly string[]): readonly string[] {
  const values: string[] = [];

  for (const fieldName of fieldNames) {
    const expression = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"([^"]+)"`, 'gi');
    let match = expression.exec(html);

    while (match !== null) {
      if (match[1] !== undefined) {
        values.push(decodeJavascriptString(match[1]));
      }

      match = expression.exec(html);
    }
  }

  return values;
}

function resolvePdfCandidate(publicationUrl: string, candidate: string): string | null {
  if (!isLikelyPdfUrl(candidate)) {
    return null;
  }

  return new URL(candidate, publicationUrl).toString();
}

function isLikelyPdfUrl(value: string): boolean {
  const lowerValue = value.toLowerCase();

  return lowerValue.endsWith('.pdf') || lowerValue.includes('.pdf?');
}

function decodeJavascriptString(value: string): string {
  return decodeHtmlEntities(value.replace(/\\\//g, '/').replace(/\\"/g, '"').replace(/\\'/g, "'"));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateNonBlank(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be blank.`);
  }
}
