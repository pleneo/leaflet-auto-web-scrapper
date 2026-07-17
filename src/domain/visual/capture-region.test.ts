import { describe, expect, it } from 'vitest';
import { InvalidCaptureRegionError, createCaptureRegion } from './capture-region';

describe('createCaptureRegion', () => {
  it('creates a region with derived bounds and area', () => {
    const region = createCaptureRegion({
      x: 10,
      y: 20,
      width: 200,
      height: 100,
    });

    expect(region).toEqual({
      x: 10,
      y: 20,
      width: 200,
      height: 100,
      xMax: 210,
      yMax: 120,
      area: 20_000,
    });
  });

  it('rejects negative origins', () => {
    expect(() =>
      createCaptureRegion({
        x: -1,
        y: 0,
        width: 200,
        height: 100,
      }),
    ).toThrow(InvalidCaptureRegionError);

    expect(() =>
      createCaptureRegion({
        x: 0,
        y: -1,
        width: 200,
        height: 100,
      }),
    ).toThrow(InvalidCaptureRegionError);
  });

  it('rejects empty dimensions', () => {
    expect(() =>
      createCaptureRegion({
        x: 0,
        y: 0,
        width: 0,
        height: 100,
      }),
    ).toThrow(InvalidCaptureRegionError);

    expect(() =>
      createCaptureRegion({
        x: 0,
        y: 0,
        width: 200,
        height: 0,
      }),
    ).toThrow(InvalidCaptureRegionError);
  });

  it('rejects non-finite values', () => {
    expect(() =>
      createCaptureRegion({
        x: 0,
        y: Number.NaN,
        width: 200,
        height: 100,
      }),
    ).toThrow(InvalidCaptureRegionError);
  });
});
