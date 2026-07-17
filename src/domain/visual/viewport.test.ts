import { describe, expect, it } from 'vitest';
import { InvalidVisualViewportError, createVisualViewport } from './viewport';

describe('createVisualViewport', () => {
  it('creates a viewport with the default device scale factor', () => {
    const viewport = createVisualViewport({
      width: 1366,
      height: 768,
    });

    expect(viewport).toEqual({
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
    });
  });

  it('keeps an explicit device scale factor', () => {
    const viewport = createVisualViewport({
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
    });

    expect(viewport.deviceScaleFactor).toBe(3);
  });

  it('rejects non-integer dimensions', () => {
    expect(() =>
      createVisualViewport({
        width: 1366.5,
        height: 768,
      }),
    ).toThrow(InvalidVisualViewportError);
  });

  it('rejects non-positive dimensions', () => {
    expect(() =>
      createVisualViewport({
        width: 0,
        height: 768,
      }),
    ).toThrow(InvalidVisualViewportError);

    expect(() =>
      createVisualViewport({
        width: 1366,
        height: -1,
      }),
    ).toThrow(InvalidVisualViewportError);
  });

  it('rejects invalid device scale factors', () => {
    expect(() =>
      createVisualViewport({
        width: 1366,
        height: 768,
        deviceScaleFactor: 0,
      }),
    ).toThrow(InvalidVisualViewportError);

    expect(() =>
      createVisualViewport({
        width: 1366,
        height: 768,
        deviceScaleFactor: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(InvalidVisualViewportError);
  });
});
