import { describe, expect, it } from 'vitest';
import { createLeafletId } from './leaflet-id';

describe('createLeafletId', () => {
  it('creates a stable slug from a title and card index', () => {
    expect(createLeafletId('São joão é gol de sabor e tradição', 0)).toBe(
      '1-sao-joao-e-gol-de-sabor-e-tradicao',
    );
  });

  it('falls back to a positional id when the title has no sluggable content', () => {
    expect(createLeafletId('🔥🛒', 2)).toBe('leaflet-3');
  });
});
