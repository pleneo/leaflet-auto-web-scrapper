import {
  parseVisualDatasetCapturePolicy,
  type VisualDatasetCapturePolicy,
} from '../../domain/dataset/visual-dataset-capture-policy';
import type { ExtractionMode } from '../../domain/extraction/extraction-target';

export interface ExtractionWorkerCommandOptions {
  readonly extractionMode: ExtractionMode;
  readonly intervalMs: number;
  readonly runImmediately: boolean;
  readonly retryBaseDelayMs: number;
  readonly shutdownTimeoutMs: number;
  readonly stateRootDirectory: string;
  readonly onlyTargetIds: readonly string[];
  readonly visualDatasetCapturePolicy: VisualDatasetCapturePolicy;
}

export class InvalidExtractionWorkerCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidExtractionWorkerCommandOptionsError';
  }
}

export function parseExtractionWorkerCommandOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): ExtractionWorkerCommandOptions {
  const values = parseNamedArguments(args);

  return {
    extractionMode: parseExtractionMode(
      readOption(values, env, 'extraction-mode', 'EXTRACTION_MODE', 'playwright'),
    ),
    intervalMs:
      readPositiveInteger(values, env, 'interval-minutes', 'WORKER_INTERVAL_MINUTES', 60) *
      60 *
      1_000,
    runImmediately: readBoolean(values, env, 'run-immediately', 'WORKER_RUN_IMMEDIATELY', true),
    retryBaseDelayMs: readNonNegativeInteger(
      values,
      env,
      'retry-base-delay-ms',
      'WORKER_RETRY_BASE_DELAY_MS',
      30_000,
    ),
    shutdownTimeoutMs: readPositiveInteger(
      values,
      env,
      'shutdown-timeout-ms',
      'WORKER_SHUTDOWN_TIMEOUT_MS',
      30_000,
    ),
    stateRootDirectory: readOption(
      values,
      env,
      'state-root',
      'EXTRACTION_STATE_DIR',
      '.data/state',
    ),
    onlyTargetIds: parseTargetIds(readOptionalOption(values, env, 'only', 'WORKER_ONLY_TARGETS')),
    visualDatasetCapturePolicy: parseVisualDatasetCapturePolicy(
      readOption(
        values,
        env,
        'visual-dataset-capture-policy',
        'VISUAL_DATASET_CAPTURE_POLICY',
        'always',
      ),
    ),
  };
}

function parseExtractionMode(value: string): ExtractionMode {
  switch (value) {
    case 'api':
    case 'hybrid':
    case 'playwright':
      return value;
    default:
      throw new InvalidExtractionWorkerCommandOptionsError(
        '--extraction-mode must be api, hybrid, or playwright.',
      );
  }
}

function parseNamedArguments(args: readonly string[]): ReadonlyMap<string, string> {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];

    if (key?.startsWith('--') !== true) {
      throw new InvalidExtractionWorkerCommandOptionsError(
        'Arguments must use --name value format.',
      );
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidExtractionWorkerCommandOptionsError(`Argument ${key} must have a value.`);
    }

    values.set(key.slice(2), value);
  }

  return values;
}

function readOption(
  values: ReadonlyMap<string, string>,
  env: Readonly<Record<string, string | undefined>>,
  optionName: string,
  envName: string,
  defaultValue: string,
): string {
  const value = values.get(optionName) ?? env[envName] ?? defaultValue;

  if (value.trim().length === 0) {
    throw new InvalidExtractionWorkerCommandOptionsError(`--${optionName} cannot be blank.`);
  }

  return value.trim();
}

function readOptionalOption(
  values: ReadonlyMap<string, string>,
  env: Readonly<Record<string, string | undefined>>,
  optionName: string,
  envName: string,
): string | null {
  const value = values.get(optionName) ?? env[envName];

  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function readPositiveInteger(
  values: ReadonlyMap<string, string>,
  env: Readonly<Record<string, string | undefined>>,
  optionName: string,
  envName: string,
  defaultValue: number,
): number {
  const parsed = Number(values.get(optionName) ?? env[envName] ?? String(defaultValue));

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidExtractionWorkerCommandOptionsError(
      `--${optionName} must be a positive integer.`,
    );
  }

  return parsed;
}

function readNonNegativeInteger(
  values: ReadonlyMap<string, string>,
  env: Readonly<Record<string, string | undefined>>,
  optionName: string,
  envName: string,
  defaultValue: number,
): number {
  const parsed = Number(values.get(optionName) ?? env[envName] ?? String(defaultValue));

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidExtractionWorkerCommandOptionsError(
      `--${optionName} must be a non-negative integer.`,
    );
  }

  return parsed;
}

function readBoolean(
  values: ReadonlyMap<string, string>,
  env: Readonly<Record<string, string | undefined>>,
  optionName: string,
  envName: string,
  defaultValue: boolean,
): boolean {
  const rawValue = values.get(optionName) ?? env[envName] ?? String(defaultValue);

  switch (rawValue.trim().toLowerCase()) {
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      throw new InvalidExtractionWorkerCommandOptionsError(
        `--${optionName} must be true or false.`,
      );
  }
}

function parseTargetIds(value: string | null): readonly string[] {
  if (value === null) {
    return [];
  }

  return value
    .split(',')
    .map((targetId) => targetId.trim())
    .filter((targetId) => targetId.length > 0);
}
