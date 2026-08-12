export interface AngeloniMonitoredRegion {
  readonly regionSlug: AngeloniRegionSlug;
  readonly regionName: string;
  readonly stateCode: AngeloniStateCode;
  readonly cityName: string;
  readonly homeUrl: string;
  readonly regionUrl: string;
}

export type AngeloniStateCode = 'SC';

export type AngeloniRegionSlug = 'regiao-florianopolis';

export const ANGELONI_HOME_URL = 'https://encartes.angeloni.com.br/';

export const ANGELONI_MONITORED_REGIONS = [
  createRegion({
    regionSlug: 'regiao-florianopolis',
    regionName: 'Florianópolis',
    stateCode: 'SC',
    cityName: 'Florianópolis',
    homeUrl: ANGELONI_HOME_URL,
    regionUrl: 'https://encartes.angeloni.com.br/regiao-florianopolis/',
  }),
] as const satisfies readonly AngeloniMonitoredRegion[];

export function listAngeloniMonitoredRegions(): readonly AngeloniMonitoredRegion[] {
  return ANGELONI_MONITORED_REGIONS;
}

export function findAngeloniMonitoredRegion(regionUrl: string): AngeloniMonitoredRegion | null {
  const normalizedUrl = normalizeUrl(regionUrl);

  return (
    ANGELONI_MONITORED_REGIONS.find(
      (region) => normalizeUrl(region.regionUrl) === normalizedUrl,
    ) ?? null
  );
}

function createRegion(input: AngeloniMonitoredRegion): AngeloniMonitoredRegion {
  return input;
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
