import type { SupermarketId } from './supermarket-id';

export interface SupermarketProfile {
  readonly supermarketId: SupermarketId;
  readonly supermarketName: string;
  readonly anchorUrl: string;
  readonly enabled: boolean;
  readonly intervalMinutes: number;
  readonly maxAttempts: number;
}
