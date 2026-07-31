import type { DatasetSplit } from '../../domain/dataset/dataset-split';
import { createVisualViewport, type VisualViewport } from '../../domain/visual/viewport';

export interface MixMateusPlaywrightCommandOptions {
  readonly outputRootDirectory: string;
  readonly siteBaseUrl: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly storeTimeoutMs: number;
  readonly maxStoreAttempts: number;
  readonly settleDelayMs: number;
  readonly visualDatasetEnabled: boolean;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export class InvalidMixMateusPlaywrightCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMixMateusPlaywrightCommandOptionsError';
  }
}

export function parseMixMateusPlaywrightCommandOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): MixMateusPlaywrightCommandOptions {
  const values = parseNamedArguments(args);

  return {
    outputRootDirectory: readOption(
      values,
      env,
      'mixmateus-output-root',
      'MIXMATEUS_PLAYWRIGHT_LEAFLET_OUTPUT_DIR',
      ['.data/leaflets-playwright'],
    ),
    siteBaseUrl: validateAbsoluteUrl(
      readOption(values, env, 'mixmateus-site-base-url', 'MIXMATEUS_SITE_BASE_URL', [
        'https://ofertasmateus.com/',
      ]),
      'mixmateus-site-base-url',
    ),
    viewport: createVisualViewport({
      width: readPositiveInteger(
        values,
        env,
        'mixmateus-width',
        'MIXMATEUS_PLAYWRIGHT_WIDTH',
        1366,
      ),
      height: readPositiveInteger(
        values,
        env,
        'mixmateus-height',
        'MIXMATEUS_PLAYWRIGHT_HEIGHT',
        768,
      ),
      deviceScaleFactor: readPositiveNumber(
        values,
        env,
        'mixmateus-device-scale-factor',
        'MIXMATEUS_PLAYWRIGHT_DEVICE_SCALE_FACTOR',
        1,
      ),
    }),
    timeoutMs: readPositiveInteger(
      values,
      env,
      'mixmateus-timeout-ms',
      'MIXMATEUS_PLAYWRIGHT_TIMEOUT_MS',
      30_000,
    ),
    storeTimeoutMs: readPositiveInteger(
      values,
      env,
      'mixmateus-store-timeout-ms',
      'MIXMATEUS_PLAYWRIGHT_STORE_TIMEOUT_MS',
      30_000,
    ),
    maxStoreAttempts: readPositiveInteger(
      values,
      env,
      'mixmateus-max-store-attempts',
      'MIXMATEUS_PLAYWRIGHT_MAX_STORE_ATTEMPTS',
      2,
    ),
    settleDelayMs: readNonNegativeInteger(
      values,
      env,
      'mixmateus-settle-delay-ms',
      'MIXMATEUS_PLAYWRIGHT_SETTLE_DELAY_MS',
      3_000,
    ),
    visualDatasetEnabled: readBoolean(
      values,
      env,
      'mixmateus-visual-dataset-enabled',
      'MIXMATEUS_VISUAL_DATASET_ENABLED',
      true,
    ),
    visualDatasetRootDirectory: readOption(
      values,
      env,
      'mixmateus-visual-dataset-root',
      'MIXMATEUS_VISUAL_DATASET_DIR',
      ['.data/visual-dataset'],
    ),
    visualDatasetSplit: readDatasetSplit(
      values,
      env,
      'mixmateus-visual-dataset-split',
      'MIXMATEUS_VISUAL_DATASET_SPLIT',
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
      throw new InvalidMixMateusPlaywrightCommandOptionsError(
        'Arguments must use --name value format.',
      );
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidMixMateusPlaywrightCommandOptionsError(`Argument ${key} must have a value.`);
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
    throw new InvalidMixMateusPlaywrightCommandOptionsError(`--${optionName} cannot be blank.`);
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
    throw new InvalidMixMateusPlaywrightCommandOptionsError(
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
    throw new InvalidMixMateusPlaywrightCommandOptionsError(
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
    throw new InvalidMixMateusPlaywrightCommandOptionsError(
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
      throw new InvalidMixMateusPlaywrightCommandOptionsError(
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
      throw new InvalidMixMateusPlaywrightCommandOptionsError(
        `--${optionName} must be train, validation, test, or unassigned.`,
      );
  }
}

function validateAbsoluteUrl(value: string, optionName: string): string {
  try {
    new URL(value);
    return value;
  } catch {
    throw new InvalidMixMateusPlaywrightCommandOptionsError(
      `--${optionName} must be an absolute URL.`,
    );
  }
}
