export interface VisualViewportInput {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor?: number;
}

export interface VisualViewport {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
}

export class InvalidVisualViewportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidVisualViewportError';
  }
}

export function createVisualViewport(input: VisualViewportInput): VisualViewport {
  validatePositiveInteger(input.width, 'width');
  validatePositiveInteger(input.height, 'height');

  const deviceScaleFactor = input.deviceScaleFactor ?? 1;
  validatePositiveFiniteNumber(deviceScaleFactor, 'deviceScaleFactor');

  return {
    width: input.width,
    height: input.height,
    deviceScaleFactor,
  };
}

function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value)) {
    throw new InvalidVisualViewportError(`Viewport ${fieldName} must be an integer.`);
  }

  if (value <= 0) {
    throw new InvalidVisualViewportError(`Viewport ${fieldName} must be greater than zero.`);
  }
}

function validatePositiveFiniteNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new InvalidVisualViewportError(`Viewport ${fieldName} must be a finite number.`);
  }

  if (value <= 0) {
    throw new InvalidVisualViewportError(`Viewport ${fieldName} must be greater than zero.`);
  }
}
