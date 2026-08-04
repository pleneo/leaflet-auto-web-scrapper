import type { DatasetSplit } from '../../domain/dataset/dataset-split';
import { createVisualViewport, type VisualViewport } from '../../domain/visual/viewport';
import type { AtacadaoMonitoredStore } from '../scrapers/atacadao/atacadao-targets';

export interface AtacadaoPlaywrightCommandOptions {
  readonly outputRootDirectory: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly storeTimeoutMs: number;
  readonly maxStoreAttempts: number;
  readonly settleDelayMs: number;
  readonly visualDatasetEnabled: boolean;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
  readonly storeSlugs: readonly string[];
  readonly stateCodes: readonly string[];
  readonly cityNames: readonly string[];
}

export class InvalidAtacadaoPlaywrightCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAtacadaoPlaywrightCommandOptionsError';
  }
}

export function parseAtacadaoPlaywrightCommandOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): AtacadaoPlaywrightCommandOptions {
  const values = parseNamedArguments(args);

  return {
    outputRootDirectory: readOption(
      values,
      env,
      'atacadao-output-root',
      'ATACADAO_PLAYWRIGHT_LEAFLET_OUTPUT_DIR',
      '.data/leaflets-playwright',
    ),
    viewport: createVisualViewport({
      width: readPositiveInteger(values, env, 'atacadao-width', 'ATACADAO_PLAYWRIGHT_WIDTH', 1366),
      height: readPositiveInteger(
        values,
        env,
        'atacadao-height',
        'ATACADAO_PLAYWRIGHT_HEIGHT',
        768,
      ),
      deviceScaleFactor: readPositiveNumber(
        values,
        env,
        'atacadao-device-scale-factor',
        'ATACADAO_PLAYWRIGHT_DEVICE_SCALE_FACTOR',
        1,
      ),
    }),
    timeoutMs: readPositiveInteger(
      values,
      env,
      'atacadao-timeout-ms',
      'ATACADAO_PLAYWRIGHT_TIMEOUT_MS',
      30_000,
    ),
    storeTimeoutMs: readPositiveInteger(
      values,
      env,
      'atacadao-store-timeout-ms',
      'ATACADAO_PLAYWRIGHT_STORE_TIMEOUT_MS',
      90_000,
    ),
    maxStoreAttempts: readPositiveInteger(
      values,
      env,
      'atacadao-max-store-attempts',
      'ATACADAO_PLAYWRIGHT_MAX_STORE_ATTEMPTS',
      2,
    ),
    settleDelayMs: readNonNegativeInteger(
      values,
      env,
      'atacadao-settle-delay-ms',
      'ATACADAO_PLAYWRIGHT_SETTLE_DELAY_MS',
      3_000,
    ),
    visualDatasetEnabled: readBoolean(
      values,
      env,
      'atacadao-visual-dataset-enabled',
      'ATACADAO_VISUAL_DATASET_ENABLED',
      true,
    ),
    visualDatasetRootDirectory: readOption(
      values,
      env,
      'atacadao-visual-dataset-root',
      'ATACADAO_VISUAL_DATASET_DIR',
      '.data/visual-dataset',
    ),
    visualDatasetSplit: readDatasetSplit(
      values,
      env,
      'atacadao-visual-dataset-split',
      'ATACADAO_VISUAL_DATASET_SPLIT',
      'unassigned',
    ),
    storeSlugs: readList(values, env, 'atacadao-store-slugs', 'ATACADAO_STORE_SLUGS'),
    stateCodes: readList(values, env, 'atacadao-state-codes', 'ATACADAO_STATE_CODES').map((value) =>
      value.toUpperCase(),
    ),
    cityNames: readList(values, env, 'atacadao-city-names', 'ATACADAO_CITY_NAMES'),
  };
}

export function filterAtacadaoStores(
  stores: readonly AtacadaoMonitoredStore[],
  options: Pick<AtacadaoPlaywrightCommandOptions, 'storeSlugs' | 'stateCodes' | 'cityNames'>,
): readonly AtacadaoMonitoredStore[] {
  const storeSlugSet = new Set(options.storeSlugs);
  const stateCodeSet = new Set(options.stateCodes);
  const cityNameSet = new Set(options.cityNames.map(normalizeComparableValue));

  return stores.filter((store) => {
    const matchesStoreSlug = storeSlugSet.size === 0 || storeSlugSet.has(store.storeSlug);
    const matchesStateCode = stateCodeSet.size === 0 || stateCodeSet.has(store.stateCode);
    const matchesCityName =
      cityNameSet.size === 0 || cityNameSet.has(normalizeComparableValue(store.cityName));

    return matchesStoreSlug && matchesStateCode && matchesCityName;
  });
}

function parseNamedArguments(args: readonly string[]): ReadonlyMap<string, string> {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];

    if (key?.startsWith('--') !== true) {
      throw new InvalidAtacadaoPlaywrightCommandOptionsError(
        'Arguments must use --name value format.',
      );
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidAtacadaoPlaywrightCommandOptionsError(`Argument ${key} must have a value.`);
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
    throw new InvalidAtacadaoPlaywrightCommandOptionsError(`--${optionName} cannot be blank.`);
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
    throw new InvalidAtacadaoPlaywrightCommandOptionsError(
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
    throw new InvalidAtacadaoPlaywrightCommandOptionsError(
      `--${optionName} must be a non-negative integer.`,
    );
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
    throw new InvalidAtacadaoPlaywrightCommandOptionsError(
      `--${optionName} must be a positive number.`,
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
      throw new InvalidAtacadaoPlaywrightCommandOptionsError(
        `--${optionName} must be true or false.`,
      );
  }
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
      throw new InvalidAtacadaoPlaywrightCommandOptionsError(
        `--${optionName} must be train, validation, test, or unassigned.`,
      );
  }
}

function readList(
  values: ReadonlyMap<string, string>,
  env: Readonly<Record<string, string | undefined>>,
  optionName: string,
  envName: string,
): readonly string[] {
  const rawValue = values.get(optionName) ?? env[envName] ?? '';

  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function normalizeComparableValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
