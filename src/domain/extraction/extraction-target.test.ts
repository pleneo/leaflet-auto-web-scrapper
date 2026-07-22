import { describe, expect, it } from 'vitest';
import { createExtractionTarget, InvalidExtractionTargetError } from './extraction-target';

describe('createExtractionTarget', () => {
  it('creates a normalized Playwright extraction target', () => {
    const target = createExtractionTarget({
      targetId: ' carnauba ',
      supermarketId: 'carnauba',
      supermarketName: ' Carnauba Supermercados ',
      mode: 'playwright',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 3,
    });

    expect(target).toEqual({
      targetId: 'carnauba',
      supermarketId: 'carnauba',
      supermarketName: 'Carnauba Supermercados',
      mode: 'playwright',
      enabled: true,
      intervalMinutes: 60,
      maxAttempts: 3,
    });
  });

  it('rejects blank identifiers and names', () => {
    expect(() =>
      createExtractionTarget({
        targetId: ' ',
        supermarketId: 'carnauba',
        supermarketName: 'Carnauba Supermercados',
        mode: 'playwright',
        enabled: true,
        intervalMinutes: 60,
        maxAttempts: 3,
      }),
    ).toThrow(InvalidExtractionTargetError);

    expect(() =>
      createExtractionTarget({
        targetId: 'carnauba',
        supermarketId: 'carnauba',
        supermarketName: ' ',
        mode: 'playwright',
        enabled: true,
        intervalMinutes: 60,
        maxAttempts: 3,
      }),
    ).toThrow(InvalidExtractionTargetError);
  });

  it('rejects invalid schedule values', () => {
    expect(() =>
      createExtractionTarget({
        targetId: 'carnauba',
        supermarketId: 'carnauba',
        supermarketName: 'Carnauba Supermercados',
        mode: 'playwright',
        enabled: true,
        intervalMinutes: 0,
        maxAttempts: 3,
      }),
    ).toThrow(InvalidExtractionTargetError);

    expect(() =>
      createExtractionTarget({
        targetId: 'carnauba',
        supermarketId: 'carnauba',
        supermarketName: 'Carnauba Supermercados',
        mode: 'playwright',
        enabled: true,
        intervalMinutes: 60,
        maxAttempts: 0,
      }),
    ).toThrow(InvalidExtractionTargetError);
  });
});
