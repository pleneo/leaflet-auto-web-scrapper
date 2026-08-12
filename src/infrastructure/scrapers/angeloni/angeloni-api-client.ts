import type {
  AngeloniApiLeaflet,
  AngeloniRegionLeafletProvider,
  AngeloniRegionLeafletQuery,
} from './angeloni-api-types';

export interface AngeloniApiClientConfig {
  readonly baseUrl: string;
  readonly fetcher?: typeof fetch;
}

export class AngeloniApiClient implements AngeloniRegionLeafletProvider {
  private readonly baseUrl: string;

  private readonly fetcher: typeof fetch;

  constructor(config: AngeloniApiClientConfig) {
    this.baseUrl = parseBaseUrl(config.baseUrl, 'baseUrl');
    this.fetcher = config.fetcher ?? fetch;
  }

  async listRegionLeaflets(
    query: AngeloniRegionLeafletQuery,
  ): Promise<readonly AngeloniApiLeaflet[]> {
    const regionUrl = parseRegionUrl(query.regionUrl, this.baseUrl);
    const response = await this.fetcher(regionUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        Referer: `${this.baseUrl}/`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Angeloni region page request failed: ${String(response.status)} ${response.statusText}`,
      );
    }

    return parseAngeloniRegionLeaflets(regionUrl.toString(), await response.text());
  }
}

export function parseAngeloniRegionLeaflets(
  sourcePageUrl: string,
  html: string,
): readonly AngeloniApiLeaflet[] {
  validateNonBlank(sourcePageUrl, 'sourcePageUrl');
  validateNonBlank(html, 'html');

  const leaflets = new Map<string, AngeloniApiLeaflet>();
  const anchorExpression = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let anchorMatch = anchorExpression.exec(html);

  while (anchorMatch !== null) {
    const href = isInsideFullyHiddenElementorBlock(html, anchorMatch.index)
      ? null
      : readHrefAttribute(anchorMatch.slice(1, 2).join(''));

    if (href !== null) {
      const pdfUrl = resolvePdfUrl(href, sourcePageUrl);

      if (pdfUrl !== null && !leaflets.has(pdfUrl)) {
        leaflets.set(pdfUrl, {
          leafletId: createAngeloniLeafletId(pdfUrl),
          title: readAnchorTitle(anchorMatch.slice(2, 3).join(''), pdfUrl),
          pdfUrl,
          sourcePageUrl,
        });
      }
    }

    anchorMatch = anchorExpression.exec(html);
  }

  return [...leaflets.values()];
}

function isInsideFullyHiddenElementorBlock(html: string, anchorIndex: number): boolean {
  const nearbyOpeningTag = html.slice(Math.max(0, anchorIndex - 1_000), anchorIndex);
  const markerStart = nearbyOpeningTag.lastIndexOf('elementor-hidden-desktop');

  if (markerStart < 0) {
    return false;
  }

  const candidateTag = nearbyOpeningTag.slice(markerStart);

  if (candidateTag.includes('</div>')) {
    return false;
  }

  return (
    candidateTag.includes('elementor-hidden-desktop') &&
    candidateTag.includes('elementor-hidden-tablet') &&
    candidateTag.includes('elementor-hidden-mobile')
  );
}

function readHrefAttribute(anchorAttributes: string): string | null {
  const quotedMatch = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(anchorAttributes);

  if (quotedMatch !== null) {
    const value = quotedMatch.slice(2, 3).join('').trim();
    return value.length === 0 ? null : decodeHtmlText(value);
  }

  const unquotedMatch = /\bhref\s*=\s*([^\s>]+)/i.exec(anchorAttributes);
  const value = unquotedMatch === null ? '' : unquotedMatch.slice(1, 2).join('').trim();

  return value.length === 0 ? null : decodeHtmlText(value);
}

function resolvePdfUrl(href: string, sourcePageUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(href, sourcePageUrl);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol) || !url.pathname.toLowerCase().endsWith('.pdf')) {
    return null;
  }

  if (url.hostname === 'statics.angeloni.com.br' && url.protocol === 'http:') {
    url.protocol = 'https:';
  }

  url.hash = '';

  return url.toString();
}

function readAnchorTitle(anchorBody: string, pdfUrl: string): string {
  const buttonTextMatch =
    /<span\b[^>]*class=["'][^"']*\belementor-button-text\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(
      anchorBody,
    );
  const candidate = buttonTextMatch?.[1] ?? anchorBody;
  const title = decodeHtmlText(stripHtmlTags(candidate)).replace(/\s+/g, ' ').trim();

  if (title.length > 0) {
    return title;
  }

  return titleFromPdfUrl(pdfUrl);
}

function titleFromPdfUrl(pdfUrl: string): string {
  const url = new URL(pdfUrl);
  const fileName = url.pathname.substring(url.pathname.lastIndexOf('/') + 1);
  const withoutExtension = fileName.replace(/\.pdf$/i, '');
  const decoded = decodeURIComponent(withoutExtension);

  return decoded.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function createAngeloniLeafletId(pdfUrl: string): string {
  const url = new URL(pdfUrl);
  const pathSignature = decodeURIComponent(url.pathname)
    .replace(/\.pdf$/i, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `angeloni-${pathSignature.length === 0 ? 'leaflet' : pathSignature}`;
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

function parseRegionUrl(value: string, baseUrl: string): URL {
  validateNonBlank(value, 'regionUrl');

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('regionUrl must be absolute and valid.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('regionUrl must be an absolute http(s) URL.');
  }

  if (url.origin !== new URL(baseUrl).origin) {
    throw new Error('regionUrl must belong to the configured Angeloni origin.');
  }

  return url;
}

function validateNonBlank(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be blank.`);
  }
}
