import { describe, expect, it } from 'vitest';
import {
  InvalidBoundingBoxError,
  createPixelBoundingBox,
  normalizeBoundingBox,
} from './bounding-box';

describe('createPixelBoundingBox', () => {
  it('creates a pixel bounding box with derived dimensions', () => {
    const box = createPixelBoundingBox({
      xMin: 10,
      yMin: 20,
      xMax: 60,
      yMax: 90,
    });

    expect(box).toEqual({
      xMin: 10,
      yMin: 20,
      xMax: 60,
      yMax: 90,
      width: 50,
      height: 70,
    });
  });

  it('rejects zero-width boxes', () => {
    expect(() =>
      createPixelBoundingBox({
        xMin: 10,
        yMin: 20,
        xMax: 10,
        yMax: 90,
      }),
    ).toThrow(InvalidBoundingBoxError);
  });

  it('rejects zero-height boxes', () => {
    expect(() =>
      createPixelBoundingBox({
        xMin: 10,
        yMin: 20,
        xMax: 60,
        yMax: 20,
      }),
    ).toThrow(InvalidBoundingBoxError);
  });

  it('rejects non-finite coordinates', () => {
    expect(() =>
      createPixelBoundingBox({
        xMin: Number.POSITIVE_INFINITY,
        yMin: 20,
        xMax: 60,
        yMax: 90,
      }),
    ).toThrow(InvalidBoundingBoxError);
  });
});

describe('normalizeBoundingBox', () => {
  it('normalizes a document-relative bounding box', () => {
    const box = createPixelBoundingBox({
      xMin: 100,
      yMin: 200,
      xMax: 300,
      yMax: 500,
    });

    const normalized = normalizeBoundingBox(box, {
      width: 800,
      height: 1_000,
    });

    expect(normalized).toEqual({
      xCenter: 0.25,
      yCenter: 0.35,
      width: 0.25,
      height: 0.3,
    });
  });

  it('rejects boxes outside document dimensions', () => {
    const box = createPixelBoundingBox({
      xMin: 100,
      yMin: 200,
      xMax: 900,
      yMax: 500,
    });

    expect(() =>
      normalizeBoundingBox(box, {
        width: 800,
        height: 1_000,
      }),
    ).toThrow(InvalidBoundingBoxError);
  });

  it('rejects boxes starting outside the document', () => {
    const box = createPixelBoundingBox({
      xMin: -1,
      yMin: 200,
      xMax: 100,
      yMax: 500,
    });

    expect(() =>
      normalizeBoundingBox(box, {
        width: 800,
        height: 1_000,
      }),
    ).toThrow(InvalidBoundingBoxError);
  });

  it('rejects invalid document dimensions', () => {
    const box = createPixelBoundingBox({
      xMin: 100,
      yMin: 200,
      xMax: 300,
      yMax: 500,
    });

    expect(() =>
      normalizeBoundingBox(box, {
        width: 0,
        height: 1_000,
      }),
    ).toThrow(InvalidBoundingBoxError);

    expect(() =>
      normalizeBoundingBox(box, {
        width: 800,
        height: 0,
      }),
    ).toThrow(InvalidBoundingBoxError);
  });
});
