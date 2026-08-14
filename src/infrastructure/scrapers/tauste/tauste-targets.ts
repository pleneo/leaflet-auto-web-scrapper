export const TAUSTE_INSTITUTIONAL_HOME_URL = 'https://institucional.tauste.com.br/';

export const TAUSTE_INSTITUTIONAL_OFFERS_URL = 'https://institucional.tauste.com.br/ofertas';

export const TAUSTE_FLIPSNACK_PROFILE_URL = 'https://www.flipsnack.com/taustesupermercado/';

export const TAUSTE_FLIPSNACK_API_BASE_URL = 'https://api.flipsnack.com/v2';

export const TAUSTE_FLIPSNACK_ACCOUNT_ID = '9D99E5AF8D6';

export const TAUSTE_UNIT_ID = 'tauste-supermercados';

export const TAUSTE_UNIT_NAME = 'Tauste Supermercados';

export type TausteStartUrlMode = 'flipsnack-profile' | 'institutional-home';

export interface TausteTargetConfig {
  readonly institutionalHomeUrl: string;
  readonly institutionalOffersUrl: string;
  readonly flipsnackProfileUrl: string;
  readonly flipsnackApiBaseUrl: string;
  readonly flipsnackAccountId: string;
}

export function createDefaultTausteTargetConfig(): TausteTargetConfig {
  return {
    institutionalHomeUrl: TAUSTE_INSTITUTIONAL_HOME_URL,
    institutionalOffersUrl: TAUSTE_INSTITUTIONAL_OFFERS_URL,
    flipsnackProfileUrl: TAUSTE_FLIPSNACK_PROFILE_URL,
    flipsnackApiBaseUrl: TAUSTE_FLIPSNACK_API_BASE_URL,
    flipsnackAccountId: TAUSTE_FLIPSNACK_ACCOUNT_ID,
  };
}

export function normalizeTaustePublicationUrl(directLink: string): string {
  const trimmed = directLink.trim();

  if (trimmed.length === 0) {
    throw new Error('directLink cannot be blank.');
  }

  return new URL(trimmed, TAUSTE_FLIPSNACK_PROFILE_URL).toString();
}
