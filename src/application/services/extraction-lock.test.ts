import { describe, expect, it } from 'vitest';
import { InMemoryExtractionLock } from './extraction-lock';

describe('InMemoryExtractionLock', () => {
  it('acquires and releases a lock by key', () => {
    const lock = new InMemoryExtractionLock();

    expect(lock.acquire('carnauba')).toBe(true);
    expect(lock.isLocked('carnauba')).toBe(true);

    lock.release('carnauba');

    expect(lock.isLocked('carnauba')).toBe(false);
  });

  it('rejects overlapping lock acquisition for the same key', () => {
    const lock = new InMemoryExtractionLock();

    expect(lock.acquire('carnauba')).toBe(true);
    expect(lock.acquire('carnauba')).toBe(false);
  });

  it('keeps independent keys isolated', () => {
    const lock = new InMemoryExtractionLock();

    expect(lock.acquire('carnauba')).toBe(true);
    expect(lock.acquire('assai')).toBe(true);
    expect(lock.isLocked('carnauba')).toBe(true);
    expect(lock.isLocked('assai')).toBe(true);
  });
});
