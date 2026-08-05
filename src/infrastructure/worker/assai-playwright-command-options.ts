import type { DatasetSplit } from '../../domain/dataset/dataset-split';
import { createVisualViewport, type VisualViewport } from '../../domain/visual/viewport';
import type { AssaiMonitoredStore } from '../scrapers/assai/assai-targets';

export interface AssaiPlaywrightCommandOptions {
  readonly catalogUrl: string;
  readonly outputRootDirectory: string;
  readonly cacheRootDirectory: string;
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

export class InvalidAssaiPlaywrightCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAssaiPlaywrightCommandOptionsError';
  }
}

export function parseAssaiPlaywrightCommandOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): AssaiPlaywrightCommandOptions {
  const values = parseNamedArguments(args);

  return {
    catalogUrl: readOption(
      values,
      env,
      'assai-catalog-url',
      'ASSAI_OFFER_CATALOG_URL',
      'https://www.assai.com.br/sites/default/files/static/ofertas_assai.json',
    ),
    outputRootDirectory: readOption(
      values,
      env,
      'assai-output-root',
      'ASSAI_PLAYWRIGHT_LEAFLET_OUTPUT_DIR',
      '.data/leaflets-playwright',
    ),
    cacheRootDirectory: readOption(
      values,
      env,
      'assai-cache-root',
      'ASSAI_CACHE_DIR',
      '.data/cache',
    ),
    viewport: createVisualViewport({
      width: readPositiveInteger(values, env, 'assai-width', 'ASSAI_PLAYWRIGHT_WIDTH', 1366),
      height: readPositiveInteger(values, env, 'assai-height', 'ASSAI_PLAYWRIGHT_HEIGHT', 768),
      deviceScaleFactor: readPositiveNumber(
        values,
        env,
        'assai-device-scale-factor',
        'ASSAI_PLAYWRIGHT_DEVICE_SCALE_FACTOR',
        1,
      ),
    }),
    timeoutMs: readPositiveInteger(
      values,
      env,
      'assai-timeout-ms',
      'ASSAI_PLAYWRIGHT_TIMEOUT_MS',
      30_000,
    ),
    storeTimeoutMs: readPositiveInteger(
      values,
      env,
      'assai-store-timeout-ms',
      'ASSAI_PLAYWRIGHT_STORE_TIMEOUT_MS',
      90_000,
    ),
    maxStoreAttempts: readPositiveInteger(
      values,
      env,
      'assai-max-store-attempts',
      'ASSAI_PLAYWRIGHT_MAX_STORE_ATTEMPTS',
      2,
    ),
    settleDelayMs: readNonNegativeInteger(
      values,
      env,
      'assai-settle-delay-ms',
      'ASSAI_PLAYWRIGHT_SETTLE_DELAY_MS',
      3_000,
    ),
    visualDatasetEnabled: readBoolean(
      values,
      env,
      'assai-visual-dataset-enabled',
      'ASSAI_VISUAL_DATASET_ENABLED',
      true,
    ),
    visualDatasetRootDirectory: readOption(
      values,
      env,
      'assai-visual-dataset-root',
      'ASSAI_VISUAL_DATASET_DIR',
      '.data/visual-dataset',
    ),
    visualDatasetSplit: readDatasetSplit(
      values,
      env,
      'assai-visual-dataset-split',
      'ASSAI_VISUAL_DATASET_SPLIT',
      'unassigned',
    ),
    storeSlugs: readList(values, env, 'assai-store-slugs', 'ASSAI_STORE_SLUGS'),
    stateCodes: readList(values, env, 'assai-state-codes', 'ASSAI_STATE_CODES').map((value) =>
      value.toUpperCase(),
    ),
    cityNames: readList(values, env, 'assai-city-names', 'ASSAI_CITY_NAMES'),
  };
}

export function filterAssaiStores(
  stores: readonly AssaiMonitoredStore[],
  options: Pick<AssaiPlaywrightCommandOptions, 'storeSlugs' | 'stateCodes' | 'cityNames'>,
): readonly AssaiMonitoredStore[] {
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
      throw new InvalidAssaiPlaywrightCommandOptionsError(
        'Arguments must use --name value format.',
      );
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidAssaiPlaywrightCommandOptionsError(`Argument ${key} must have a value.`);
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
    throw new InvalidAssaiPlaywrightCommandOptionsError(`--${optionName} cannot be blank.`);
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
    throw new InvalidAssaiPlaywrightCommandOptionsError(
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
    throw new InvalidAssaiPlaywrightCommandOptionsError(
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
    throw new InvalidAssaiPlaywrightCommandOptionsError(
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
      throw new InvalidAssaiPlaywrightCommandOptionsError(`--${optionName} must be true or false.`);
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
      throw new InvalidAssaiPlaywrightCommandOptionsError(
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
