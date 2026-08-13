import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type {
  TaustePublicationDiscoveryInput,
  TaustePublicationDiscoveryProvider,
  TaustePublicationPageFetcher,
} from './tauste-api-client';
import {
  TausteApiExtractionService,
  parseTaustePublicationPageMetadata,
  resolveTaustePublicationPdfUrl,
} from './tauste-api-extraction';
import type { TaustePublication } from './tauste-pdf-leaflet';

describe('TausteApiExtractionService', () => {
  it('resolves PDF leaflets from discovered Flipsnack publication pages', async () => {
    const discoveryProvider = new FakeDiscoveryProvider([
      createPublication({
        publicationId: 'tauste:ofertas-tauste-bauru',
        title: 'Ofertas Tauste Bauru',
        publicationUrl: 'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-bauru.html',
      }),
    ]);
    const service = new TausteApiExtractionService(
      discoveryProvider,
      new FakePageFetcher({
        'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-bauru.html':
          createPublicationHtml({
            title: 'Ofertas Tauste Bauru',
            pdfUrl: 'https://cdn.example.com/tauste-bauru.pdf?download=1',
          }),
      }),
      new FixedClock(),
      new NullLogger(),
    );

    await expect(service.extract()).resolves.toEqual({
      source: 'tauste-api',
      extractedAtIso: '2026-08-13T10:00:00.000Z',
      units: [
        {
          unitId: 'tauste-supermercados',
          unitName: 'Tauste Supermercados',
          sourceUrl: 'https://www.flipsnack.com/taustesupermercado/',
          leaflets: [
            {
              leafletId: 'tauste:ofertas-tauste-bauru',
              title: 'Ofertas Tauste Bauru',
              publicationUrl:
                'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-bauru.html',
              coverImageUrl: 'https://cdn.example.com/cover.jpg',
              publishedAtIso: '2026-08-11T00:00:00.000Z',
              pdfUrl: 'https://cdn.example.com/tauste-bauru.pdf?download=1',
            },
          ],
        },
      ],
      failedPublications: [],
    });
  });

  it('returns typed publication failures when the page exposes only cover/player metadata', async () => {
    const service = new TausteApiExtractionService(
      new FakeDiscoveryProvider([
        createPublication({
          publicationId: 'tauste:ofertas-tauste-marilia',
          title: 'Ofertas Tauste Marília',
          publicationUrl:
            'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-marilia.html',
        }),
      ]),
      new FakePageFetcher({
        'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-marilia.html':
          createPublicationHtml({
            title: 'Ofertas Tauste Marília',
            pdfUrl: null,
          }),
      }),
      new FixedClock(),
      new NullLogger(),
    );

    const result = await service.extract();

    expect(result.units).toEqual([]);
    expect(result.failedPublications).toEqual([
      {
        publicationId: 'tauste:ofertas-tauste-marilia',
        title: 'Ofertas Tauste Marília',
        sourceUrl: 'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-marilia.html',
        errorMessage:
          'Tauste Flipsnack publication did not expose a PDF download URL: https://www.flipsnack.com/taustesupermercado/ofertas-tauste-marilia.html',
      },
    ]);
  });

  it('maps discovery failures without throwing the whole API extraction', async () => {
    const service = new TausteApiExtractionService(
      new FailingDiscoveryProvider(),
      new FakePageFetcher({}),
      new FixedClock(),
      new NullLogger(),
    );

    await expect(service.extract()).resolves.toMatchObject({
      units: [],
      failedPublications: [
        {
          publicationId: 'tauste:discovery',
          title: 'Tauste publication discovery',
          sourceUrl: 'https://www.flipsnack.com/taustesupermercado/',
          errorMessage: 'Discovery unavailable.',
        },
      ],
    });
  });

  it('parses publication metadata and direct PDF candidates from HTML', () => {
    const html = createPublicationHtml({
      title: 'Ofertas Tauste Taubaté',
      pdfUrl: '/download/ofertas-tauste-taubate.pdf',
    });

    expect(
      parseTaustePublicationPageMetadata(
        'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-taubate.html',
        html,
      ),
    ).toEqual({
      publicationUrl: 'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-taubate.html',
      title: 'Ofertas Tauste Taubaté',
      accountId: '9D99E5AF8D6',
      flipbookHash: 'u84hy2ln30',
      playerUrl: 'https://player.flipsnack.com/?hash=encoded',
      coverImageUrl: 'https://cdn.example.com/cover.jpg',
      publishedAtIso: '2026-08-11T00:00:00.000Z',
    });
    expect(
      resolveTaustePublicationPdfUrl(
        'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-taubate.html',
        html,
      ),
    ).toBe('https://www.flipsnack.com/download/ofertas-tauste-taubate.pdf');
    expect(() => parseTaustePublicationPageMetadata('', html)).toThrow(
      'publicationUrl cannot be blank.',
    );
  });
});

