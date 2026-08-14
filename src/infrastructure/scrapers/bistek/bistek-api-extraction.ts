import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import { BISTEK_OFFERS_URL, parseBistekTargetsFromHtml, slugify } from './bistek-targets';
import type { BistekApiSessionFactory } from './bistek-api-client';
import type {
  BistekExtractedStore,
  BistekFailedStore,
  BistekLeafletCard,
  BistekMonitoredStore,
  ExtractedBistekImageGalleryLeaflet,
} from './bistek-image-gallery-leaflet';

export interface BistekApiExtractionInput {
  readonly offersUrl: string;
  readonly storeIds: readonly string[];
  readonly cityIds: readonly string[];
}

export interface BistekApiExtractionResult {
  readonly source: 'bistek-api';
  readonly extractedAtIso: string;
  readonly stores: readonly BistekExtractedStore[];
  readonly failedStores: readonly BistekFailedStore[];
}

export class BistekApiExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BistekApiExtractionError';
  }
}

export class BistekApiExtractionService {
  private readonly sessionFactory: BistekApiSessionFactory;

  private readonly clock: Clock;

  private readonly logger: Logger;

  constructor(sessionFactory: BistekApiSessionFactory, clock: Clock, logger: Logger) {
    this.sessionFactory = sessionFactory;
    this.clock = clock;
    this.logger = logger;
  }

