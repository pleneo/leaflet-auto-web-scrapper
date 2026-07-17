import { createCaptureRegion, type CaptureRegion } from '../../domain/visual/capture-region';
import type { VisualViewport } from '../../domain/visual/viewport';

export interface ScrollPosition {
  readonly scrollX: number;
  readonly scrollY: number;
}

export class InvalidCoordinateMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCoordinateMappingError';
  }
}

export class CoordinateMapper {
  mapViewportRegionToDocumentRegion(
    viewportRegion: CaptureRegion,
    scrollPosition: ScrollPosition,
  ): CaptureRegion {
    validateScrollPosition(scrollPosition);

    return createCaptureRegion({
      x: viewportRegion.x + scrollPosition.scrollX,
      y: viewportRegion.y + scrollPosition.scrollY,
      width: viewportRegion.width,
      height: viewportRegion.height,
    });
  }

  mapDocumentRegionToViewportRegion(
    documentRegion: CaptureRegion,
    scrollPosition: ScrollPosition,
  ): CaptureRegion {
    validateScrollPosition(scrollPosition);

    return createCaptureRegion({
      x: documentRegion.x - scrollPosition.scrollX,
      y: documentRegion.y - scrollPosition.scrollY,
      width: documentRegion.width,
      height: documentRegion.height,
    });
  }

  mapCssRegionToScreenshotRegion(
    cssRegion: CaptureRegion,
    viewport: VisualViewport,
  ): CaptureRegion {
    return createCaptureRegion({
      x: cssRegion.x * viewport.deviceScaleFactor,
      y: cssRegion.y * viewport.deviceScaleFactor,
      width: cssRegion.width * viewport.deviceScaleFactor,
      height: cssRegion.height * viewport.deviceScaleFactor,
    });
  }
}

function validateScrollPosition(scrollPosition: ScrollPosition): void {
  validateFiniteNumber(scrollPosition.scrollX, 'scrollX');
  validateFiniteNumber(scrollPosition.scrollY, 'scrollY');

  if (scrollPosition.scrollX < 0) {
    throw new InvalidCoordinateMappingError('scrollX cannot be negative.');
  }

  if (scrollPosition.scrollY < 0) {
    throw new InvalidCoordinateMappingError('scrollY cannot be negative.');
  }
}

function validateFiniteNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new InvalidCoordinateMappingError(`${fieldName} must be a finite number.`);
  }
}
