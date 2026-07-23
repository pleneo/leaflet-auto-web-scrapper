import type { DatasetSplit } from '../../domain/dataset/dataset-split';
import { createVisualViewport, type VisualViewport } from '../../domain/visual/viewport';

export interface SuperDoPovoPlaywrightCommandOptions {
  readonly apiBaseUrl: string;
  readonly defaultShopId: number;
  readonly outputRootDirectory: string;
  readonly siteBaseUrl: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly shopTimeoutMs: number;
  readonly maxShopAttempts: number;
  readonly settleDelayMs: number;
  readonly visualDatasetEnabled: boolean;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export class InvalidSuperDoPovoPlaywrightCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSuperDoPovoPlaywrightCommandOptionsError';
  }
}

export function parseSuperDoPovoPlaywrightCommandOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): SuperDoPovoPlaywrightCommandOptions {
  const values = parseNamedArguments(args);

  return {
    apiBaseUrl: validateAbsoluteUrl(
      readOption(values, env, 'superdopovo-api-base-url', 'SUPERDOPOVO_API_BASE_URL', [
        'https://loja.superdopovo.com.br/api/v1',
      ]),
      'superdopovo-api-base-url',
    ),
    defaultShopId: readPositiveInteger(
      values,
      env,
      'superdopovo-default-shop-id',
      'SUPERDOPOVO_DEFAULT_SHOP_ID',
      24,
    ),
    outputRootDirectory: readOption(
      values,
      env,
      'superdopovo-output-root',
      'SUPERDOPOVO_PLAYWRIGHT_LEAFLET_OUTPUT_DIR',
      ['.data/leaflets-playwright'],
    ),
    siteBaseUrl: validateAbsoluteUrl(
      readOption(values, env, 'superdopovo-site-base-url', 'SUPERDOPOVO_SITE_BASE_URL', [
        'https://loja.superdopovo.com.br',
      ]),
      'superdopovo-site-base-url',
    ),
    viewport: createVisualViewport({
      width: readPositiveInteger(
        values,
        env,
        'superdopovo-width',
        'SUPERDOPOVO_PLAYWRIGHT_WIDTH',
        1366,
      ),
      height: readPositiveInteger(
        values,
        env,
        'superdopovo-height',
        'SUPERDOPOVO_PLAYWRIGHT_HEIGHT',
        768,
      ),
      deviceScaleFactor: readPositiveNumber(
        values,
        env,
        'superdopovo-device-scale-factor',
        'SUPERDOPOVO_PLAYWRIGHT_DEVICE_SCALE_FACTOR',
        1,
      ),
    }),
    timeoutMs: readPositiveInteger(
      values,
      env,
      'superdopovo-timeout-ms',
      'SUPERDOPOVO_PLAYWRIGHT_TIMEOUT_MS',
      30_000,
    ),
    shopTimeoutMs: readPositiveInteger(
      values,
      env,
      'superdopovo-shop-timeout-ms',
      'SUPERDOPOVO_PLAYWRIGHT_SHOP_TIMEOUT_MS',
      30_000,
    ),
    maxShopAttempts: readPositiveInteger(
      values,
      env,
      'superdopovo-max-shop-attempts',
      'SUPERDOPOVO_PLAYWRIGHT_MAX_SHOP_ATTEMPTS',
      2,
    ),
    settleDelayMs: readNonNegativeInteger(
      values,
      env,
      'superdopovo-settle-delay-ms',
      'SUPERDOPOVO_PLAYWRIGHT_SETTLE_DELAY_MS',
      3_000,
    ),
    visualDatasetEnabled: readBoolean(
      values,
      env,
      'superdopovo-visual-dataset-enabled',
      'SUPERDOPOVO_VISUAL_DATASET_ENABLED',
      true,
    ),
    visualDatasetRootDirectory: readOption(
      values,
      env,
      'superdopovo-visual-dataset-root',
      'SUPERDOPOVO_VISUAL_DATASET_DIR',
      ['.data/visual-dataset'],
    ),
    visualDatasetSplit: readDatasetSplit(
      values,
      env,
      'superdopovo-visual-dataset-split',
      'SUPERDOPOVO_VISUAL_DATASET_SPLIT',
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
      throw new InvalidSuperDoPovoPlaywrightCommandOptionsError(
        'Arguments must use --name value format.',
      );
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidSuperDoPovoPlaywrightCommandOptionsError(
        `Argument ${key} must have a value.`,
      );
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
    throw new InvalidSuperDoPovoPlaywrightCommandOptionsError(`--${optionName} cannot be blank.`);
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
    throw new InvalidSuperDoPovoPlaywrightCommandOptionsError(
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
    throw new InvalidSuperDoPovoPlaywrightCommandOptionsError(
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
    throw new InvalidSuperDoPovoPlaywrightCommandOptionsError(
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
      throw new InvalidSuperDoPovoPlaywrightCommandOptionsError(
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
      throw new InvalidSuperDoPovoPlaywrightCommandOptionsError(
        `--${optionName} must be train, validation, test, or unassigned.`,
      );
  }
}

function validateAbsoluteUrl(value: string, optionName: string): string {
  try {
    new URL(value);
    return value;
  } catch {
    throw new InvalidSuperDoPovoPlaywrightCommandOptionsError(
      `--${optionName} must be an absolute URL.`,
    );
  }
}
