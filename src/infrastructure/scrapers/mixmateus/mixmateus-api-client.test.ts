import { describe, expect, it, vi } from 'vitest';
import {
  MixMateusApiClient,
  parseCityResponse,
  parseLeafletResponse,
  parseStateResponse,
  parseStoreResponse,
} from './mixmateus-api-client';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

interface MixMateusApiTestEnvelope extends JsonObject {
  readonly status: 'success' | 'error';
  readonly data: readonly MixMateusApiTestResource[];
  readonly count: number;
}

type MixMateusApiTestResource =
  | MixMateusStateTestResource
  | MixMateusCityTestResource
  | MixMateusStoreTestResource
  | MixMateusLeafletTestResource;

interface MixMateusStateTestResource extends JsonObject {
  readonly sigla: string;
  readonly descricao: string;
}

interface MixMateusCityTestResource extends JsonObject {
  readonly idcidade: string;
  readonly estado: string;
  readonly descricao: string;
}

interface MixMateusStoreTestResource extends JsonObject {
  readonly idloja: string;
  readonly cidade: string;
  readonly nome_exibicao: string;
  readonly endereco?: string;
  readonly mapa?: string;
  readonly marca: string;
}

interface MixMateusLeafletTestResource extends JsonObject {
  readonly id_encarte: number;
  readonly descricao: string;
  readonly arquivo: string;
  readonly marca: string;
  readonly validade: string;
  readonly valido: string;
  readonly inicio: string;
  readonly inicial: string;
}

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

  it('keeps reserved endpoint characters bound to their path and query components', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(createJsonResponse({ status: 'success', data: [], count: 0 })),
      );
    const client = new MixMateusApiClient({
      baseUrl: 'https://ofertasmateus.com',
      fetcher,
    });

    await client.listCities('C/E');
    await client.listStores('fortaleza/north?x=1');
    await client.listLeaflets({
      stateCode: 'C/E',
      citySlug: 'fortaleza/north?x=1',
      storeSlug: 'mix/store&branch=1',
      brandCode: 'MA&debug=1',
    });

    expect(getEndpointParameter(fetcher, 0)).toBe('/estados/c%2Fe/cidades');
    expect(getEndpointParameter(fetcher, 1)).toBe('/cidades/fortaleza%2Fnorth%3Fx%3D1/lojas');
    expect(getEndpointParameter(fetcher, 2)).toBe(
      '/encartes/c%2Fe/fortaleza%2Fnorth%3Fx%3D1/mix%2Fstore%26branch%3D1?marca=MA%26debug%3D1',
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

  it('rejects malformed envelope shapes before resource parsing', async () => {
    const missingStatusClient = new MixMateusApiClient({
      baseUrl: 'https://ofertasmateus.com',
      fetcher: createRawJsonFetcher({
        data: [],
        count: 0,
      }),
    });
    const nonArrayClient = new MixMateusApiClient({
      baseUrl: 'https://ofertasmateus.com',
      fetcher: createRawJsonFetcher({
        status: 'success',
        data: false,
        count: 0,
      }),
    });
    const invalidCountClient = new MixMateusApiClient({
      baseUrl: 'https://ofertasmateus.com',
      fetcher: createRawJsonFetcher({
        status: 'success',
        data: [],
        count: '0',
      }),
    });

    await expect(missingStatusClient.listStates()).rejects.toThrow(
      'Invalid Mix Mateus API response envelope.',
    );
    await expect(nonArrayClient.listStates()).rejects.toThrow(
      'Invalid Mix Mateus API response envelope.',
    );
    await expect(invalidCountClient.listStates()).rejects.toThrow(
      'Invalid Mix Mateus API response envelope.',
    );
  });

  it('accepts successful envelopes without a count field', async () => {
    const client = new MixMateusApiClient({
      baseUrl: 'https://ofertasmateus.com',
      fetcher: createRawJsonFetcher({
        status: 'success',
        data: [],
      }),
    });

    await expect(client.listStates()).resolves.toEqual([]);
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
    expect(() =>
      parseStateResponse({
        sigla: 123,
        descricao: 'Ceará',
      }),
    ).toThrow('Invalid Mix Mateus state response.');
    expect(() =>
      parseStoreResponse({
        idloja: 'mix-henrique-jorge',
        cidade: 'fortaleza',
        nome_exibicao: 'Mix Mateus Henrique Jorge',
        marca: 'MA',
        endereco: 123,
      }),
    ).toThrow('Invalid Mix Mateus store response.');
    expect(() =>
      parseLeafletResponse({
        id_encarte: '13961',
        descricao: 'Exclusivo Itambé',
        arquivo: 'uploads/encartes/file.pdf',
        marca: 'MA',
        validade: '2026-08-16 23:59:00',
        valido: '16/08/2026 23:59',
        inicio: '2026-08-05 18:00:00',
        inicial: '05/08/2026 18:00',
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
    expect(() => new MixMateusApiClient({ baseUrl: 'ftp://ofertasmateus.com' })).toThrow(
      'baseUrl must be an absolute http(s) URL without credentials, query, or fragment.',
    );
    expect(() => new MixMateusApiClient({ baseUrl: 'https://user@ofertasmateus.com' })).toThrow(
      'baseUrl must be an absolute http(s) URL without credentials, query, or fragment.',
    );
    expect(() => new MixMateusApiClient({ baseUrl: 'https://ofertasmateus.com?source=x' })).toThrow(
      'baseUrl must be an absolute http(s) URL without credentials, query, or fragment.',
    );
    expect(() => new MixMateusApiClient({ baseUrl: 'https://ofertasmateus.com#top' })).toThrow(
      'baseUrl must be an absolute http(s) URL without credentials, query, or fragment.',
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

function createJsonFetcher(json: MixMateusApiTestEnvelope): ReturnType<typeof vi.fn<typeof fetch>> {
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

function getEndpointParameter(
  fetcher: ReturnType<typeof vi.fn<typeof fetch>>,
  callIndex: number,
): string {
  const endpoint = new URL(getFetchUrl(fetcher, callIndex)).searchParams.get('endpoint');

  if (endpoint === null) {
    throw new Error(`Fetch call ${String(callIndex)} did not include an endpoint parameter.`);
  }

  return endpoint;
}

function createJsonResponse(json: MixMateusApiTestEnvelope): Response {
  return createRawJsonResponse(json);
}

function createRawJsonFetcher(json: JsonValue): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockResolvedValue(createRawJsonResponse(json));
}

function createRawJsonResponse(json: JsonValue): Response {
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
