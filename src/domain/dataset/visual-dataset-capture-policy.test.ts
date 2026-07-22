import { describe, expect, it } from 'vitest';
import {
  InvalidVisualDatasetCapturePolicyError,
  parseVisualDatasetCapturePolicy,
} from './visual-dataset-capture-policy';

describe('parseVisualDatasetCapturePolicy', () => {
  it('accepts supported capture policies', () => {
    expect(parseVisualDatasetCapturePolicy('always')).toBe('always');
    expect(parseVisualDatasetCapturePolicy('disabled')).toBe('disabled');
  });

  it('rejects unsupported capture policies', () => {
    expect(() => parseVisualDatasetCapturePolicy('new_leaflets_only')).toThrow(
      InvalidVisualDatasetCapturePolicyError,
    );
  });
});
