import { createVisualViewport, type VisualViewport } from '../../domain/visual/viewport';
import type { DatasetSplit } from '../../domain/dataset/dataset-split';

export interface CarnaubaPlaywrightCommandOptions {
  readonly apiBaseUrl: string;
  readonly brandId: number;
  readonly cacheRootDirectory: string;
  readonly cacheTtlMs: number;
  readonly outputRootDirectory: string;
  readonly siteBaseUrl: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly settleDelayMs: number;
  readonly visualDatasetEnabled: boolean;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export class InvalidCarnaubaPlaywrightCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCarnaubaPlaywrightCommandOptionsError';
  }
}

export function parseCarnaubaPlaywrightCommandOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): CarnaubaPlaywrightCommandOptions {
  const values = parseNamedArguments(args);

  return {
    apiBaseUrl: validateAbsoluteUrl(
      readOption(values, env, 'api-base-url', 'CARNAUBA_API_BASE_URL', [
        'https://merconnect.mercadapp.com.br/mapp/v2',
      ]),
      'api-base-url',
    ),
    brandId: readPositiveInteger(values, env, 'brand-id', 'CARNAUBA_BRAND_ID', 27),
    cacheRootDirectory: readOption(values, env, 'cache-root', 'CARNAUBA_STORE_CACHE_DIR', [
      '.data/cache',
    ]),
    cacheTtlMs:
      readNonNegativeInteger(values, env, 'cache-ttl-hours', 'CARNAUBA_STORE_CACHE_TTL_HOURS', 24) *
      60 *
      60 *
      1_000,
    outputRootDirectory: readOption(
      values,
      env,
      'output-root',
      'CARNAUBA_PLAYWRIGHT_LEAFLET_OUTPUT_DIR',
      ['.data/leaflets-playwright'],
    ),
    siteBaseUrl: validateAbsoluteUrl(
      readOption(values, env, 'site-base-url', 'CARNAUBA_SITE_BASE_URL', [
        'https://carnaubasupermercados.com.br',
      ]),
      'site-base-url',
    ),
    viewport: createVisualViewport({
      width: readPositiveInteger(values, env, 'width', 'CARNAUBA_PLAYWRIGHT_WIDTH', 1366),
      height: readPositiveInteger(values, env, 'height', 'CARNAUBA_PLAYWRIGHT_HEIGHT', 768),
      deviceScaleFactor: readPositiveNumber(
        values,
        env,
        'device-scale-factor',
        'CARNAUBA_PLAYWRIGHT_DEVICE_SCALE_FACTOR',
        1,
      ),
    }),
    timeoutMs: readPositiveInteger(
      values,
      env,
      'timeout-ms',
      'CARNAUBA_PLAYWRIGHT_TIMEOUT_MS',
      30_000,
    ),
    settleDelayMs: readNonNegativeInteger(
      values,
      env,
      'settle-delay-ms',
      'CARNAUBA_PLAYWRIGHT_SETTLE_DELAY_MS',
      5_000,
    ),
    visualDatasetEnabled: readBoolean(
      values,
      env,
      'visual-dataset-enabled',
      'CARNAUBA_VISUAL_DATASET_ENABLED',
      true,
    ),
    visualDatasetRootDirectory: readOption(
      values,
      env,
      'visual-dataset-root',
      'CARNAUBA_VISUAL_DATASET_DIR',
      ['.data/visual-dataset'],
    ),
    visualDatasetSplit: readDatasetSplit(
      values,
      env,
      'visual-dataset-split',
      'CARNAUBA_VISUAL_DATASET_SPLIT',
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
      throw new InvalidCarnaubaPlaywrightCommandOptionsError(
        'Arguments must use --name value format.',
      );
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidCarnaubaPlaywrightCommandOptionsError(`Argument ${key} must have a value.`);
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
  defaultValues: readonly string[],
): string {
  const value = values.get(optionName) ?? env[envName] ?? defaultValues[0];

  if (value === undefined || value.trim().length === 0) {
    throw new InvalidCarnaubaPlaywrightCommandOptionsError(`--${optionName} cannot be blank.`);
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
    throw new InvalidCarnaubaPlaywrightCommandOptionsError(
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
    throw new InvalidCarnaubaPlaywrightCommandOptionsError(
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
    throw new InvalidCarnaubaPlaywrightCommandOptionsError(
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
  const value = rawValue.trim().toLowerCase();

  switch (value) {
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      throw new InvalidCarnaubaPlaywrightCommandOptionsError(
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
      throw new InvalidCarnaubaPlaywrightCommandOptionsError(
        `--${optionName} must be train, validation, test, or unassigned.`,
      );
  }
}

function validateAbsoluteUrl(value: string, optionName: string): string {
  try {
    new URL(value);
  } catch {
    throw new InvalidCarnaubaPlaywrightCommandOptionsError(
      `--${optionName} must be absolute and valid.`,
    );
  }

  return value;
}
