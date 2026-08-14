import { describe, expect, it, vi } from 'vitest';
import {
  TausteApiClient,
  createDefaultTaustePublicationDiscoveryInput,
  createTaustePublicationId,
  filterTausteOfferPublications,
  parseTausteRelatedPublications,
} from './tauste-api-client';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

interface RelatedPublicationTestResource extends JsonObject {
  readonly coverImgSrc: string;
  readonly hidePublishDate: boolean;
  readonly datePublished: string;
  readonly screenname: string;
  readonly profileUrl: string;
  readonly name: string;
  readonly directLink: string;
}

describe('TausteApiClient', () => {
  it('uses the default fetcher when none is provided', () => {
    expect(() => new TausteApiClient()).not.toThrow();
  });

  it('fetches and maps Flipsnack related publications', async () => {
    const fetcher = createJsonFetcher(createRelatedPublicationsFixture());
    const client = new TausteApiClient({
      fetcher,
    });

    await expect(
      client.listPublications(createDefaultTaustePublicationDiscoveryInput()),
    ).resolves.toEqual([
      {
        publicationId: 'tauste:ofertas-tauste-especial-nestl-upigj9ho7k',
        title: 'Ofertas Tauste Especial Nestlé',
        directLink: 'ofertas-tauste-especial-nestl-upigj9ho7k.html',
        publicationUrl:
          'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-especial-nestl-upigj9ho7k.html',
        coverImageUrl:
          'https://d160aj0mj3npgx.cloudfront.net/9D99E5AF8D6/collections/upigj9ho7k/covers/f4E4nPEo879kJR15/small',
        publishedAtIso: '2026-08-11T10:00:03.000Z',
      },
      {
        publicationId: 'tauste:confeitaria-artesanal-tauste-upfo8lihp8',
        title: 'Confeitaria Artesanal Tauste',
        directLink: 'confeitaria-artesanal-tauste-upfo8lihp8.html',
        publicationUrl:
          'https://www.flipsnack.com/taustesupermercado/confeitaria-artesanal-tauste-upfo8lihp8.html',
        coverImageUrl:
          'https://d160aj0mj3npgx.cloudfront.net/9D99E5AF8D6/collections/upfo8lihp8/items/bbb79a6581973ff373317ci144383111/covers/page_1/small',
        publishedAtIso: '2024-07-23T09:34:10.000Z',
      },
    ]);
    const url = getFetchUrl(fetcher);

    expect(url.origin).toBe('https://api.flipsnack.com');
    expect(url.pathname).toBe('/v2/publications/related');
    expect(url.searchParams.get('p')).toBe('1');
    expect(url.searchParams.get('accountId')).toBe('9D99E5AF8D6');
    expect(url.searchParams.get('excludeId')).toBe('0');
    expect(url.searchParams.get('userUrl')).toBe('https://www.flipsnack.com/taustesupermercado/');
  });

  it('filters offer publications without keeping permanent catalogs', () => {
    const publications = parseTausteRelatedPublications(
      JSON.stringify(createRelatedPublicationsFixture()),
      'https://www.flipsnack.com/taustesupermercado/',
    );

    expect(
      filterTausteOfferPublications(publications).map((publication) => publication.title),
    ).toEqual(['Ofertas Tauste Especial Nestlé']);
  });

  it('creates deterministic publication ids from direct links', () => {
    expect(createTaustePublicationId('ofertas-tauste-marília3.html', 0)).toBe(
      'tauste:ofertas-tauste-marilia3',
    );
    expect(createTaustePublicationId('   ', 2)).toBe('tauste:publication-3');
  });

  it('rejects invalid responses, inputs, base URLs, and HTTP failures', async () => {
    expect(() =>
      parseTausteRelatedPublications('{}', 'https://www.flipsnack.com/taustesupermercado/'),
    ).toThrow('Invalid Tauste Flipsnack related publications response.');
    expect(() =>
      parseTausteRelatedPublications('[false]', 'https://www.flipsnack.com/taustesupermercado/'),
    ).toThrow('Invalid Tauste Flipsnack related publication.');
    expect(() =>
      parseTausteRelatedPublications(
        JSON.stringify([{ name: 'Ofertas Tauste Bauru' }]),
        'https://www.flipsnack.com/taustesupermercado/',
      ),
    ).toThrow('Invalid Tauste Flipsnack related publication.');
    expect(() =>
      parseTausteRelatedPublications(
        JSON.stringify([
          {
            coverImgSrc: 'https://cdn.example.com/cover.jpg',
            hidePublishDate: false,
            datePublished: '2026-08-11 10:00:03',
            screenname: '',
            profileUrl: '',
            name: 123,
            directLink: 'ofertas-tauste-bauru.html',
          },
        ]),
        'https://www.flipsnack.com/taustesupermercado/',
      ),
    ).toThrow('Invalid Tauste Flipsnack related publication.');
    expect(() =>
      parseTausteRelatedPublications(
        JSON.stringify([
          {
            coverImgSrc: 123,
            hidePublishDate: false,
            datePublished: '2026-08-11 10:00:03',
            screenname: '',
            profileUrl: '',
            name: 'Ofertas Tauste Bauru',
            directLink: 'ofertas-tauste-bauru.html',
          },
        ]),
        'https://www.flipsnack.com/taustesupermercado/',
      ),
    ).toThrow('Invalid Tauste Flipsnack related publication.');
    expect(() =>
      parseTausteRelatedPublications(
        JSON.stringify([
          {
            coverImgSrc: '',
            hidePublishDate: false,
            datePublished: 'not-a-date',
            screenname: '',
            profileUrl: '',
            name: 'Ofertas Tauste Bauru',
            directLink: 'ofertas-tauste-bauru.html',
          },
        ]),
        'https://www.flipsnack.com/taustesupermercado/',
      ),
    ).toThrow('Invalid Tauste Flipsnack publication date: not-a-date');
    expect(
      parseTausteRelatedPublications(
        JSON.stringify([
          {
            coverImgSrc: null,
            hidePublishDate: false,
            datePublished: null,
            screenname: null,
            profileUrl: null,
            name: 'Ofertas Tauste Bauru',
            directLink: 'ofertas-tauste-bauru.html',
          },
        ]),
        'https://www.flipsnack.com/taustesupermercado/',
      ),
    ).toEqual([
      {
        publicationId: 'tauste:ofertas-tauste-bauru',
        title: 'Ofertas Tauste Bauru',
        directLink: 'ofertas-tauste-bauru.html',
        publicationUrl: 'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-bauru.html',
        coverImageUrl: null,
        publishedAtIso: null,
      },
    ]);
    expect(() => new TausteApiClient({ apiBaseUrl: 'http://api.flipsnack.com/v2' })).toThrow(
      'apiBaseUrl must use https.',
    );

    const failedClient = new TausteApiClient({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response('', {
          status: 503,
          statusText: 'Unavailable',
        }),
      ),
    });

    await expect(
      failedClient.listPublications(createDefaultTaustePublicationDiscoveryInput()),
    ).rejects.toThrow('Tauste Flipsnack API request failed: 503 Unavailable');
    await expect(
      failedClient.listPublications({
        ...createDefaultTaustePublicationDiscoveryInput(),
        page: 0,
      }),
    ).rejects.toThrow('page must be a positive integer.');
    await expect(
      failedClient.listPublications({
        ...createDefaultTaustePublicationDiscoveryInput(),
        excludeId: -1,
      }),
    ).rejects.toThrow('excludeId must be a non-negative integer.');
    await expect(
      failedClient.listPublications({
        ...createDefaultTaustePublicationDiscoveryInput(),
        accountId: ' ',
      }),
    ).rejects.toThrow('accountId cannot be blank.');
    await expect(
      failedClient.listPublications({
        ...createDefaultTaustePublicationDiscoveryInput(),
        profileUrl: ' ',
      }),
    ).rejects.toThrow('profileUrl cannot be blank.');
  });

  it('fetches publication HTML from the configured Flipsnack origin', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html>Tauste</html>', {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      }),
    );
    const client = new TausteApiClient({ fetcher });

    await expect(
      client.fetchHtml('https://www.flipsnack.com/taustesupermercado/ofertas-tauste-bauru.html'),
    ).resolves.toBe('<html>Tauste</html>');
    expect(getFetchUrl(fetcher).pathname).toBe('/taustesupermercado/ofertas-tauste-bauru.html');

    await expect(client.fetchHtml('https://example.com/publication.html')).rejects.toThrow(
      'url must belong to the configured Tauste Flipsnack origin.',
    );

    const failedClient = new TausteApiClient({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response('', {
          status: 404,
          statusText: 'Not Found',
        }),
      ),
    });

    await expect(
      failedClient.fetchHtml(
        'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-bauru.html',
      ),
    ).rejects.toThrow('Tauste Flipsnack page request failed: 404 Not Found');
  });
});

