import { describe, expect, it } from 'vitest';
import {
  ANGELONI_HOME_URL,
  findAngeloniMonitoredRegion,
  listAngeloniMonitoredRegions,
} from './angeloni-targets';

describe('Angeloni monitored regions', () => {
  it('lists the monitored regions provided by the business scope', () => {
    const regions = listAngeloniMonitoredRegions();

    expect(ANGELONI_HOME_URL).toBe('https://encartes.angeloni.com.br/');
    expect(regions).toEqual([
      {
        regionSlug: 'regiao-florianopolis',
        regionName: 'Florianópolis',
        stateCode: 'SC',
        cityName: 'Florianópolis',
        homeUrl: 'https://encartes.angeloni.com.br/',
        regionUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
      },
    ]);
  });

  it('keeps region urls unique and absolute', () => {
    const urls = listAngeloniMonitoredRegions().map((region) => region.regionUrl);

    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((url) => new URL(url).origin === 'https://encartes.angeloni.com.br')).toBe(
      true,
    );
  });

  it('finds monitored regions by url ignoring trailing slashes', () => {
    const region = findAngeloniMonitoredRegion(
      'https://encartes.angeloni.com.br/regiao-florianopolis/',
    );

    expect(region).toMatchObject({
      regionSlug: 'regiao-florianopolis',
      regionName: 'Florianópolis',
    });
    expect(findAngeloniMonitoredRegion('https://encartes.angeloni.com.br/regiao-joinville')).toBe(
      null,
    );
  });
});
