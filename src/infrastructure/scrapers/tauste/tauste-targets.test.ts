import { describe, expect, it } from 'vitest';
import {
  TAUSTE_FLIPSNACK_ACCOUNT_ID,
  TAUSTE_FLIPSNACK_API_BASE_URL,
  TAUSTE_FLIPSNACK_PROFILE_URL,
  TAUSTE_INSTITUTIONAL_HOME_URL,
  TAUSTE_INSTITUTIONAL_OFFERS_URL,
  TAUSTE_UNIT_ID,
  TAUSTE_UNIT_NAME,
  createDefaultTausteTargetConfig,
  normalizeTaustePublicationUrl,
} from './tauste-targets';

describe('Tauste targets', () => {
  it('keeps stable Tauste and Flipsnack anchors', () => {
    expect(createDefaultTausteTargetConfig()).toEqual({
      institutionalHomeUrl: TAUSTE_INSTITUTIONAL_HOME_URL,
      institutionalOffersUrl: TAUSTE_INSTITUTIONAL_OFFERS_URL,
      flipsnackProfileUrl: TAUSTE_FLIPSNACK_PROFILE_URL,
      flipsnackApiBaseUrl: TAUSTE_FLIPSNACK_API_BASE_URL,
      flipsnackAccountId: TAUSTE_FLIPSNACK_ACCOUNT_ID,
    });
    expect(TAUSTE_UNIT_ID).toBe('tauste-supermercados');
    expect(TAUSTE_UNIT_NAME).toBe('Tauste Supermercados');
  });

  it('keeps URLs absolute and on expected origins', () => {
    expect(new URL(TAUSTE_INSTITUTIONAL_HOME_URL).origin).toBe(
      'https://institucional.tauste.com.br',
    );
    expect(new URL(TAUSTE_INSTITUTIONAL_OFFERS_URL).origin).toBe(
      'https://institucional.tauste.com.br',
    );
    expect(new URL(TAUSTE_FLIPSNACK_PROFILE_URL).origin).toBe('https://www.flipsnack.com');
    expect(new URL(TAUSTE_FLIPSNACK_API_BASE_URL).origin).toBe('https://api.flipsnack.com');
  });

  it('normalizes publication direct links against the Tauste Flipsnack profile', () => {
    expect(normalizeTaustePublicationUrl('ofertas-tauste-bauru-zufbi5p7t9.html')).toBe(
      'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-bauru-zufbi5p7t9.html',
    );
    expect(
      normalizeTaustePublicationUrl(
        'https://www.flipsnack.com/taustesupermercado/ofertas-tauste-mar-lia3.html',
      ),
    ).toBe('https://www.flipsnack.com/taustesupermercado/ofertas-tauste-mar-lia3.html');
  });

  it('rejects blank publication direct links', () => {
    expect(() => normalizeTaustePublicationUrl(' ')).toThrow('directLink cannot be blank.');
  });
});
