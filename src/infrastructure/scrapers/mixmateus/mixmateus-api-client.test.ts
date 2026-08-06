import { describe, expect, it, vi } from 'vitest';
import {
  MixMateusApiClient,
  parseCityResponse,
  parseLeafletResponse,
  parseStateResponse,
  parseStoreResponse,
} from './mixmateus-api-client';

describe('MixMateusApiClient', () => {
  it('fetches states through the API proxy', async () => {
    const fetcher = createJsonFetcher({
      status: 'success',
      data: [
        {
          sigla: ' ce ',
          descricao: ' Ceará ',
        },
      ],
      count: 1,
    });
    const client = new MixMateusApiClient({
      baseUrl: 'https://ofertasmateus.com/',
      fetcher,
    });

    await expect(client.listStates()).resolves.toEqual([
      {
        stateCode: 'CE',
        name: 'Ceará',
      },
    ]);
    expect(getFetchUrl(fetcher, 0)).toBe(
      'https://ofertasmateus.com/api-proxy.php?endpoint=%2Festados',
    );
  });

  it('fetches cities, stores, and leaflets with encoded endpoints', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          status: 'success',
          data: [
            {
              idcidade: 'fortaleza',
              estado: 'CE',
              descricao: ' Fortaleza ',
            },
          ],
          count: 1,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          status: 'success',
          data: [
            {
              idloja: 'mix-henrique-jorge',
              cidade: 'fortaleza',
              nome_exibicao: ' Mix Mateus Henrique Jorge ',
              endereco: 'Address',
              mapa: 'Map',
              marca: 'MA',
            },
          ],
          count: 1,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          status: 'success',
          data: [
            {
              id_encarte: 13961,
              descricao: ' Exclusivo Itambé ',
              arquivo: ' uploads/encartes/file.pdf ',
              marca: 'MA',
              validade: '2026-08-16 23:59:00',
              valido: '16/08/2026 23:59',
              inicio: '2026-08-05 18:00:00',
              inicial: '05/08/2026 18:00',
            },
          ],
          count: 1,
        }),
      );
    const client = new MixMateusApiClient({
      baseUrl: 'https://ofertasmateus.com',
      fetcher,
    });

    await expect(client.listCities('CE')).resolves.toEqual([
      {
        citySlug: 'fortaleza',
        stateCode: 'CE',
        name: 'Fortaleza',
      },
    ]);
    await expect(client.listStores('fortaleza')).resolves.toEqual([
      {
        storeSlug: 'mix-henrique-jorge',
        citySlug: 'fortaleza',
        displayName: 'Mix Mateus Henrique Jorge',
        address: 'Address',
        mapReference: 'Map',
        brandCode: 'MA',
      },
    ]);
    await expect(
      client.listLeaflets({
        stateCode: 'CE',
        citySlug: 'fortaleza',
        storeSlug: 'mix-henrique-jorge',
        brandCode: 'MA',
      }),
    ).resolves.toEqual([
      {
        leafletId: 13961,
        title: 'Exclusivo Itambé',
        filePath: 'uploads/encartes/file.pdf',
        brandCode: 'MA',
        validUntilIso: '2026-08-16 23:59:00',
        validUntilText: '16/08/2026 23:59',
        startsAtIso: '2026-08-05 18:00:00',
        startsAtText: '05/08/2026 18:00',
      },
    ]);
    expect(getFetchUrl(fetcher, 2)).toBe(
      'https://ofertasmateus.com/api-proxy.php?endpoint=%2Fencartes%2Fce%2Ffortaleza%2Fmix-henrique-jorge%3Fmarca%3DMA',
    );
  });

  it('builds proxied PDF URLs', () => {
    const client = new MixMateusApiClient({
      baseUrl: 'https://ofertasmateus.com',
    });

    expect(client.buildPdfUrl('uploads/encartes/file.pdf')).toBe(
      'https://ofertasmateus.com/api-proxy.php?file=uploads%2Fencartes%2Ffile.pdf',
    );
  });

  it('rejects invalid API envelopes and HTTP failures', async () => {
    const invalidClient = new MixMateusApiClient({
      baseUrl: 'https://ofertasmateus.com',
      fetcher: createJsonFetcher({
        status: 'error',
        data: [],
        count: 0,
      }),
    });
    const failedClient = new MixMateusApiClient({
      baseUrl: 'https://ofertasmateus.com',
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response('', {
          status: 500,
          statusText: 'Server Error',
        }),
      ),
    });

    await expect(invalidClient.listStates()).rejects.toThrow('Invalid Mix Mateus API response');
    await expect(failedClient.listStates()).rejects.toThrow(
      'Mix Mateus API request failed: 500 Server Error',
    );
  });

  it('rejects invalid parsed resources', () => {
    expect(() => parseStateResponse({ descricao: 'Ceará' })).toThrow(
      'Invalid Mix Mateus state response.',
    );
    expect(() => parseCityResponse({ idcidade: 'fortaleza', estado: 'CE' })).toThrow(
      'Invalid Mix Mateus city response.',
    );
    expect(() =>
      parseStoreResponse({
        idloja: 'mix-henrique-jorge',
        cidade: 'fortaleza',
        nome_exibicao: 'Mix Mateus Henrique Jorge',
      }),
    ).toThrow('Invalid Mix Mateus store response.');
    expect(
      parseStoreResponse({
        idloja: 'mix-henrique-jorge',
        cidade: 'fortaleza',
        nome_exibicao: 'Mix Mateus Henrique Jorge',
        marca: 'MA',
      }),
    ).toEqual({
      storeSlug: 'mix-henrique-jorge',
      citySlug: 'fortaleza',
      displayName: 'Mix Mateus Henrique Jorge',
      address: '',
      mapReference: '',
      brandCode: 'MA',
    });
    expect(() =>
      parseLeafletResponse({
        id_encarte: 13961,
        descricao: 'Exclusivo Itambé',
        arquivo: 'uploads/encartes/file.pdf',
      }),
    ).toThrow('Invalid Mix Mateus leaflet response.');
  });

  it('rejects invalid configuration and blank inputs', async () => {
    const client = new MixMateusApiClient({
      baseUrl: 'https://ofertasmateus.com',
      fetcher: createJsonFetcher({ status: 'success', data: [], count: 0 }),
    });

    expect(() => new MixMateusApiClient({ baseUrl: 'invalid-url' })).toThrow(
      'baseUrl must be absolute and valid.',
    );
    await expect(client.listCities(' ')).rejects.toThrow('stateCode cannot be blank.');
    await expect(client.listStores(' ')).rejects.toThrow('citySlug cannot be blank.');
    await expect(
      client.listLeaflets({
        stateCode: 'CE',
        citySlug: 'fortaleza',
        storeSlug: '',
        brandCode: 'MA',
      }),
    ).rejects.toThrow('storeSlug cannot be blank.');
    expect(() => client.buildPdfUrl(' ')).toThrow('filePath cannot be blank.');
  });
});

function createJsonFetcher(json: object): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse(json));
}

function getFetchUrl(fetcher: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number): string {
  const requestInfo = fetcher.mock.calls[callIndex]?.[0];

  if (requestInfo instanceof URL) {
    return requestInfo.toString();
  }

  if (typeof requestInfo === 'string') {
    return requestInfo;
  }

  throw new Error(`Fetch call ${String(callIndex)} was not made with a URL.`);
}

function createJsonResponse(json: object): Response {
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
