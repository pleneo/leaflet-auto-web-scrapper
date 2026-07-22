export type VisualDatasetCapturePolicy = 'always' | 'disabled';

export class InvalidVisualDatasetCapturePolicyError extends Error {
  constructor(value: string) {
    super(`Invalid Visual Dataset capture policy: ${value}.`);
    this.name = 'InvalidVisualDatasetCapturePolicyError';
  }
}

export function parseVisualDatasetCapturePolicy(value: string): VisualDatasetCapturePolicy {
  switch (value) {
    case 'always':
    case 'disabled':
      return value;
    default:
      throw new InvalidVisualDatasetCapturePolicyError(value);
  }
}
