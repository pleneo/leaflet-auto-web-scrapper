import type { CoopLeafletCard } from './coop-image-gallery-leaflet';
import type { CoopMonitoredStore } from './coop-targets';

export interface CoopPageFetcher {
  fetchHtml(url: string): Promise<string>;
}

export interface CoopApiClientConfig {
  readonly baseUrl: string;
  readonly fetcher?: typeof fetch;
}

export interface CoopStorePageLink {
  readonly storeSlug: string;
  readonly href: string;
  readonly text: string;
}

export class CoopApiClient implements CoopPageFetcher {
  private readonly baseUrl: string;

  private readonly fetcher: typeof fetch;

  constructor(config: CoopApiClientConfig) {
    this.baseUrl = parseBaseUrl(config.baseUrl, 'baseUrl');
    this.fetcher = config.fetcher ?? fetch;
  }

  async fetchHtml(url: string): Promise<string> {
    const targetUrl = parseSameOriginUrl(url, this.baseUrl, 'url');
    const response = await this.fetcher(targetUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        Referer: `${this.baseUrl}/`,
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Coop page request failed: ${String(response.status)} ${response.statusText}`,
      );
    }

    return response.text();
  }
}

export function parseCoopStorePageLinks(
  offersPageUrl: string,
  html: string,
  monitoredStores: readonly CoopMonitoredStore[],
): readonly CoopStorePageLink[] {
  validateNonBlank(offersPageUrl, 'offersPageUrl');
  validateNonBlank(html, 'html');
  const links = readAnchors(html);

  return monitoredStores.flatMap((store) => {
    for (const link of links) {
      const href = resolveSameOriginUrl(link.href, offersPageUrl);

      if (href !== null && normalizeUrl(href) === normalizeUrl(store.finalPageUrl)) {
        return [
          {
            storeSlug: store.storeSlug,
            href,
            text: link.text,
          },
        ];
      }
    }

    return [];
  });
}

export function parseCoopLeafletCards(
  storePageUrl: string,
  html: string,
): readonly CoopLeafletCard[] {
  validateNonBlank(storePageUrl, 'storePageUrl');
  validateNonBlank(html, 'html');

  const cards = new Map<string, CoopLeafletCard>();
  const cardExpression =
    /<div\b[^>]*class=["'][^"']*\bofertas\b[^"']*["'][^>]*>([\s\S]*?)(?=<\/div>\s*<div\b[^>]*class=["'][^"']*\bofertas\b|<\/div>\s*<div\b[^>]*class=["'][^"']*\bvoltar_ofertas\b|<\/div>)/gi;
  let cardMatch = cardExpression.exec(html);
  let cardIndex = 0;

  while (cardMatch !== null) {
    const cardHtml = cardMatch.slice(1, 2).join('');
    const link = readAnchors(cardHtml)[0];
    const href = link === undefined ? null : resolveSameOriginUrl(link.href, storePageUrl);

    if (link !== undefined && href !== null && isCoopMagazineUrl(href) && !cards.has(href)) {
      const title = readTagText(cardHtml, 'h3') ?? link.text;

      cards.set(href, {
        leafletId: createLeafletId(href, title),
        title,
        href,
        sourcePageUrl: storePageUrl,
        validUntilIso: null,
        cardIndex,
      });
      cardIndex += 1;
    }

    cardMatch = cardExpression.exec(html);
  }

  return [...cards.values()];
}

export function parseCoopLeafletImageUrls(leafletPageUrl: string, html: string): readonly string[] {
  validateNonBlank(leafletPageUrl, 'leafletPageUrl');
  validateNonBlank(html, 'html');

  const imageUrls = new Map<string, string>();
  const imageExpression = /<img\b([^>]*)>/gi;
  let imageMatch = imageExpression.exec(html);

  while (imageMatch !== null) {
    const src = readAttribute(imageMatch.slice(1, 2).join(''), 'src');
    const imageUrl = src === null ? null : resolveImageUrl(src, leafletPageUrl);

    if (imageUrl !== null && isLikelyCoopLeafletImage(imageUrl)) {
      imageUrls.set(imageUrl, imageUrl);
    }

    imageMatch = imageExpression.exec(html);
  }

  if (imageUrls.size === 0) {
    const folder = readJavascriptStringAssignment(html, 'pasta');
    const pageCount = readTurnPageCount(html);

    if (folder !== null && pageCount !== null) {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const imageUrl = resolveImageUrl(`${folder}/${String(pageNumber)}.jpg`, leafletPageUrl);

        if (imageUrl !== null) {
          imageUrls.set(imageUrl, imageUrl);
        }
      }
    }
  }

  return [...imageUrls.values()];
}

export function parseCoopPageTitle(html: string, fallbackUrl: string): string {
  return (
    readTagText(html, 'h1') ??
    readTagText(html, 'h2') ??
    readTagText(html, 'title') ??
    titleFromUrl(fallbackUrl)
  );
}

function readAnchors(html: string): readonly { readonly href: string; readonly text: string }[] {
  const anchors: { readonly href: string; readonly text: string }[] = [];
  const expression = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match = expression.exec(html);

  while (match !== null) {
    const href = readAttribute(match.slice(1, 2).join(''), 'href');
    const text = normalizeText(stripHtmlTags(match.slice(2, 3).join('')));

    if (href !== null && text.length > 0) {
      anchors.push({ href, text });
    }

    match = expression.exec(html);
  }

  return anchors;
}

function readTagText(html: string, tagName: string): string | null {
  const expression = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = expression.exec(html);
  const value = match === null ? '' : normalizeText(stripHtmlTags(match.slice(1, 2).join('')));

  return value.length === 0 ? null : value;
}

function readAttribute(attributes: string, name: string): string | null {
  const quoted = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(attributes);

  if (quoted !== null) {
    const value = decodeHtmlText(quoted.slice(2, 3).join('')).trim();
    return value.length === 0 ? null : value;
  }

  const unquoted = new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(attributes);

  return unquoted === null ? null : decodeHtmlText(unquoted.slice(1, 2).join('')).trim();
}

function readJavascriptStringAssignment(html: string, variableName: string): string | null {
  const match = new RegExp(`\\bvar\\s+${variableName}\\s*=\\s*(["'])(.*?)\\1\\s*;`, 'i').exec(html);
  const value = match === null ? '' : decodeHtmlText(match.slice(2, 3).join('')).trim();

  return value.length === 0 ? null : value;
}

function readTurnPageCount(html: string): number | null {
  const match = /\bpages\s*:\s*(\d+)\s*,/i.exec(html);
  const value = match === null ? Number.NaN : Number(match.slice(1, 2).join(''));

  return Number.isInteger(value) && value > 0 ? value : null;
}

function resolveSameOriginUrl(href: string, sourceUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(href, sourceUrl);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== new URL(sourceUrl).origin) {
    return null;
  }

  url.hash = '';

  return url.toString();
}

function resolveImageUrl(src: string, sourceUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(src, sourceUrl);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return null;
  }

  url.hash = '';

  return url.toString();
}

function parseBaseUrl(value: string, fieldName: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${fieldName} must be absolute and valid.`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(
      `${fieldName} must be an absolute http(s) URL without credentials, query, or fragment.`,
    );
  }

  return url.toString().replace(/\/+$/, '');
}

function parseSameOriginUrl(value: string, baseUrl: string, fieldName: string): URL {
  let url: URL;

  try {
    url = new URL(value, baseUrl);
  } catch {
    throw new Error(`${fieldName} must be absolute and valid.`);
  }

  if (url.origin !== baseUrl) {
    throw new Error(`${fieldName} must belong to the configured Coop origin.`);
  }

  return url;
}

function createLeafletId(href: string, title: string): string {
  const url = new URL(href);
  const encodedId = url.searchParams.get('id');
  const source = encodedId ?? title;
  const slug = slugify(source);

  return slug.length === 0 ? 'coop-leaflet' : `coop-${slug}`;
}

function titleFromUrl(value: string): string {
  const url = new URL(value, 'https://www.cooper.coop.br/');
  const lastPathSegment = url.pathname.split('/').filter(Boolean).at(-1) ?? 'leaflet';

  return lastPathSegment.replace(/[-_]+/g, ' ');
}

function isCoopMagazineUrl(url: string): boolean {
  return new URL(url).pathname.replace(/\/+$/, '') === '/revista';
}

function isLikelyCoopLeafletImage(url: string): boolean {
  return /\/revista\/imagens\/\d+\/\d+\.jpe?g$/i.test(new URL(url).pathname);
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeText(value: string): string {
  return decodeHtmlText(value).replace(/\s+/g, ' ').trim();
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

function slugify(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateNonBlank(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be blank.`);
  }
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/&Aacute;/g, 'Á')
    .replace(/&aacute;/g, 'á')
    .replace(/&Eacute;/g, 'É')
    .replace(/&eacute;/g, 'é')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&iacute;/g, 'í')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&oacute;/g, 'ó')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&uacute;/g, 'ú')
    .replace(/&Ccedil;/g, 'Ç')
    .replace(/&ccedil;/g, 'ç')
    .replace(/&atilde;/g, 'ã')
    .replace(/&Atilde;/g, 'Ã')
    .replace(/&otilde;/g, 'õ')
    .replace(/&Otilde;/g, 'Õ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_match, codePoint: string) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint: string) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    );
}
