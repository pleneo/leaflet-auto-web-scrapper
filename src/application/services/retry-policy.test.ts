import { describe, expect, it } from 'vitest';
import { InvalidRetryPolicyError, RetryPolicy } from './retry-policy';

describe('RetryPolicy', () => {
  it('allows retries while attempt number is below max attempts', () => {
    const policy = new RetryPolicy({
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
    });

    expect(policy.shouldRetry(1)).toBe(true);
    expect(policy.shouldRetry(2)).toBe(true);
    expect(policy.shouldRetry(3)).toBe(false);
  });

  it('calculates bounded exponential delay', () => {
    const policy = new RetryPolicy({
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 250,
    });

    expect(policy.getDelayMs(1)).toBe(100);
    expect(policy.getDelayMs(2)).toBe(200);
    expect(policy.getDelayMs(3)).toBe(250);
  });

  it('rejects invalid configuration', () => {
    expect(
      () =>
        new RetryPolicy({
          maxAttempts: 0,
          baseDelayMs: 100,
          maxDelayMs: 1_000,
        }),
    ).toThrow(InvalidRetryPolicyError);
  });

  it('rejects negative base delay', () => {
    expect(
      () =>
        new RetryPolicy({
          maxAttempts: 3,
          baseDelayMs: -1,
          maxDelayMs: 1_000,
        }),
    ).toThrow(InvalidRetryPolicyError);
  });

  it('rejects max delay below base delay', () => {
    expect(
      () =>
        new RetryPolicy({
          maxAttempts: 3,
          baseDelayMs: 1_000,
          maxDelayMs: 999,
        }),
    ).toThrow(InvalidRetryPolicyError);
  });

  it('rejects invalid attempt numbers', () => {
    const policy = new RetryPolicy({
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
    });

    expect(() => policy.getDelayMs(0)).toThrow(InvalidRetryPolicyError);
  });
});
