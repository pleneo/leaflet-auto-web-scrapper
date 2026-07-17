export interface CaptureRegionInput {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CaptureRegion extends CaptureRegionInput {
  readonly xMax: number;
  readonly yMax: number;
  readonly area: number;
}

export class InvalidCaptureRegionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCaptureRegionError';
  }
}

export function createCaptureRegion(input: CaptureRegionInput): CaptureRegion {
  validateFiniteNumber(input.x, 'x');
  validateFiniteNumber(input.y, 'y');
  validateFiniteNumber(input.width, 'width');
  validateFiniteNumber(input.height, 'height');

  if (input.x < 0) {
    throw new InvalidCaptureRegionError('Capture region x cannot be negative.');
  }

  if (input.y < 0) {
    throw new InvalidCaptureRegionError('Capture region y cannot be negative.');
  }

  if (input.width <= 0) {
    throw new InvalidCaptureRegionError('Capture region width must be greater than zero.');
  }

  if (input.height <= 0) {
    throw new InvalidCaptureRegionError('Capture region height must be greater than zero.');
  }

  return {
    ...input,
    xMax: input.x + input.width,
    yMax: input.y + input.height,
    area: input.width * input.height,
  };
}

function validateFiniteNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new InvalidCaptureRegionError(`Capture region ${fieldName} must be a finite number.`);
  }
}
