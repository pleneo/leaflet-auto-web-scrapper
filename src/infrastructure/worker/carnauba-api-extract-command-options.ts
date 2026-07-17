export interface CarnaubaApiExtractCommandOptions {
  readonly apiBaseUrl: string;
  readonly brandId: number;
  readonly cacheRootDirectory: string;
  readonly cacheTtlMs: number;
  readonly outputRootDirectory: string;
}

export class InvalidCarnaubaApiExtractCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCarnaubaApiExtractCommandOptionsError';
  }
}

export function parseCarnaubaApiExtractCommandOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): CarnaubaApiExtractCommandOptions {
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
    outputRootDirectory: readOption(values, env, 'output-root', 'CARNAUBA_LEAFLET_OUTPUT_DIR', [
      '.data/leaflets',
    ]),
  };
}

function parseNamedArguments(args: readonly string[]): ReadonlyMap<string, string> {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];

    if (key?.startsWith('--') !== true) {
      throw new InvalidCarnaubaApiExtractCommandOptionsError(
        'Arguments must use --name value format.',
      );
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidCarnaubaApiExtractCommandOptionsError(`Argument ${key} must have a value.`);
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
    throw new InvalidCarnaubaApiExtractCommandOptionsError(`--${optionName} cannot be blank.`);
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
    throw new InvalidCarnaubaApiExtractCommandOptionsError(
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
    throw new InvalidCarnaubaApiExtractCommandOptionsError(
      `--${optionName} must be a non-negative integer.`,
    );
  }

  return parsed;
}

function validateAbsoluteUrl(value: string, optionName: string): string {
  try {
    new URL(value);
  } catch {
    throw new InvalidCarnaubaApiExtractCommandOptionsError(
      `--${optionName} must be absolute and valid.`,
    );
  }

  return value;
}
