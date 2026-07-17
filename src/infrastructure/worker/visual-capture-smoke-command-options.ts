import type { SupermarketId } from '../../domain/supermarket/supermarket-id';
import { createVisualViewport, type VisualViewport } from '../../domain/visual/viewport';

export interface VisualCaptureSmokeCommandOptions {
  readonly url: string;
  readonly artifactRootDirectory: string;
  readonly supermarketId: SupermarketId;
  readonly viewport: VisualViewport;
  readonly fullPage: boolean;
  readonly timeoutMs: number;
}

export class InvalidVisualCaptureSmokeCommandOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidVisualCaptureSmokeCommandOptionsError';
  }
}

export function parseVisualCaptureSmokeCommandOptions(
  args: readonly string[],
): VisualCaptureSmokeCommandOptions {
  const values = parseNamedArguments(args);
  const url = readRequiredString(values, 'url');

  return {
    url: validateAbsoluteUrl(url),
    artifactRootDirectory: readOptionalString(values, 'artifact-root', '.data/artifacts'),
    supermarketId: parseSupermarketId(
      readOptionalString(values, 'supermarket', 'generic-supermarket'),
    ),
    viewport: createVisualViewport({
      width: readOptionalPositiveInteger(values, 'width', 1366),
      height: readOptionalPositiveInteger(values, 'height', 768),
      deviceScaleFactor: readOptionalPositiveNumber(values, 'device-scale-factor', 1),
    }),
    fullPage: readOptionalBoolean(values, 'full-page', true),
    timeoutMs: readOptionalPositiveInteger(values, 'timeout-ms', 30_000),
  };
}

function parseNamedArguments(args: readonly string[]): ReadonlyMap<string, string> {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];

    if (key?.startsWith('--') !== true) {
      throw new InvalidVisualCaptureSmokeCommandOptionsError(
        'Arguments must use --name value format.',
      );
    }

    if (value === undefined || value.startsWith('--')) {
      throw new InvalidVisualCaptureSmokeCommandOptionsError(`Argument ${key} must have a value.`);
    }

    values.set(key.slice(2), value);
  }

  return values;
}

function readRequiredString(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);

  if (value === undefined || value.trim().length === 0) {
    throw new InvalidVisualCaptureSmokeCommandOptionsError(`Missing required --${key} argument.`);
  }

  return value.trim();
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
    throw new InvalidVisualCaptureSmokeCommandOptionsError(`--${key} cannot be blank.`);
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
    throw new InvalidVisualCaptureSmokeCommandOptionsError(`--${key} must be a positive integer.`);
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
    throw new InvalidVisualCaptureSmokeCommandOptionsError(`--${key} must be a positive number.`);
  }

  return parsed;
}

function readOptionalBoolean(
  values: ReadonlyMap<string, string>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = values.get(key);

  if (value === undefined) {
    return defaultValue;
  }

  switch (value) {
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      throw new InvalidVisualCaptureSmokeCommandOptionsError(
        `--${key} must be either true or false.`,
      );
  }
}

function parseSupermarketId(value: string): SupermarketId {
  switch (value) {
    case 'assai':
    case 'carnauba':
    case 'generic-supermarket':
    case 'sao-luiz':
      return value;
    default:
      throw new InvalidVisualCaptureSmokeCommandOptionsError(
        '--supermarket must be one of: assai, carnauba, generic-supermarket, sao-luiz.',
      );
  }
}

function validateAbsoluteUrl(value: string): string {
  try {
    new URL(value);
  } catch {
    throw new InvalidVisualCaptureSmokeCommandOptionsError('--url must be absolute and valid.');
  }

  return value;
}
