import { afterEach, describe, expect, it, vi } from 'vitest';
import { MercadappCarnaubaApiClient } from './mercadapp-api-client';

describe('MercadappCarnaubaApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists Carnauba stores from Mercadapp markets endpoint', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: 79,
              name: 'Carnauba Maestro',
              cnpj: '05599698000127',
              corporate_name: 'Carnauba LTDA',
            },
            {
              id: 70,
              name: 'Carnauba Messejana',
            },
          ]),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const stores = await createClient().listStores();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://merconnect.mercadapp.com.br/mapp/v2/markets?brand_id=27',
      {
        headers: {
          Accept: 'application/json',
          Origin: 'https://carnaubasupermercados.com.br',
          Referer: 'https://carnaubasupermercados.com.br/',
        },
      },
    );
    expect(stores).toEqual([
      {
        storeId: 79,
        name: 'Carnauba Maestro',
        cnpj: '05599698000127',
        corporateName: 'Carnauba LTDA',
      },
      {
        storeId: 70,
        name: 'Carnauba Messejana',
        cnpj: '',
        corporateName: '',
      },
    ]);
  });

  it('lists flipbooks for a store', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              flipbooks: [
                {
                  id: 69362,
                  name: 'São joão',
                  images_urls: ['https://cdn.example.com/1.png', 'https://cdn.example.com/2.jpg'],
                },
              ],
            }),
            {
              status: 200,
            },
          ),
        ),
      ),
    );

    const flipbooks = await createClient().listFlipbooks(79);

    expect(flipbooks).toEqual([
      {
        flipbookId: 69362,
        name: 'São joão',
        images: [
          {
            order: 1,
            imageUrl: 'https://cdn.example.com/1.png',
          },
          {
            order: 2,
            imageUrl: 'https://cdn.example.com/2.jpg',
          },
        ],
      },
    ]);
  });

  it('rejects failed and malformed Mercadapp responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('Forbidden', {
            status: 403,
            statusText: 'Forbidden',
          }),
        ),
      ),
    );

    await expect(createClient().listStores()).rejects.toThrow(Error);

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ invalid: true }), {
            status: 200,
          }),
        ),
      ),
    );

    await expect(createClient().listStores()).rejects.toThrow(Error);

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
          }),
        ),
      ),
    );

    await expect(createClient().listFlipbooks(79)).rejects.toThrow(Error);

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify('invalid'), {
            status: 200,
          }),
        ),
      ),
    );

    await expect(createClient().listFlipbooks(79)).rejects.toThrow(Error);
  });
});

function createClient(): MercadappCarnaubaApiClient {
  return new MercadappCarnaubaApiClient({
    baseUrl: 'https://merconnect.mercadapp.com.br/mapp/v2/',
    brandId: 27,
  });
}