function createRelatedPublicationsFixture(): readonly RelatedPublicationTestResource[] {
  return [
    {
      coverImgSrc:
        'https://d160aj0mj3npgx.cloudfront.net/9D99E5AF8D6/collections/upigj9ho7k/covers/f4E4nPEo879kJR15/small',
      hidePublishDate: false,
      datePublished: '2026-08-11 10:00:03',
      screenname: '',
      profileUrl: '',
      name: 'Ofertas Tauste Especial Nestlé',
      directLink: 'ofertas-tauste-especial-nestl-upigj9ho7k.html',
    },
    {
      coverImgSrc:
        'https://d160aj0mj3npgx.cloudfront.net/9D99E5AF8D6/collections/upfo8lihp8/items/bbb79a6581973ff373317ci144383111/covers/page_1/small',
      hidePublishDate: false,
      datePublished: '2024-07-23 09:34:10',
      screenname: '',
      profileUrl: '',
      name: 'Confeitaria Artesanal Tauste',
      directLink: 'confeitaria-artesanal-tauste-upfo8lihp8.html',
    },
  ];
}

function createJsonFetcher(response: readonly RelatedPublicationTestResource[]): typeof fetch {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }),
  );
}

function getFetchUrl(fetcher: typeof fetch): URL {
  const mockedFetcher = vi.mocked(fetcher);
  const firstCall = mockedFetcher.mock.calls[0];
  const firstInput = firstCall?.[0];

  if (!(firstInput instanceof URL)) {
    throw new Error('Expected first fetch input to be a URL.');
  }

  return firstInput;
}
