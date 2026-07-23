import type { SupermarketId } from '../supermarket/supermarket-id';

export type ExtractionUnitStateStatus = 'succeeded' | 'failed' | 'empty';

export type ExtractionLeafletStateStatus = 'active' | 'removed';

export interface ExtractionStateSnapshot {
  readonly version: 1;
  readonly targets: readonly ExtractionTargetState[];
}

export interface ExtractionTargetState {
  readonly targetId: string;
  readonly supermarketId: SupermarketId;
  readonly lastRunAtIso: string;
  readonly lastSuccessfulRunAtIso: string | null;
  readonly units: readonly ExtractionUnitState[];
}

export interface ExtractionUnitState {
  readonly unitId: string;
  readonly unitName: string;
  readonly sourceUrl: string;
  readonly status: ExtractionUnitStateStatus;
  readonly lastSeenAtIso: string;
  readonly lastSuccessfulSeenAtIso: string | null;
  readonly errorMessage: string | null;
  readonly leaflets: readonly ExtractionLeafletState[];
}

export interface ExtractionLeafletState {
  readonly leafletKey: string;
  readonly title: string;
  readonly contentSignature: string;
  readonly imageCount: number;
  readonly sourceUrl: string;
  readonly firstSeenAtIso: string;
  readonly lastSeenAtIso: string;
  readonly status: ExtractionLeafletStateStatus;
}

export function createEmptyExtractionStateSnapshot(): ExtractionStateSnapshot {
  return {
    version: 1,
    targets: [],
  };
}