function createPublication(input: {
  readonly publicationId: string;
  readonly title: string;
  readonly publicationUrl: string;
}): TaustePublication {
  return {
    publicationId: input.publicationId,
    title: input.title,
    directLink: `${input.publicationId}.html`,
    publicationUrl: input.publicationUrl,
    coverImageUrl: 'https://cdn.example.com/list-cover.jpg',
    publishedAtIso: '2026-08-11T09:00:03.000Z',
  };
}

function createPublicationHtml(input: {
  readonly title: string;
  readonly pdfUrl: string | null;
}): string {
  const downloadLink =
    input.pdfUrl === null ? '' : `<a href="${input.pdfUrl}" aria-label="Download PDF">Download</a>`;

  return `
    <html>
      <head>
        <title>${input.title} by Tauste Supermercados - Flipsnack</title>
        <meta property="og:title" content="${input.title}">
        <meta property="og:image" content="https://cdn.example.com/cover.jpg">
        <script type="application/ld+json">
          {"@type":"DigitalDocument","datePublished":"2026-08-11"}
        </script>
      </head>
      <body>
        <div id="myPlayer">
          <iframe id="player-iframe" data-src="https://player.flipsnack.com/?hash=encoded"></iframe>
        </div>
        <script>
          window.accountId = '9D99E5AF8D6';
          window.flipbookHash = 'u84hy2ln30';
        </script>
        ${downloadLink}
      </body>
    </html>
  `;
}

class FakeDiscoveryProvider implements TaustePublicationDiscoveryProvider {
  private readonly publications: readonly TaustePublication[];

  constructor(publications: readonly TaustePublication[]) {
    this.publications = publications;
  }

  listPublications(_input: TaustePublicationDiscoveryInput): Promise<readonly TaustePublication[]> {
    return Promise.resolve(this.publications);
  }
}

class FailingDiscoveryProvider implements TaustePublicationDiscoveryProvider {
  listPublications(_input: TaustePublicationDiscoveryInput): Promise<readonly TaustePublication[]> {
    return Promise.reject(new Error('Discovery unavailable.'));
  }
}

class FakePageFetcher implements TaustePublicationPageFetcher {
  private readonly htmlByUrl: Readonly<Record<string, string>>;

  constructor(htmlByUrl: Readonly<Record<string, string>>) {
    this.htmlByUrl = htmlByUrl;
  }

  fetchHtml(url: string): Promise<string> {
    const html = this.htmlByUrl[url];

    if (html === undefined) {
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    }

    return Promise.resolve(html);
  }
}

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-08-13T10:00:00.000Z';
  }
}

class NullLogger implements Logger {
  debug(_message: string, _context?: Readonly<Record<string, string | number | boolean>>): void {}

  info(_message: string, _context?: Readonly<Record<string, string | number | boolean>>): void {}

  warn(_message: string, _context?: Readonly<Record<string, string | number | boolean>>): void {}

  error(_message: string, _context?: Readonly<Record<string, string | number | boolean>>): void {}
}
