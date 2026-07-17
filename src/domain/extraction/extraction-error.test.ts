import { describe, expect, it } from 'vitest';
import { ExtractionFailure } from './extraction-error';

describe('ExtractionFailure', () => {
  it('keeps the typed extraction code and context', () => {
    const error = new ExtractionFailure('TARGET_LOCATOR_NOT_FOUND', {
      runId: 'run-1',
      supermarketId: 'carnauba',
      stateName: 'ANCHOR_PAGE',
      pageUrl: 'https://example.com',
      locatorDescription: 'role=button[name=Encartes]',
      message: 'Target locator was not found.',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ExtractionFailure');
    expect(error.code).toBe('TARGET_LOCATOR_NOT_FOUND');
    expect(error.context.supermarketId).toBe('carnauba');
    expect(error.message).toBe('Target locator was not found.');
  });
});
