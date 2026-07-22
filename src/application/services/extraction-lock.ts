export interface ExtractionLock {
  acquire(key: string): boolean;
  release(key: string): void;
  isLocked(key: string): boolean;
}

export class InMemoryExtractionLock implements ExtractionLock {
  private readonly lockedKeys = new Set<string>();

  acquire(key: string): boolean {
    if (this.lockedKeys.has(key)) {
      return false;
    }

    this.lockedKeys.add(key);
    return true;
  }

  release(key: string): void {
    this.lockedKeys.delete(key);
  }

  isLocked(key: string): boolean {
    return this.lockedKeys.has(key);
  }
}
