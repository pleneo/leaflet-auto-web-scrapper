import { describe, expect, it } from 'vitest';
import {
  InvalidExtractionWorkerCommandOptionsError,
  parseExtractionWorkerCommandOptions,
} from './extraction-worker-command-options';

describe('parseExtractionWorkerCommandOptions', () => {
  it('returns worker defaults', () => {
    expect(parseExtractionWorkerCommandOptions([], {})).toEqual({
      intervalMs: 3_600_000,
      runImmediately: true,
      retryBaseDelayMs: 30_000,
      shutdownTimeoutMs: 30_000,
      stateRootDirectory: '.data/state',
      onlyTargetIds: [],
      visualDatasetCapturePolicy: 'always',
    });
  });

  it('reads values from environment', () => {
    expect(
      parseExtractionWorkerCommandOptions([], {
        WORKER_INTERVAL_MINUTES: '30',
        WORKER_RUN_IMMEDIATELY: 'false',
        WORKER_RETRY_BASE_DELAY_MS: '500',
        WORKER_SHUTDOWN_TIMEOUT_MS: '1000',
        EXTRACTION_STATE_DIR: '.data/custom-state',
        WORKER_ONLY_TARGETS: 'carnauba, assai',
        VISUAL_DATASET_CAPTURE_POLICY: 'disabled',
      }),
    ).toEqual({
      intervalMs: 1_800_000,
      runImmediately: false,
      retryBaseDelayMs: 500,
      shutdownTimeoutMs: 1_000,
      stateRootDirectory: '.data/custom-state',
      onlyTargetIds: ['carnauba', 'assai'],
      visualDatasetCapturePolicy: 'disabled',
    });
  });

  it('lets args override env values', () => {
    expect(
      parseExtractionWorkerCommandOptions(
        ['--interval-minutes', '5', '--state-root', '.data/arg-state', '--only', 'carnauba'],
        {
          WORKER_INTERVAL_MINUTES: '30',
          EXTRACTION_STATE_DIR: '.data/env-state',
          WORKER_ONLY_TARGETS: 'assai',
        },
      ),
    ).toMatchObject({
      intervalMs: 300_000,
      stateRootDirectory: '.data/arg-state',
      onlyTargetIds: ['carnauba'],
    });
  });

  it('rejects invalid scalar values', () => {
    expect(() => parseExtractionWorkerCommandOptions(['--interval-minutes', '0'], {})).toThrow(
      InvalidExtractionWorkerCommandOptionsError,
    );
    expect(() => parseExtractionWorkerCommandOptions(['--retry-base-delay-ms', '-1'], {})).toThrow(
      InvalidExtractionWorkerCommandOptionsError,
    );
    expect(() => parseExtractionWorkerCommandOptions(['--shutdown-timeout-ms', '0'], {})).toThrow(
      InvalidExtractionWorkerCommandOptionsError,
    );
    expect(() => parseExtractionWorkerCommandOptions(['--run-immediately', 'yes'], {})).toThrow(
      InvalidExtractionWorkerCommandOptionsError,
    );
    expect(() =>
      parseExtractionWorkerCommandOptions(['--visual-dataset-capture-policy', ' '], {}),
    ).toThrow(InvalidExtractionWorkerCommandOptionsError);
  });

  it('rejects invalid argument shape and capture policy', () => {
    expect(() => parseExtractionWorkerCommandOptions(['interval-minutes', '5'], {})).toThrow(
      InvalidExtractionWorkerCommandOptionsError,
    );
    expect(() => parseExtractionWorkerCommandOptions(['--interval-minutes'], {})).toThrow(
      InvalidExtractionWorkerCommandOptionsError,
    );
    expect(() =>
      parseExtractionWorkerCommandOptions(['--visual-dataset-capture-policy', 'sometimes'], {}),
    ).toThrow();
  });
});
