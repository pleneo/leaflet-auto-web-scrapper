import { describe, expect, it } from 'vitest';
import type { ExtractionTarget } from '../../domain/extraction/extraction-target';
import {
  DuplicateExtractionTargetError,
  ExtractionTargetNotFoundError,
  ExtractionTargetRegistry,
} from './extraction-target-registry';

const carnaubaTarget: ExtractionTarget = {
  targetId: 'carnauba',
  supermarketId: 'carnauba',
  supermarketName: 'Carnauba Supermercados',
  mode: 'playwright',
  enabled: true,
  intervalMinutes: 60,
  maxAttempts: 3,
};

const assaiTarget: ExtractionTarget = {
  targetId: 'assai',
  supermarketId: 'assai',
  supermarketName: 'Assaí Atacadista',
  mode: 'playwright',
  enabled: false,
  intervalMinutes: 120,
  maxAttempts: 3,
};

describe('ExtractionTargetRegistry', () => {
  it('lists only enabled extraction targets', () => {
    const registry = new ExtractionTargetRegistry([carnaubaTarget, assaiTarget]);

    expect(registry.listEnabled()).toEqual([carnaubaTarget]);
  });

  it('gets a target by id', () => {
    const registry = new ExtractionTargetRegistry([carnaubaTarget]);

    expect(registry.get('carnauba')).toBe(carnaubaTarget);
  });

  it('filters enabled targets by id', () => {
    const registry = new ExtractionTargetRegistry([carnaubaTarget, assaiTarget]);

    expect(registry.filterEnabledByIds(['carnauba', 'assai'])).toEqual([carnaubaTarget]);
  });

  it('rejects duplicate targets', () => {
    expect(() => new ExtractionTargetRegistry([carnaubaTarget, carnaubaTarget])).toThrow(
      DuplicateExtractionTargetError,
    );
  });

  it('throws when a target is not registered', () => {
    const registry = new ExtractionTargetRegistry([carnaubaTarget]);

    expect(() => registry.get('assai')).toThrow(ExtractionTargetNotFoundError);
  });
});