  async extract(input: BistekApiExtractionInput): Promise<BistekApiExtractionResult> {
    validateInput(input);
    const discoverySession = this.sessionFactory.createSession();
    const initialHtml = await discoverySession.fetchOffersHtml();
    const stores = filterStores(parseBistekTargetsFromHtml(initialHtml), input);
    const extractedStores: BistekExtractedStore[] = [];
    const failedStores: BistekFailedStore[] = [];

    for (const store of stores) {
      const unitId = createUnitId(store);
      const unitName = createUnitName(store);

      try {
        const leaflets = await this.extractStore(input.offersUrl, store);
        extractedStores.push({
          unitId,
          unitName,
          sourceUrl: input.offersUrl,
          store,
          leaflets,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unexpected Bistek API extraction failure.';
        this.logger.warn('Bistek API store extraction failed.', {
          storeId: store.storeId,
          storeName: store.storeName,
          cityName: store.cityName,
          errorMessage,
        });
        failedStores.push({
          unitId,
          unitName,
          sourceUrl: input.offersUrl,
          errorMessage,
        });
      }
    }

    return {
      source: 'bistek-api',
      extractedAtIso: this.clock.nowIso(),
      stores: extractedStores,
      failedStores,
    };
  }

  private async extractStore(
    offersUrl: string,
    store: BistekMonitoredStore,
  ): Promise<readonly ExtractedBistekImageGalleryLeaflet[]> {
    const session = this.sessionFactory.createSession();
    await session.fetchOffersHtml();
    await session.selectStore(store.storeId);
    const offersHtml = await session.fetchOffersHtml();
    const cards = parseBistekLeafletCards(offersUrl, store, offersHtml);

    if (cards.length === 0) {
      throw new BistekApiExtractionError(
        'Bistek store page did not expose leaflet image galleries.',
      );
    }

    this.logger.info('Fetched Bistek store image galleries through API path.', {
      storeId: store.storeId,
      storeName: store.storeName,
      cityName: store.cityName,
      leafletCount: cards.length,
    });

    return cards.map((card) => ({
      leafletId: card.leafletId,
      title: card.title,
      sourcePageUrl: offersUrl,
      coverImageUrl: card.coverImageUrl,
      imageUrls: card.imageUrls,
      validityStartDateIso: card.validityStartDateIso,
      validityEndDateIso: card.validityEndDateIso,
    }));
  }
}

export function parseBistekLeafletCards(
  offersUrl: string,
  store: BistekMonitoredStore,
  html: string,
): readonly BistekLeafletCard[] {
  validateNonBlank(offersUrl, 'offersUrl');
  validateNonBlank(html, 'html');
  const cardHtmlBlocks = splitOfferBlocks(html);
  const cards: BistekLeafletCard[] = [];

  for (const [index, cardHtml] of cardHtmlBlocks.entries()) {
    const title = readClassText(cardHtml, 'titulo_oferta') ?? `Bistek encarte ${String(index + 1)}`;
    const links = readFancyboxLinks(cardHtml, offersUrl);

    if (links.length === 0) {
      continue;
    }

    const group = links[0]?.fancyboxGroup ?? `Oferta-${String(index + 1)}`;
    const imageUrls = links
      .filter((link) => link.fancyboxGroup === group)
      .map((link) => link.href)
      .filter((href, hrefIndex, hrefs) => hrefs.indexOf(href) === hrefIndex);
    const coverImageUrl = imageUrls[0];

    // Defensive guard: coverImageUrl is unreachable when links is non-empty because
    // imageUrls always contains at least links[0].href (same fancyboxGroup). Ignored for coverage.
    /* v8 ignore next 3 */
    if (coverImageUrl === undefined) {
      continue;
    }

    const validity = parseValidityRange(title);

    cards.push({
      leafletId: createLeafletId(store, group, title, imageUrls),
      title,
      cardIndex: index,
      fancyboxGroup: group,
      coverImageUrl,
      imageUrls,
      validityStartDateIso: validity.startDateIso,
      validityEndDateIso: validity.endDateIso,
    });
  }

  return cards;
}

export function createBistekApiExtractionInput(
  offersUrl = BISTEK_OFFERS_URL,
): BistekApiExtractionInput {
  return {
    offersUrl,
    storeIds: [],
    cityIds: [],
  };
}

export function createUnitId(store: BistekMonitoredStore): string {
  return `bistek-${store.storeSlug}`;
}

export function createUnitName(store: BistekMonitoredStore): string {
  return `${store.stateCode} - ${store.cityName} - ${store.storeName}`;
}

function filterStores(
  stores: readonly BistekMonitoredStore[],
  input: BistekApiExtractionInput,
): readonly BistekMonitoredStore[] {
  return stores.filter(
    (store) =>
      (input.storeIds.length === 0 || input.storeIds.includes(store.storeId)) &&
      (input.cityIds.length === 0 || input.cityIds.includes(store.cityId)),
  );
}

function splitOfferBlocks(html: string): readonly string[] {
  const starts: number[] = [];
  const expression = /<div\b[^>]*class=["'][^"']*\boferta\b[^"']*["'][^>]*>/gi;
  let match = expression.exec(html);

  while (match !== null) {
    starts.push(match.index);
    match = expression.exec(html);
  }

  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function readFancyboxLinks(
  html: string,
  sourceUrl: string,
): readonly { readonly href: string; readonly fancyboxGroup: string; readonly title: string }[] {
  const links: { readonly href: string; readonly fancyboxGroup: string; readonly title: string }[] =
    [];
  const expression = /<a\b([^>]*)>/gi;
  let match = expression.exec(html);

  while (match !== null) {
    const attributes = match.slice(1, 2).join('');
    const fancyboxGroup = readAttribute(attributes, 'data-fancybox');
    const href = readAttribute(attributes, 'href');
    const absoluteHref = href === null ? null : resolveImageUrl(href, sourceUrl);

    if (fancyboxGroup !== null && absoluteHref !== null) {
      links.push({
        href: absoluteHref,
        fancyboxGroup,
        title: readAttribute(attributes, 'title') ?? '',
      });
    }

    match = expression.exec(html);
  }

  return links;
}

function readClassText(html: string, className: string): string | null {
  const expression = new RegExp(
    `<[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)</[^>]+>`,
    'i',
  );
  const match = expression.exec(html);
  const value =
    match === null ? '' : decodeHtmlText(stripHtmlTags(match.slice(1, 2).join(''))).trim();

  return value.length === 0 ? null : value.replace(/\s+/g, ' ');
}

function readAttribute(attributes: string, name: string): string | null {
  const quoted = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(attributes);

  if (quoted !== null) {
    const value = decodeHtmlText(quoted.slice(2, 3).join('')).trim();
    return value.length === 0 ? null : value;
  }

  const unquoted = new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(attributes);
  const value = unquoted === null ? '' : decodeHtmlText(unquoted.slice(1, 2).join('')).trim();

  return value.length === 0 ? null : value;
}

function resolveImageUrl(src: string, sourceUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(src, sourceUrl);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol) || !/\.(png|jpe?g|webp)$/i.test(url.pathname)) {
    return null;
  }

  url.hash = '';

  return url.toString();
}

function createLeafletId(
  store: BistekMonitoredStore,
  fancyboxGroup: string,
  title: string,
  imageUrls: readonly string[],
): string {
  const groupSlug = slugify(fancyboxGroup);
  const fallbackSlug = slugify(`${title}-${imageUrls.join('-')}`);

  return `bistek-${store.storeSlug}-${groupSlug.length === 0 ? fallbackSlug : groupSlug}`;
}

function parseValidityRange(title: string): {
  readonly startDateIso: string | null;
  readonly endDateIso: string | null;
} {
  const match =
    /v[aá]lidas?\s+de\s+(\d{2})\/(\d{2})\/(\d{4})\s+at[eé]\s+(\d{2})\/(\d{2})\/(\d{4})/i.exec(
      title,
    );

  if (match === null) {
    return {
      startDateIso: null,
      endDateIso: null,
    };
  }

  return {
    startDateIso: toIsoDate(match.slice(1, 4)),
    endDateIso: toIsoDate(match.slice(4, 7)),
  };
}

function toIsoDate(parts: readonly string[]): string | null {
  const day = parts[0];
  const month = parts[1];
  const year = parts[2];

  /* v8 ignore next 3 */
  if (day === undefined || month === undefined || year === undefined) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/\\u00ba/g, 'º')
    .replace(/&#(\d+);/g, (_match, codePointText: string) =>
      String.fromCodePoint(Number.parseInt(codePointText, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePointText: string) =>
      String.fromCodePoint(Number.parseInt(codePointText, 16)),
    )
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function validateInput(input: BistekApiExtractionInput): void {
  validateNonBlank(input.offersUrl, 'offersUrl');
}

function validateNonBlank(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new BistekApiExtractionError(`${fieldName} cannot be blank.`);
  }
}
