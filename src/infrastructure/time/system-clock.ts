import type { Clock } from '../../application/ports/clock';

export class SystemClock implements Clock {
  nowIso(): string {
    return new Date().toISOString();
  }
}
