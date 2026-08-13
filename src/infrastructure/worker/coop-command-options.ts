import type { DatasetSplit } from '../../domain/dataset/dataset-split';
import { createVisualViewport, type VisualViewport } from '../../domain/visual/viewport';
import type { CoopStartUrlMode } from '../scrapers/coop/coop-leaflet-extractor';
import { COOP_HOME_URL, COOP_OFFERS_URL } from '../scrapers/coop/coop-targets';

export interface CoopCommandOptions {
  readonly homeUrl: string;
  readonly offersUrl: string;
  readonly outputRootDirectory: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly settleDelayMs: number;
  readonly startUrlMode: CoopStartUrlMode;
  readonly visualDatasetEnabled: boolean;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export class InvalidCoopCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCoopCommandOptionsError';
  }
}

export function parseCoopCommandOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): CoopCommandOptions {
  const values = parseNamedArguments(args);

  return {
    homeUrl: readOption(values, env, 'coop-home-url', 'COOP_HOME_URL', COOP_HOME_URL),
    offersUrl: readOption(values, env, 'coop-offers-url', 'COOP_OFFERS_URL', COOP_OFFERS_URL),
    outputRootDirectory: readOption(
      values,
      env,
      'coop-output-root',
      'COOP_OUTPUT_DIR',
      '.data/leaflets-playwright',
    ),
    viewport: createVisualViewport({
      width: readPositiveInteger(values, env, 'coop-width', 'COOP_WIDTH', 1366),
      height: readPositiveInteger(values, env, 'coop-height', 'COOP_HEIGHT', 768),
      deviceScaleFactor: readPositiveNumber(
        values,
        env,
        'coop-device-scale-factor',
        'COOP_DEVICE_SCALE_FACTOR',
        1,
      ),
    }),
    timeoutMs: readPositiveInteger(values, env, 'coop-timeout-ms', 'COOP_TIMEOUT_MS', 30_000),
    settleDelayMs: readNonNegativeInteger(
      values,
      env,
      'coop-settle-delay-ms',
      'COOP_SETTLE_DELAY_MS',
      3_000,
    ),
    startUrlMode: readStartUrlMode(
      readOption(values, env, 'coop-start-url-mode', 'COOP_START_URL_MODE', 'store-page'),
    ),
    visualDatasetEnabled: readBoolean(
      values,
      env,
      'coop-visual-dataset-enabled',
      'COOP_VISUAL_DATASET_ENABLED',
      true,
    ),
    visualDatasetRootDirectory: readOption(
      values,
      env,
      'coop-visual-dataset-root',
      'COOP_VISUAL_DATASET_DIR',
      '.data/visual-dataset',
    ),
    visualDatasetSplit: readDatasetSplit(
      values,
      env,
      'coop-visual-dataset-split',
      'COOP_VISUAL_DATASET_SPLIT',
      'unassigned',
    ),
  };
}

function parseNamedArguments(args: readonly string[]): ReadonlyMap<string, string> {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];

    if (key?.startsWith('--') !== true) {
      throw new InvalidCoopCommandOptionsError('Arguments must use --name value format.');
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidCoopCommandOptionsError(`Argument ${key} must have a value.`);
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
    throw new InvalidCoopCommandOptionsError(`--${optionName} cannot be blank.`);
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
    throw new InvalidCoopCommandOptionsError(`--${optionName} must be a positive integer.`);
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
    throw new InvalidCoopCommandOptionsError(`--${optionName} must be a non-negative integer.`);
  }

  return parsed;
}

function readPositiveNumber(
  values: ReadonlyMap<string, string>,
  env: Readonly<Record<string, string | undefined>>,
  optionName: string,
  envName: string,
  defaultValue: number,
): number {
  const parsed = Number(values.get(optionName) ?? env[envName] ?? String(defaultValue));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidCoopCommandOptionsError(`--${optionName} must be a positive number.`);
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
  const value = values.get(optionName) ?? env[envName] ?? String(defaultValue);

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new InvalidCoopCommandOptionsError(`--${optionName} must be true or false.`);
}

function readDatasetSplit(
  values: ReadonlyMap<string, string>,
  env: Readonly<Record<string, string | undefined>>,
  optionName: string,
  envName: string,
  defaultValue: DatasetSplit,
): DatasetSplit {
  const value = values.get(optionName) ?? env[envName] ?? defaultValue;

  switch (value) {
    case 'train':
    case 'validation':
    case 'test':
    case 'unassigned':
      return value;
    default:
      throw new InvalidCoopCommandOptionsError(
        `--${optionName} must be train, validation, test, or unassigned.`,
      );
  }
}

function readStartUrlMode(value: string): CoopStartUrlMode {
  switch (value) {
    case 'store-page':
    case 'home':
      return value;
    default:
      throw new InvalidCoopCommandOptionsError('--coop-start-url-mode must be store-page or home.');
  }
}
