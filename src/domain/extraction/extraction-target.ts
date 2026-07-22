import type { SupermarketId } from '../supermarket/supermarket-id';

export type ExtractionMode = 'playwright';

export interface ExtractionTarget {
  readonly targetId: string;
  readonly supermarketId: SupermarketId;
  readonly supermarketName: string;
  readonly mode: ExtractionMode;
  readonly enabled: boolean;
  readonly intervalMinutes: number;
  readonly maxAttempts: number;
}

export class InvalidExtractionTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidExtractionTargetError';
  }
}

export function createExtractionTarget(target: ExtractionTarget): ExtractionTarget {
  validateNonBlank(target.targetId, 'targetId');
  validateNonBlank(target.supermarketName, 'supermarketName');
  validatePositiveInteger(target.intervalMinutes, 'intervalMinutes');
  validatePositiveInteger(target.maxAttempts, 'maxAttempts');

  return {
    targetId: target.targetId.trim(),
    supermarketId: target.supermarketId,
    supermarketName: target.supermarketName.trim(),
    mode: target.mode,
    enabled: target.enabled,
    intervalMinutes: target.intervalMinutes,
    maxAttempts: target.maxAttempts,
  };
}

function validateNonBlank(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new InvalidExtractionTargetError(`${fieldName} cannot be blank.`);
  }
}

function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InvalidExtractionTargetError(`${fieldName} must be a positive integer.`);
  }
}
