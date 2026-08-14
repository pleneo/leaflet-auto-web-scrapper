import type { DatasetSplit } from '../../domain/dataset/dataset-split';
import { createVisualViewport, type VisualViewport } from '../../domain/visual/viewport';
import {
  TAUSTE_FLIPSNACK_ACCOUNT_ID,
  TAUSTE_FLIPSNACK_API_BASE_URL,
  TAUSTE_FLIPSNACK_PROFILE_URL,
  TAUSTE_INSTITUTIONAL_HOME_URL,
  TAUSTE_INSTITUTIONAL_OFFERS_URL,
  type TausteStartUrlMode,
} from '../scrapers/tauste/tauste-targets';

export interface TausteCommandOptions {
  readonly institutionalHomeUrl: string;
  readonly institutionalOffersUrl: string;
  readonly flipsnackProfileUrl: string;
  readonly flipsnackApiBaseUrl: string;
  readonly flipsnackAccountId: string;
  readonly outputRootDirectory: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly settleDelayMs: number;
  readonly startUrlMode: TausteStartUrlMode;
  readonly visualDatasetEnabled: boolean;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export class InvalidTausteCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTausteCommandOptionsError';
  }
}

export function parseTausteCommandOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): TausteCommandOptions {
  const values = parseNamedArguments(args);

  return {
    institutionalHomeUrl: readOption(
      values,
      env,
      'tauste-institutional-home-url',
      'TAUSTE_INSTITUTIONAL_HOME_URL',
      TAUSTE_INSTITUTIONAL_HOME_URL,
    ),
    institutionalOffersUrl: readOption(
      values,
      env,
      'tauste-institutional-offers-url',
      'TAUSTE_INSTITUTIONAL_OFFERS_URL',
      TAUSTE_INSTITUTIONAL_OFFERS_URL,
    ),
    flipsnackProfileUrl: readOption(
      values,
      env,
      'tauste-flipsnack-profile-url',
      'TAUSTE_FLIPSNACK_PROFILE_URL',
      TAUSTE_FLIPSNACK_PROFILE_URL,
    ),
    flipsnackApiBaseUrl: readOption(
      values,
      env,
      'tauste-flipsnack-api-base-url',
      'TAUSTE_FLIPSNACK_API_BASE_URL',
      TAUSTE_FLIPSNACK_API_BASE_URL,
    ),
    flipsnackAccountId: readOption(
      values,
      env,
      'tauste-flipsnack-account-id',
      'TAUSTE_FLIPSNACK_ACCOUNT_ID',
      TAUSTE_FLIPSNACK_ACCOUNT_ID,
    ),
    outputRootDirectory: readOption(
      values,
      env,
      'tauste-output-root',
      'TAUSTE_OUTPUT_DIR',
      '.data/leaflets-playwright',
    ),
    viewport: createVisualViewport({
      width: readPositiveInteger(values, env, 'tauste-width', 'TAUSTE_WIDTH', 1366),
      height: readPositiveInteger(values, env, 'tauste-height', 'TAUSTE_HEIGHT', 768),
      deviceScaleFactor: readPositiveNumber(
        values,
        env,
        'tauste-device-scale-factor',
        'TAUSTE_DEVICE_SCALE_FACTOR',
        1,
      ),
    }),
    timeoutMs: readPositiveInteger(values, env, 'tauste-timeout-ms', 'TAUSTE_TIMEOUT_MS', 30_000),
    settleDelayMs: readNonNegativeInteger(
      values,
      env,
      'tauste-settle-delay-ms',
      'TAUSTE_SETTLE_DELAY_MS',
      3_000,
    ),
    startUrlMode: readStartUrlMode(
      readOption(
        values,
        env,
        'tauste-start-url-mode',
        'TAUSTE_START_URL_MODE',
        'flipsnack-profile',
      ),
    ),
    visualDatasetEnabled: readBoolean(
      values,
      env,
      'tauste-visual-dataset-enabled',
      'TAUSTE_VISUAL_DATASET_ENABLED',
      true,
    ),
    visualDatasetRootDirectory: readOption(
      values,
      env,
      'tauste-visual-dataset-root',
      'TAUSTE_VISUAL_DATASET_DIR',
      '.data/visual-dataset',
    ),
    visualDatasetSplit: readDatasetSplit(
      values,
      env,
      'tauste-visual-dataset-split',
      'TAUSTE_VISUAL_DATASET_SPLIT',
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
      throw new InvalidTausteCommandOptionsError('Arguments must use --name value format.');
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidTausteCommandOptionsError(`Argument ${key} must have a value.`);
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
    throw new InvalidTausteCommandOptionsError(`--${optionName} cannot be blank.`);
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
    throw new InvalidTausteCommandOptionsError(`--${optionName} must be a positive integer.`);
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
    throw new InvalidTausteCommandOptionsError(`--${optionName} must be a non-negative integer.`);
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
    throw new InvalidTausteCommandOptionsError(`--${optionName} must be a positive number.`);
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

  throw new InvalidTausteCommandOptionsError(`--${optionName} must be true or false.`);
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
      throw new InvalidTausteCommandOptionsError(
        `--${optionName} must be train, validation, test, or unassigned.`,
      );
  }
}

function readStartUrlMode(value: string): TausteStartUrlMode {
  switch (value) {
    case 'flipsnack-profile':
    case 'institutional-home':
      return value;
    default:
      throw new InvalidTausteCommandOptionsError(
        '--tauste-start-url-mode must be flipsnack-profile or institutional-home.',
      );
  }
}
