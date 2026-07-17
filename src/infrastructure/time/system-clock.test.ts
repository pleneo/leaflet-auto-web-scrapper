import { describe, expect, it } from 'vitest';
import { SystemClock } from './system-clock';

describe('SystemClock', () => {
  it('returns the current instant as an ISO string', () => {
    const clock = new SystemClock();

    const value = clock.nowIso();

    expect(() => new Date(value).toISOString()).not.toThrow();
  });
});
