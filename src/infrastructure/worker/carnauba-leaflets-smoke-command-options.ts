import { createVisualViewport, type VisualViewport } from '../../domain/visual/viewport';

export interface CarnaubaLeafletsSmokeCommandOptions {
  readonly url: string;
  readonly outputRootDirectory: string;
  readonly viewport: VisualViewport;
  readonly timeoutMs: number;
  readonly settleDelayMs: number;
}

export class InvalidCarnaubaLeafletsSmokeCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCarnaubaLeafletsSmokeCommandOptionsError';
  }
}

export function parseCarnaubaLeafletsSmokeCommandOptions(
  args: readonly string[],
): CarnaubaLeafletsSmokeCommandOptions {
  const values = parseNamedArguments(args);

  return {
    url: validateAbsoluteUrl(
      readOptionalString(values, 'url', 'https://carnaubasupermercados.com.br/loja/79/encartes'),
    ),
    outputRootDirectory: readOptionalString(values, 'output-root', '.data/leaflets'),
    viewport: createVisualViewport({
      width: readOptionalPositiveInteger(values, 'width', 1366),
      height: readOptionalPositiveInteger(values, 'height', 768),
      deviceScaleFactor: readOptionalPositiveNumber(values, 'device-scale-factor', 1),
    }),
    timeoutMs: readOptionalPositiveInteger(values, 'timeout-ms', 30_000),
    settleDelayMs: readOptionalNonNegativeInteger(values, 'settle-delay-ms', 5_000),
  };
}

function parseNamedArguments(args: readonly string[]): ReadonlyMap<string, string> {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];

    if (key?.startsWith('--') !== true) {
      throw new InvalidCarnaubaLeafletsSmokeCommandOptionsError(
        'Arguments must use --name value format.',
      );
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidCarnaubaLeafletsSmokeCommandOptionsError(
        `Argument ${key} must have a value.`,
      );
    }

    values.set(key.slice(2), value);
  }

  return values;
}

function readOptionalString(
  values: ReadonlyMap<string, string>,
  key: string,
  defaultValue: string,
): string {
  const value = values.get(key);

  if (value === undefined) {
    return defaultValue;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    throw new InvalidCarnaubaLeafletsSmokeCommandOptionsError(`--${key} cannot be blank.`);
  }

  return trimmedValue;
}

function readOptionalPositiveInteger(
  values: ReadonlyMap<string, string>,
  key: string,
  defaultValue: number,
): number {
  const value = values.get(key);

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidCarnaubaLeafletsSmokeCommandOptionsError(
      `--${key} must be a positive integer.`,
    );
  }

  return parsed;
}

function readOptionalNonNegativeInteger(
  values: ReadonlyMap<string, string>,
  key: string,
  defaultValue: number,
): number {
  const value = values.get(key);

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidCarnaubaLeafletsSmokeCommandOptionsError(
      `--${key} must be a non-negative integer.`,
    );
  }

  return parsed;
}

function readOptionalPositiveNumber(
  values: ReadonlyMap<string, string>,
  key: string,
  defaultValue: number,
): number {
  const value = values.get(key);

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidCarnaubaLeafletsSmokeCommandOptionsError(
      `--${key} must be a positive number.`,
    );
  }

  return parsed;
}

function validateAbsoluteUrl(value: string): string {
  try {
    new URL(value);
  } catch {
    throw new InvalidCarnaubaLeafletsSmokeCommandOptionsError('--url must be absolute and valid.');
  }

  return value;
}
