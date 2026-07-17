import type { DatasetSplit } from '../../domain/dataset/dataset-split';

export type AppEnvironment = 'local' | 'test' | 'development' | 'staging' | 'production';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type PlaywrightBrowserName = 'chromium' | 'firefox' | 'webkit';

export type StorageDriver = 'local';

export interface EnvironmentConfig {
  readonly appEnv: AppEnvironment;
  readonly logLevel: LogLevel;
  readonly extractionHeadless: boolean;
  readonly extractionDefaultTimeoutMs: number;
  readonly extractionNavigationTimeoutMs: number;
  readonly extractionRetryCount: number;
  readonly playwrightBrowser: PlaywrightBrowserName;
  readonly playwrightBlockAds: boolean;
  readonly playwrightBlockTrackers: boolean;
  readonly playwrightBlockFonts: boolean;
  readonly playwrightBlockNonEssentialMedia: boolean;
  readonly storageDriver: StorageDriver;
  readonly artifactStorageDir: string;
  readonly datasetStorageDir: string;
  readonly datasetDefaultSplit: DatasetSplit;
  readonly datasetScreenshotFormat: 'png';
}

export class InvalidEnvironmentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEnvironmentConfigError';
  }
}

export function loadEnvironmentConfig(env: NodeJS.ProcessEnv): EnvironmentConfig {
  return {
    appEnv: readAppEnvironment(env['APP_ENV']),
    logLevel: readLogLevel(env['LOG_LEVEL']),
    extractionHeadless: readBoolean(env['EXTRACTION_HEADLESS'], true, 'EXTRACTION_HEADLESS'),
    extractionDefaultTimeoutMs: readPositiveInteger(
      env['EXTRACTION_DEFAULT_TIMEOUT_MS'],
      30_000,
      'EXTRACTION_DEFAULT_TIMEOUT_MS',
    ),
    extractionNavigationTimeoutMs: readPositiveInteger(
      env['EXTRACTION_NAVIGATION_TIMEOUT_MS'],
      45_000,
      'EXTRACTION_NAVIGATION_TIMEOUT_MS',
    ),
    extractionRetryCount: readNonNegativeInteger(
      env['EXTRACTION_RETRY_COUNT'],
      2,
      'EXTRACTION_RETRY_COUNT',
    ),
    playwrightBrowser: readPlaywrightBrowser(env['PLAYWRIGHT_BROWSER']),
    playwrightBlockAds: readBoolean(env['PLAYWRIGHT_BLOCK_ADS'], true, 'PLAYWRIGHT_BLOCK_ADS'),
    playwrightBlockTrackers: readBoolean(
      env['PLAYWRIGHT_BLOCK_TRACKERS'],
      true,
      'PLAYWRIGHT_BLOCK_TRACKERS',
    ),
    playwrightBlockFonts: readBoolean(
      env['PLAYWRIGHT_BLOCK_FONTS'],
      false,
      'PLAYWRIGHT_BLOCK_FONTS',
    ),
    playwrightBlockNonEssentialMedia: readBoolean(
      env['PLAYWRIGHT_BLOCK_NON_ESSENTIAL_MEDIA'],
      false,
      'PLAYWRIGHT_BLOCK_NON_ESSENTIAL_MEDIA',
    ),
    storageDriver: readStorageDriver(env['STORAGE_DRIVER']),
    artifactStorageDir: readString(env['ARTIFACT_STORAGE_DIR'], '.data/artifacts'),
    datasetStorageDir: readString(env['DATASET_STORAGE_DIR'], '.data/dataset'),
    datasetDefaultSplit: readDatasetSplit(env['DATASET_DEFAULT_SPLIT']),
    datasetScreenshotFormat: 'png',
  };
}

function readString(value: string | undefined, fallback: string): string {
  return value ?? fallback;
}

function readBoolean(value: string | undefined, fallback: boolean, key: string): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new InvalidEnvironmentConfigError(`${key} must be either "true" or "false".`);
}

function readPositiveInteger(value: string | undefined, fallback: number, key: string): number {
  const parsedValue = readInteger(value, fallback, key);

  if (parsedValue <= 0) {
    throw new InvalidEnvironmentConfigError(`${key} must be greater than zero.`);
  }

  return parsedValue;
}

function readNonNegativeInteger(value: string | undefined, fallback: number, key: string): number {
  const parsedValue = readInteger(value, fallback, key);

  if (parsedValue < 0) {
    throw new InvalidEnvironmentConfigError(`${key} cannot be negative.`);
  }

  return parsedValue;
}

function readInteger(value: string | undefined, fallback: number, key: string): number {
  if (value === undefined) {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isInteger(parsedValue) || parsedValue.toString() !== value) {
    throw new InvalidEnvironmentConfigError(`${key} must be an integer.`);
  }

  return parsedValue;
}

function readAppEnvironment(value: string | undefined): AppEnvironment {
  switch (value) {
    case undefined:
      return 'local';
    case 'local':
    case 'test':
    case 'development':
    case 'staging':
    case 'production':
      return value;
    default:
      throw new InvalidEnvironmentConfigError('APP_ENV has an unsupported value.');
  }
}

function readLogLevel(value: string | undefined): LogLevel {
  switch (value) {
    case undefined:
      return 'info';
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
      return value;
    default:
      throw new InvalidEnvironmentConfigError('LOG_LEVEL has an unsupported value.');
  }
}

function readPlaywrightBrowser(value: string | undefined): PlaywrightBrowserName {
  switch (value) {
    case undefined:
      return 'chromium';
    case 'chromium':
    case 'firefox':
    case 'webkit':
      return value;
    default:
      throw new InvalidEnvironmentConfigError('PLAYWRIGHT_BROWSER has an unsupported value.');
  }
}

function readStorageDriver(value: string | undefined): StorageDriver {
  switch (value) {
    case undefined:
    case 'local':
      return 'local';
    default:
      throw new InvalidEnvironmentConfigError('STORAGE_DRIVER has an unsupported value.');
  }
}

function readDatasetSplit(value: string | undefined): DatasetSplit {
  switch (value) {
    case undefined:
      return 'unassigned';
    case 'train':
    case 'validation':
    case 'test':
    case 'unassigned':
      return value;
    default:
      throw new InvalidEnvironmentConfigError('DATASET_DEFAULT_SPLIT has an unsupported value.');
  }
}
