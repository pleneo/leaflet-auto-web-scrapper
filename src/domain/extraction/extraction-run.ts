import type { ExtractionRunStatus } from './extraction-run-status';
import type { SupermarketId } from '../supermarket/supermarket-id';

export interface ExtractionRunSummary {
  readonly runId: string;
  readonly supermarketId: SupermarketId;
  readonly status: ExtractionRunStatus;
  readonly scheduledAtIso: string;
  readonly startedAtIso: string | null;
  readonly completedAtIso: string | null;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
}
