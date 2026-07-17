import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentConfigError, loadEnvironmentConfig } from './environment-config';

describe('loadEnvironmentConfig', () => {
  it('loads defaults when optional environment values are absent', () => {
    const config = loadEnvironmentConfig({});

    expect(config).toMatchObject({
      appEnv: 'local',
      logLevel: 'info',
      extractionHeadless: true,
      extractionDefaultTimeoutMs: 30_000,
      extractionNavigationTimeoutMs: 45_000,
      extractionRetryCount: 2,
      playwrightBrowser: 'chromium',
      playwrightBlockAds: true,
      playwrightBlockTrackers: true,
      playwrightBlockFonts: false,
      playwrightBlockNonEssentialMedia: false,
      storageDriver: 'local',
      artifactStorageDir: '.data/artifacts',
      datasetStorageDir: '.data/dataset',
      datasetDefaultSplit: 'unassigned',
      datasetScreenshotFormat: 'png',
    });
  });

  it('loads explicit supported values', () => {
    const config = loadEnvironmentConfig({
      APP_ENV: 'test',
      LOG_LEVEL: 'debug',
      EXTRACTION_HEADLESS: 'false',
      EXTRACTION_DEFAULT_TIMEOUT_MS: '1000',
      EXTRACTION_NAVIGATION_TIMEOUT_MS: '2000',
      EXTRACTION_RETRY_COUNT: '0',
      PLAYWRIGHT_BROWSER: 'firefox',
      PLAYWRIGHT_BLOCK_ADS: 'false',
      PLAYWRIGHT_BLOCK_TRACKERS: 'false',
      PLAYWRIGHT_BLOCK_FONTS: 'true',
      PLAYWRIGHT_BLOCK_NON_ESSENTIAL_MEDIA: 'true',
      STORAGE_DRIVER: 'local',
      ARTIFACT_STORAGE_DIR: '.tmp/artifacts',
      DATASET_STORAGE_DIR: '.tmp/dataset',
      DATASET_DEFAULT_SPLIT: 'train',
    });

    expect(config).toMatchObject({
      appEnv: 'test',
      logLevel: 'debug',
      extractionHeadless: false,
      extractionDefaultTimeoutMs: 1_000,
      extractionNavigationTimeoutMs: 2_000,
      extractionRetryCount: 0,
      playwrightBrowser: 'firefox',
      playwrightBlockAds: false,
      playwrightBlockTrackers: false,
      playwrightBlockFonts: true,
      playwrightBlockNonEssentialMedia: true,
      artifactStorageDir: '.tmp/artifacts',
      datasetStorageDir: '.tmp/dataset',
      datasetDefaultSplit: 'train',
    });
  });

  it('loads explicit default enum values', () => {
    const config = loadEnvironmentConfig({
      APP_ENV: 'local',
      PLAYWRIGHT_BROWSER: 'chromium',
    });

    expect(config.appEnv).toBe('local');
    expect(config.playwrightBrowser).toBe('chromium');
  });

  it('rejects unsupported boolean values', () => {
    expect(() =>
      loadEnvironmentConfig({
        EXTRACTION_HEADLESS: 'yes',
      }),
    ).toThrow(InvalidEnvironmentConfigError);
  });

  it('rejects unsupported enum values', () => {
    expect(() =>
      loadEnvironmentConfig({
        PLAYWRIGHT_BROWSER: 'opera',
      }),
    ).toThrow(InvalidEnvironmentConfigError);
  });

  it('rejects unsupported app environment', () => {
    expect(() =>
      loadEnvironmentConfig({
        APP_ENV: 'qa',
      }),
    ).toThrow(InvalidEnvironmentConfigError);
  });

  it('rejects unsupported log level', () => {
    expect(() =>
      loadEnvironmentConfig({
        LOG_LEVEL: 'trace',
      }),
    ).toThrow(InvalidEnvironmentConfigError);
  });

  it('rejects unsupported storage driver', () => {
    expect(() =>
      loadEnvironmentConfig({
        STORAGE_DRIVER: 's3',
      }),
    ).toThrow(InvalidEnvironmentConfigError);
  });

  it('rejects unsupported dataset split', () => {
    expect(() =>
      loadEnvironmentConfig({
        DATASET_DEFAULT_SPLIT: 'holdout',
      }),
    ).toThrow(InvalidEnvironmentConfigError);
  });

  it('rejects invalid integer values', () => {
    expect(() =>
      loadEnvironmentConfig({
        EXTRACTION_DEFAULT_TIMEOUT_MS: '10.5',
      }),
    ).toThrow(InvalidEnvironmentConfigError);
  });

  it('rejects non-positive timeouts and negative retries', () => {
    expect(() =>
      loadEnvironmentConfig({
        EXTRACTION_DEFAULT_TIMEOUT_MS: '0',
      }),
    ).toThrow(InvalidEnvironmentConfigError);

    expect(() =>
      loadEnvironmentConfig({
        EXTRACTION_RETRY_COUNT: '-1',
      }),
    ).toThrow(InvalidEnvironmentConfigError);
  });
});
