import type { ComboAtacadistaLeafletCard } from './combo-atacadista-image-gallery-leaflet';

export interface ComboAtacadistaPageFetcher {
  fetchHtml(url: string): Promise<string>;
}

export interface ComboAtacadistaApiClientConfig {
  readonly baseUrl: string;
  readonly fetcher?: typeof fetch;
}

export class ComboAtacadistaApiClient implements ComboAtacadistaPageFetcher {
  private readonly baseUrl: string;

  private readonly fetcher: typeof fetch;

  constructor(config: ComboAtacadistaApiClientConfig) {
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
        `Combo Atacadista page request failed: ${String(response.status)} ${response.statusText}`,
      );
    }

    return response.text();
  }
}

export function parseComboAtacadistaLeafletCards(
  offersPageUrl: string,
  html: string,
): readonly ComboAtacadistaLeafletCard[] {
  validateNonBlank(offersPageUrl, 'offersPageUrl');
  validateNonBlank(html, 'html');

  const cards = new Map<string, ComboAtacadistaLeafletCard>();
  const cardExpression =
    /<div\b[^>]*class=["'][^"']*\bitem-topic\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let cardMatch = cardExpression.exec(html);
  let cardIndex = 0;

  while (cardMatch !== null) {
    const cardHtml = cardMatch.slice(1, 2).join('');
    const link = readFirstAnchor(cardHtml);

    if (link !== null && isOfferAction(link.text)) {
      const href = resolveSameOriginUrl(link.href, offersPageUrl);

      if (href !== null && !cards.has(href)) {
        cards.set(href, {
          leafletId: createLeafletId(href),
          title: readTagText(cardHtml, 'h2') ?? titleFromUrl(href),
          href,
          sourcePageUrl: offersPageUrl,
          validUntilIso: parseBrazilianDate(readClassText(cardHtml, 'date')),
          cardIndex,
        });
        cardIndex += 1;
      }
    }

    cardMatch = cardExpression.exec(html);
  }

  return [...cards.values()];
}

export function parseComboAtacadistaLeafletImageUrls(
  leafletPageUrl: string,
  html: string,
): readonly string[] {
  validateNonBlank(leafletPageUrl, 'leafletPageUrl');
  validateNonBlank(html, 'html');

  const imageUrls = new Map<string, string>();
  const contentUrlAnchorExpression = /<a\b([^>]*)\bitemprop\s*=\s*(["'])contentUrl\2([^>]*)>/gi;
  let anchorMatch = contentUrlAnchorExpression.exec(html);

  while (anchorMatch !== null) {
    const attributes = `${anchorMatch.slice(1, 2).join('')} ${anchorMatch.slice(3, 4).join('')}`;
    const href = readAttribute(attributes, 'href');
    const imageUrl = href === null ? null : resolveImageUrl(href, leafletPageUrl);

    if (imageUrl !== null) {
      imageUrls.set(imageUrl, imageUrl);
    }

    anchorMatch = contentUrlAnchorExpression.exec(html);
  }

  if (imageUrls.size === 0) {
    const imageExpression = /<img\b([^>]*)>/gi;
    let imageMatch = imageExpression.exec(html);

    while (imageMatch !== null) {
      const src = readFirstExistingAttribute(imageMatch.slice(1, 2).join(''), [
        'data-src',
        'data-lazy-src',
        'src',
      ]);
      const imageUrl = src === null ? null : resolveImageUrl(src, leafletPageUrl);

      if (imageUrl !== null && isLikelyLeafletImage(imageUrl)) {
        imageUrls.set(imageUrl, imageUrl);
      }

      imageMatch = imageExpression.exec(html);
    }
  }

  return [...imageUrls.values()];
}

export function parseComboAtacadistaPageTitle(html: string, fallbackUrl: string): string {
  return readTagText(html, 'h1') ?? readTagText(html, 'title') ?? titleFromUrl(fallbackUrl);
}

function readFirstAnchor(html: string): { readonly href: string; readonly text: string } | null {
  const match = /<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(html);
  const href = match === null ? null : readAttribute(match.slice(1, 2).join(''), 'href');

  if (match === null || href === null) {
    return null;
  }

  return {
    href,
    text: decodeHtmlText(stripHtmlTags(match.slice(2, 3).join('')))
      .replace(/\s+/g, ' ')
      .trim(),
  };
}

function readTagText(html: string, tagName: string): string | null {
  const expression = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = expression.exec(html);
  const value =
    match === null ? '' : decodeHtmlText(stripHtmlTags(match.slice(1, 2).join(''))).trim();

  return value.length === 0 ? null : value.replace(/\s+/g, ' ');
}

function readClassText(html: string, className: string): string | null {
  const expression = new RegExp(
    `<[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    'i',
  );
  const match = expression.exec(html);
  const value =
    match === null ? '' : decodeHtmlText(stripHtmlTags(match.slice(1, 2).join(''))).trim();

  return value.length === 0 ? null : value.replace(/\s+/g, ' ');
}

function readFirstExistingAttribute(attributes: string, names: readonly string[]): string | null {
  for (const name of names) {
    const value = readAttribute(attributes, name);

    if (value !== null) {
      return value;
    }
  }

  return null;
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

  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== new URL(baseUrl).origin) {
    throw new Error(`${fieldName} must belong to the configured Combo Atacadista origin.`);
  }

  return url;
}

function isOfferAction(text: string): boolean {
  return normalizeComparableText(text) === 'ver ofertas';
}

function isLikelyLeafletImage(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase();

  return (
    /\.(png|jpe?g|webp)$/.test(pathname) &&
    (pathname.includes('/upload/offer_image/') || pathname.includes('/upload/weekend_image/'))
  );
}

function createLeafletId(leafletUrl: string): string {
  const url = new URL(leafletUrl);
  const slug = decodeURIComponent(url.pathname)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `comboatacadista-${slug.length === 0 ? 'leaflet' : slug}`;
}

function titleFromUrl(leafletUrl: string): string {
  const url = new URL(leafletUrl);
  const slug = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, '');

  const title = slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

  return title.length === 0 ? 'Combo Atacadista' : title;
}

function parseBrazilianDate(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(value);

  if (match === null) {
    return null;
  }

  const year = match[3];
  const month = match[2];
  const day = match[1];

  /* v8 ignore next 3 */
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function normalizeComparableText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

function decodeHtmlText(value: string): string {
  return value
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

function validateNonBlank(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be blank.`);
  }
}
