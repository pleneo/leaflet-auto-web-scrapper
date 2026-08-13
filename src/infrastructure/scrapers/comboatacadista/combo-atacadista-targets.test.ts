import { describe, expect, it } from 'vitest';
import {
  COMBO_ATACADISTA_HOME_URL,
  COMBO_ATACADISTA_OFFERS_URL,
  COMBO_ATACADISTA_UNIT,
} from './combo-atacadista-targets';

describe('Combo Atacadista targets', () => {
  it('keeps stable anchors and monitored unit metadata', () => {
    expect(COMBO_ATACADISTA_HOME_URL).toBe('https://www.comboatacadista.com.br/');
    expect(COMBO_ATACADISTA_OFFERS_URL).toBe('https://www.comboatacadista.com.br/ofertas');
    expect(COMBO_ATACADISTA_UNIT).toEqual({
      unitId: 'comboatacadista-online',
      unitName: 'Combo Atacadista',
    });
  });
});
