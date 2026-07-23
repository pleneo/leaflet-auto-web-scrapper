import { afterEach, describe, expect, it, vi } from 'vitest';
import { SuperDoPovoApiClient, type SuperDoPovoAuthTokenProvider } from './superdopovo-api-client';

describe('SuperDoPovoApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists shops from the authenticated addresses endpoint', async () => {
    vi.stubGlobal('fetch', createFetch(JSON.stringify([createShopResponse()])));
    const client = new SuperDoPovoApiClient({
      baseUrl: 'https://loja.superdopovo.com.br/api/v1/',
      authTokenProvider: new FixedAuthTokenProvider(),
    });

    await expect(client.listShops()).resolves.toEqual([
      {
        shopId: 24,
        name: 'Serrinha',
        address: {
          zipcode: '60744-780',
          street: 'R XII',
          number: '200',
          neighborhood: 'SERRINHA',
          city: 'FORTALEZA',
          state: 'CE',
        },
      },
    ]);
    const fetchMock = vi.mocked(fetch);
    const requestInit = fetchMock.mock.calls[0]?.[1];

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://loja.superdopovo.com.br/api/v1/shops/addresses',
    );
    expect(requestInit?.headers).toMatchObject({
      Authorization: 'Bearer token',
    });
  });

  it('lists booklets with cover, links and sheet images deduplicated', async () => {
    vi.stubGlobal('fetch', createFetch(JSON.stringify([createBookletResponse()])));
    const client = new SuperDoPovoApiClient({
      baseUrl: 'https://loja.superdopovo.com.br/api/v1',
      authTokenProvider: new FixedAuthTokenProvider(),
    });

    await expect(client.listBooklets(24)).resolves.toEqual([
      {
        bookletId: 1596,
        name: 'WhatsApp Image.jpeg',
        startDateIso: '2026-07-13',
        endDateIso: '2026-08-02',
        coverImageUrl: 'https://cdn.example.com/cover.jpeg',
        imageUrls: ['https://cdn.example.com/cover.jpeg', 'https://cdn.example.com/sheet.jpeg'],
        shopId: 24,
      },
    ]);
  });

  it('uses fallback values for optional booklet fields', async () => {
    vi.stubGlobal(
      'fetch',
      createFetch(
        JSON.stringify([
          {
            id: 1609,
            name: 'Daily booklet',
            link: 'https://cdn.example.com/daily.jpeg',
          },
        ]),
      ),
    );
    const client = new SuperDoPovoApiClient({
      baseUrl: 'https://loja.superdopovo.com.br/api/v1',
      authTokenProvider: new FixedAuthTokenProvider(),
    });

    await expect(client.listBooklets(57)).resolves.toEqual([
      {
        bookletId: 1609,
        name: 'Daily booklet',
        startDateIso: null,
        endDateIso: null,
        coverImageUrl: 'https://cdn.example.com/daily.jpeg',
        imageUrls: ['https://cdn.example.com/daily.jpeg'],
        shopId: 57,
      },
    ]);
  });

  it('uses blank address values when optional shop address fields are absent', async () => {
    vi.stubGlobal(
      'fetch',
      createFetch(
        JSON.stringify([
          {
            id: 57,
            name: 'Cambeba',
            address: {},
          },
        ]),
      ),
    );
    const client = new SuperDoPovoApiClient({
      baseUrl: 'https://loja.superdopovo.com.br/api/v1',
      authTokenProvider: new FixedAuthTokenProvider(),
    });

    await expect(client.listShops()).resolves.toEqual([
      {
        shopId: 57,
        name: 'Cambeba',
        address: {
          zipcode: '',
          street: '',
          number: '',
          neighborhood: '',
          city: '',
          state: '',
        },
      },
    ]);
  });

  it('rejects invalid inputs and invalid response shapes', async () => {
    const client = new SuperDoPovoApiClient({
      baseUrl: 'https://loja.superdopovo.com.br/api/v1',
      authTokenProvider: new FixedAuthTokenProvider(),
    });

    await expect(client.listBooklets(0)).rejects.toThrow('shopId must be a positive integer.');

    vi.stubGlobal('fetch', createFetch('{}'));
    await expect(client.listShops()).rejects.toThrow(
      'Expected Super do Povo response at /shops/addresses to be an array.',
    );

    vi.stubGlobal('fetch', createFetch(JSON.stringify([{}])));
    await expect(client.listShops()).rejects.toThrow('Invalid Super do Povo shop response.');

    vi.stubGlobal('fetch', createFetch(JSON.stringify([{}])));
    await expect(client.listBooklets(24)).rejects.toThrow(
      'Invalid Super do Povo booklet response.',
    );
  });

  it('rejects non-successful responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('', {
            status: 401,
            statusText: 'Unauthorized',
          }),
        ),
      ),
    );
    const client = new SuperDoPovoApiClient({
      baseUrl: 'https://loja.superdopovo.com.br/api/v1',
      authTokenProvider: new FixedAuthTokenProvider(),
    });

    await expect(client.listShops()).rejects.toThrow(
      'Super do Povo request failed: 401 Unauthorized',
    );
  });
});

class FixedAuthTokenProvider implements SuperDoPovoAuthTokenProvider {
  getAuthorizationHeader(): Promise<string> {
    return Promise.resolve('Bearer token');
  }
}

function createFetch(body: string): typeof fetch {
  return vi.fn(() =>
    Promise.resolve(
      new Response(body, {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json',
        },
      }),
    ),
  );
}

function createShopResponse(): object {
  return {
    id: 24,
    name: 'Serrinha',
    address: {
      zipcode: '60744-780',
      street: 'R XII',
      number: '200',
      neighborhood: 'SERRINHA',
      city: 'FORTALEZA',
      state: 'CE',
    },
  };
}

function createBookletResponse(): object {
  return {
    id: 1596,
    name: 'WhatsApp Image.jpeg',
    start: '2026-07-13',
    end: '2026-08-02',
    link: 'https://cdn.example.com/cover.jpeg',
    links: ['https://cdn.example.com/sheet.jpeg'],
    pivot: {
      shop_id: 24,
    },
    sheets: [
      {
        id: 1498,
        booklet_id: 1596,
        link: 'https://cdn.example.com/sheet.jpeg',
      },
    ],
  };
}
