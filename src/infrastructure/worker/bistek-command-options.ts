import type { DatasetSplit } from '../../domain/dataset/dataset-split';
import { createVisualViewport, type VisualViewport } from '../../domain/visual/viewport';
import { BISTEK_BASE_URL, BISTEK_OFFERS_URL } from '../scrapers/bistek/bistek-targets';

export interface BistekCommandOptions {
  readonly baseUrl: string;
  readonly offersUrl: string;
  readonly outputRootDirectory: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly storeTimeoutMs: number;
  readonly maxStoreAttempts: number;
  readonly settleDelayMs: number;
  readonly storeIds: readonly string[];
  readonly cityIds: readonly string[];
  readonly visualDatasetEnabled: boolean;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export class InvalidBistekCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBistekCommandOptionsError';
  }
}

export function parseBistekCommandOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): BistekCommandOptions {
  const values = parseNamedArguments(args);

  return {
    baseUrl: readOption(values, env, 'bistek-base-url', 'BISTEK_BASE_URL', BISTEK_BASE_URL),
    offersUrl: readOption(values, env, 'bistek-offers-url', 'BISTEK_OFFERS_URL', BISTEK_OFFERS_URL),
    outputRootDirectory: readOption(
      values,
      env,
      'bistek-output-root',
      'BISTEK_LEAFLET_OUTPUT_DIR',
      '.data/leaflets-playwright',
    ),
    viewport: createVisualViewport({
      width: readPositiveInteger(values, env, 'bistek-width', 'BISTEK_WIDTH', 1366),
      height: readPositiveInteger(values, env, 'bistek-height', 'BISTEK_HEIGHT', 768),
      deviceScaleFactor: readPositiveNumber(
        values,
        env,
        'bistek-device-scale-factor',
        'BISTEK_DEVICE_SCALE_FACTOR',
        1,
      ),
    }),
    timeoutMs: readPositiveInteger(values, env, 'bistek-timeout-ms', 'BISTEK_TIMEOUT_MS', 30_000),
    storeTimeoutMs: readPositiveInteger(
      values,
      env,
      'bistek-store-timeout-ms',
      'BISTEK_STORE_TIMEOUT_MS',
      180_000,
    ),
    maxStoreAttempts: readPositiveInteger(
      values,
      env,
      'bistek-max-store-attempts',
      'BISTEK_MAX_STORE_ATTEMPTS',
      2,
    ),
    settleDelayMs: readNonNegativeInteger(
      values,
      env,
      'bistek-settle-delay-ms',
      'BISTEK_SETTLE_DELAY_MS',
      3_000,
    ),
    storeIds: readList(values, env, 'bistek-store-ids', 'BISTEK_STORE_IDS'),
    cityIds: readList(values, env, 'bistek-city-ids', 'BISTEK_CITY_IDS'),
    visualDatasetEnabled: readBoolean(
      values,
      env,
      'bistek-visual-dataset-enabled',
      'BISTEK_VISUAL_DATASET_ENABLED',
      true,
    ),
    visualDatasetRootDirectory: readOption(
      values,
      env,
      'bistek-visual-dataset-root',
      'BISTEK_VISUAL_DATASET_DIR',
      '.data/visual-dataset',
    ),
    visualDatasetSplit: readDatasetSplit(
      values,
      env,
      'bistek-visual-dataset-split',
      'BISTEK_VISUAL_DATASET_SPLIT',
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
      throw new InvalidBistekCommandOptionsError('Arguments must use --name value format.');
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidBistekCommandOptionsError(`Argument ${key} must have a value.`);
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
    throw new InvalidBistekCommandOptionsError(`--${optionName} cannot be blank.`);
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
    throw new InvalidBistekCommandOptionsError(`--${optionName} must be a positive integer.`);
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
    throw new InvalidBistekCommandOptionsError(`--${optionName} must be a non-negative integer.`);
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
    throw new InvalidBistekCommandOptionsError(`--${optionName} must be a positive number.`);
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

  throw new InvalidBistekCommandOptionsError(`--${optionName} must be true or false.`);
}

function readList(
  values: ReadonlyMap<string, string>,
  env: Readonly<Record<string, string | undefined>>,
  optionName: string,
  envName: string,
): readonly string[] {
  return (values.get(optionName) ?? env[envName] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function readDatasetSplit(
  values: ReadonlyMap<string, string>,
  env: Readonly<Record<string, string | undefined>>,
  optionName: string,
  envName: string,
  defaultValue: DatasetSplit,
): DatasetSplit {
  const value = values.get(optionName) ?? env[envName] ?? defaultValue;

  if (value === 'train' || value === 'validation' || value === 'test' || value === 'unassigned') {
    return value;
  }

  throw new InvalidBistekCommandOptionsError(`--${optionName} must be a valid dataset split.`);
}
