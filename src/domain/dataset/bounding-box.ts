export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface DocumentScrollPosition {
  readonly scrollX: number;
  readonly scrollY: number;
}

export interface PixelBoundingBoxInput {
  readonly xMin: number;
  readonly yMin: number;
  readonly xMax: number;
  readonly yMax: number;
}

export interface PixelBoundingBox extends PixelBoundingBoxInput {
  readonly width: number;
  readonly height: number;
}

export interface NormalizedBoundingBox {
  readonly xCenter: number;
  readonly yCenter: number;
  readonly width: number;
  readonly height: number;
}

export class InvalidBoundingBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBoundingBoxError';
  }
}

export function createPixelBoundingBox(input: PixelBoundingBoxInput): PixelBoundingBox {
  validateFiniteCoordinate(input.xMin, 'xMin');
  validateFiniteCoordinate(input.yMin, 'yMin');
  validateFiniteCoordinate(input.xMax, 'xMax');
  validateFiniteCoordinate(input.yMax, 'yMax');

  const width = input.xMax - input.xMin;
  const height = input.yMax - input.yMin;

  if (width <= 0) {
    throw new InvalidBoundingBoxError('Bounding box width must be greater than zero.');
  }

  if (height <= 0) {
    throw new InvalidBoundingBoxError('Bounding box height must be greater than zero.');
  }

  return {
    ...input,
    width,
    height,
  };
}

export function normalizeBoundingBox(
  box: PixelBoundingBox,
  documentSize: ViewportSize,
): NormalizedBoundingBox {
  validateDocumentSize(documentSize);

  if (box.xMin < 0 || box.yMin < 0) {
    throw new InvalidBoundingBoxError('Bounding box cannot start outside the document.');
  }

  if (box.xMax > documentSize.width || box.yMax > documentSize.height) {
    throw new InvalidBoundingBoxError('Bounding box cannot exceed document dimensions.');
  }

  return {
    xCenter: (box.xMin + box.width / 2) / documentSize.width,
    yCenter: (box.yMin + box.height / 2) / documentSize.height,
    width: box.width / documentSize.width,
    height: box.height / documentSize.height,
  };
}

function validateFiniteCoordinate(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new InvalidBoundingBoxError(`${fieldName} must be a finite number.`);
  }
}

function validateDocumentSize(documentSize: ViewportSize): void {
  validateFiniteCoordinate(documentSize.width, 'document width');
  validateFiniteCoordinate(documentSize.height, 'document height');

  if (documentSize.width <= 0) {
    throw new InvalidBoundingBoxError('Document width must be greater than zero.');
  }

  if (documentSize.height <= 0) {
    throw new InvalidBoundingBoxError('Document height must be greater than zero.');
  }
}
