import { describe, expect, it } from 'vitest';
import { createCaptureRegion } from '../../domain/visual/capture-region';
import { createVisualViewport } from '../../domain/visual/viewport';
import { CoordinateMapper, InvalidCoordinateMappingError } from './coordinate-mapper';

describe('CoordinateMapper', () => {
  const mapper = new CoordinateMapper();

  it('maps a viewport region to document coordinates using scroll offset', () => {
    const viewportRegion = createCaptureRegion({
      x: 20,
      y: 30,
      width: 200,
      height: 100,
    });

    const documentRegion = mapper.mapViewportRegionToDocumentRegion(viewportRegion, {
      scrollX: 10,
      scrollY: 300,
    });

    expect(documentRegion).toEqual({
      x: 30,
      y: 330,
      width: 200,
      height: 100,
      xMax: 230,
      yMax: 430,
      area: 20_000,
    });
  });

  it('maps a document region back to viewport coordinates', () => {
    const documentRegion = createCaptureRegion({
      x: 30,
      y: 330,
      width: 200,
      height: 100,
    });

    const viewportRegion = mapper.mapDocumentRegionToViewportRegion(documentRegion, {
      scrollX: 10,
      scrollY: 300,
    });

    expect(viewportRegion).toEqual({
      x: 20,
      y: 30,
      width: 200,
      height: 100,
      xMax: 220,
      yMax: 130,
      area: 20_000,
    });
  });

  it('maps css pixels to screenshot pixels using device scale factor', () => {
    const cssRegion = createCaptureRegion({
      x: 10,
      y: 20,
      width: 300,
      height: 150,
    });

    const screenshotRegion = mapper.mapCssRegionToScreenshotRegion(
      cssRegion,
      createVisualViewport({
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
      }),
    );

    expect(screenshotRegion).toEqual({
      x: 30,
      y: 60,
      width: 900,
      height: 450,
      xMax: 930,
      yMax: 510,
      area: 405_000,
    });
  });

  it('rejects invalid scroll positions', () => {
    const region = createCaptureRegion({
      x: 20,
      y: 30,
      width: 200,
      height: 100,
    });

    expect(() =>
      mapper.mapViewportRegionToDocumentRegion(region, {
        scrollX: -1,
        scrollY: 0,
      }),
    ).toThrow(InvalidCoordinateMappingError);

    expect(() =>
      mapper.mapViewportRegionToDocumentRegion(region, {
        scrollX: 0,
        scrollY: -1,
      }),
    ).toThrow(InvalidCoordinateMappingError);

    expect(() =>
      mapper.mapViewportRegionToDocumentRegion(region, {
        scrollX: Number.POSITIVE_INFINITY,
        scrollY: Number.NaN,
      }),
    ).toThrow(InvalidCoordinateMappingError);
  });
});
