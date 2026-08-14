import { describe, expect, it } from 'vitest';
import {
  BistekTargetsParseError,
  parseBistekCitiesFromHtml,
  parseBistekStoresFromHtml,
  parseBistekTargetsFromHtml,
} from './bistek-targets';

describe('Bistek targets parser', () => {
  it('discovers monitored stores from embedded city and store variables', () => {
    expect(parseBistekTargetsFromHtml(createTargetsHtml())).toEqual([
      {
        cityId: '4348',
        stateCode: 'SC',
        cityName: 'Blumenau',
        storeId: '2',
        storeName: 'Loja Nº 4 - Bairro Garcia',
        storeSlug: 'sc-blumenau-loja-no-4-bairro-garcia-2',
      },
      {
        cityId: '4932',
        stateCode: 'RS',
        cityName: 'Porto Alegre',
        storeId: '21',
        storeName: 'Loja Nº 26 - Vila Ipiranga',
        storeSlug: 'rs-porto-alegre-loja-no-26-vila-ipiranga-21',
      },
    ]);
  });

  it('parses coordinates and converts zero placeholders to null', () => {
    expect(parseBistekStoresFromHtml(createTargetsHtml())).toEqual([
      {
        cityId: '4348',
        storeId: '2',
        storeName: 'Loja Nº 4 - Bairro Garcia',
        latitude: -26.927026,
        longitude: -49.0570483,
      },
      {
        cityId: '4932',
        storeId: '21',
        storeName: 'Loja Nº 26 - Vila Ipiranga',
        latitude: null,
        longitude: null,
      },
    ]);
  });

  it('rejects malformed city and store payloads', () => {
    expect(() =>
      parseBistekCitiesFromHtml('var cidades_list = {"4348":"Blumenau"}; var lojas = [];'),
    ).toThrow(BistekTargetsParseError);
    expect(() =>
      parseBistekCitiesFromHtml('var cidades_list = {"4348":"SC -   "}; var lojas = [];'),
    ).toThrow('Bistek city has unsupported display name: SC -   .');
    expect(() =>
      parseBistekCitiesFromHtml('var cidades_list = {"4348":123}; var lojas = [];'),
    ).toThrow('Bistek city 4348 must have a string name.');
    expect(() => parseBistekCitiesFromHtml('var cidades_list = {}; var lojas = [];')).toThrow(
      'Bistek cidades_list did not expose selectable cities.',
    );
    expect(() => parseBistekCitiesFromHtml('var cidades_list = []; var lojas = [];')).toThrow(
      'Bistek cidades_list must be an object.',
    );
    expect(() => parseBistekStoresFromHtml('var cidades_list = {}; var lojas = {};')).toThrow(
      'Bistek lojas must be an array.',
    );
    expect(() => parseBistekStoresFromHtml('var cidades_list = {}; var lojas = [];')).toThrow(
      'Bistek lojas did not expose selectable stores.',
    );
    expect(() => parseBistekStoresFromHtml('var cidades_list = {}; var lojas = [null];')).toThrow(
      'Bistek store at index 0 must be an object.',
    );
    expect(() =>
      parseBistekStoresFromHtml('var cidades_list = {}; var lojas = [{"cidade":"4348"}];'),
    ).toThrow(BistekTargetsParseError);
    expect(() =>
      parseBistekTargetsFromHtml(`
        var cidades_list = {"4348":"SC - Blumenau"};
        var lojas = [{"cidade":"9999","id":"2","loja":"Loja","lat":"1","lng":"2"}];
      `),
    ).toThrow('Bistek store references unknown city: 9999.');
    expect(() => parseBistekCitiesFromHtml('var lojas = [];')).toThrow(
      'Bistek page did not expose cidades_list.',
    );
    expect(() => parseBistekTargetsFromHtml('')).toThrow('html cannot be blank.');
  });
});

function createTargetsHtml(): string {
  return `
    <script>
      var lojas = [
        {"cidade":"4348","id":"2","loja":"Loja Nº 4 - Bairro Garcia","lat":"-26.92702600","lng":"-49.05704830"},
        {"cidade":"4932","id":"21","loja":"Loja Nº 26 - Vila Ipiranga","lat":"0.00000000","lng":"0.00000000"}
      ];
      var cidades_list = {"0":"Cidade","4348":"SC - Blumenau","4932":"RS - Porto Alegre"};
    </script>
  `;
}
