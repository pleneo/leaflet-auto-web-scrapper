import type { DatasetSplit } from '../../domain/dataset/dataset-split';
import { createVisualViewport, type VisualViewport } from '../../domain/visual/viewport';
import type { ComboAtacadistaStartUrlMode } from '../scrapers/comboatacadista/combo-atacadista-leaflet-extractor';
import {
  COMBO_ATACADISTA_HOME_URL,
  COMBO_ATACADISTA_OFFERS_URL,
} from '../scrapers/comboatacadista/combo-atacadista-targets';

export interface ComboAtacadistaCommandOptions {
  readonly homeUrl: string;
  readonly offersUrl: string;
  readonly outputRootDirectory: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly settleDelayMs: number;
  readonly startUrlMode: ComboAtacadistaStartUrlMode;
  readonly visualDatasetEnabled: boolean;
  readonly visualDatasetRootDirectory: string;
  readonly visualDatasetSplit: DatasetSplit;
}

export class InvalidComboAtacadistaCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidComboAtacadistaCommandOptionsError';
  }
}

export function parseComboAtacadistaCommandOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): ComboAtacadistaCommandOptions {
  const values = parseNamedArguments(args);

  return {
    homeUrl: readOption(
      values,
      env,
      'combo-home-url',
      'COMBO_ATACADISTA_HOME_URL',
      COMBO_ATACADISTA_HOME_URL,
    ),
    offersUrl: readOption(
      values,
      env,
      'combo-offers-url',
      'COMBO_ATACADISTA_OFFERS_URL',
      COMBO_ATACADISTA_OFFERS_URL,
    ),
    outputRootDirectory: readOption(
      values,
      env,
      'combo-output-root',
      'COMBO_ATACADISTA_LEAFLET_OUTPUT_DIR',
      '.data/leaflets-playwright',
    ),
    viewport: createVisualViewport({
      width: readPositiveInteger(values, env, 'combo-width', 'COMBO_ATACADISTA_WIDTH', 1366),
      height: readPositiveInteger(values, env, 'combo-height', 'COMBO_ATACADISTA_HEIGHT', 768),
      deviceScaleFactor: readPositiveNumber(
        values,
        env,
        'combo-device-scale-factor',
        'COMBO_ATACADISTA_DEVICE_SCALE_FACTOR',
        1,
      ),
    }),
    timeoutMs: readPositiveInteger(
      values,
      env,
      'combo-timeout-ms',
      'COMBO_ATACADISTA_TIMEOUT_MS',
      30_000,
    ),
    settleDelayMs: readNonNegativeInteger(
      values,
      env,
      'combo-settle-delay-ms',
      'COMBO_ATACADISTA_SETTLE_DELAY_MS',
      3_000,
    ),
    startUrlMode: readStartUrlMode(
      readOption(
        values,
        env,
        'combo-start-url-mode',
        'COMBO_ATACADISTA_START_URL_MODE',
        'offers-page',
      ),
    ),
    visualDatasetEnabled: readBoolean(
      values,
      env,
      'combo-visual-dataset-enabled',
      'COMBO_ATACADISTA_VISUAL_DATASET_ENABLED',
      true,
    ),
    visualDatasetRootDirectory: readOption(
      values,
      env,
      'combo-visual-dataset-root',
      'COMBO_ATACADISTA_VISUAL_DATASET_DIR',
      '.data/visual-dataset',
    ),
    visualDatasetSplit: readDatasetSplit(
      values,
      env,
      'combo-visual-dataset-split',
      'COMBO_ATACADISTA_VISUAL_DATASET_SPLIT',
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
      throw new InvalidComboAtacadistaCommandOptionsError(
        'Arguments must use --name value format.',
      );
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidComboAtacadistaCommandOptionsError(`Argument ${key} must have a value.`);
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
    throw new InvalidComboAtacadistaCommandOptionsError(`--${optionName} cannot be blank.`);
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
    throw new InvalidComboAtacadistaCommandOptionsError(
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
    throw new InvalidComboAtacadistaCommandOptionsError(
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
    throw new InvalidComboAtacadistaCommandOptionsError(
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
  const value = values.get(optionName) ?? env[envName] ?? String(defaultValue);

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new InvalidComboAtacadistaCommandOptionsError(`--${optionName} must be true or false.`);
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
      throw new InvalidComboAtacadistaCommandOptionsError(
        `--${optionName} must be train, validation, test, or unassigned.`,
      );
  }
}

function readStartUrlMode(value: string): ComboAtacadistaStartUrlMode {
  switch (value) {
    case 'home':
    case 'offers-page':
      return value;
    default:
      throw new InvalidComboAtacadistaCommandOptionsError(
        '--combo-start-url-mode must be home or offers-page.',
      );
  }
}
