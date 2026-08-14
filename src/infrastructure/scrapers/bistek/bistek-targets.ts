import type { BistekCity, BistekMonitoredStore, BistekStore } from './bistek-image-gallery-leaflet';

export const BISTEK_BASE_URL = 'https://institucional.bistek.com.br';

export const BISTEK_OFFERS_URL = `${BISTEK_BASE_URL}/ofertas`;

export const BISTEK_SUPERMARKET_NAME = 'Bistek';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

export class BistekTargetsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BistekTargetsParseError';
  }
}

export function parseBistekTargetsFromHtml(html: string): readonly BistekMonitoredStore[] {
  const cities = parseBistekCitiesFromHtml(html);
  const stores = parseBistekStoresFromHtml(html);
  const cityById = new Map(cities.map((city) => [city.cityId, city]));

  return stores.map((store) => {
    const city = cityById.get(store.cityId);

    if (city === undefined) {
      throw new BistekTargetsParseError(`Bistek store references unknown city: ${store.cityId}.`);
    }

    return {
      cityId: city.cityId,
      stateCode: city.stateCode,
      cityName: city.cityName,
      storeId: store.storeId,
      storeName: store.storeName,
      storeSlug: createBistekStoreSlug(city, store),
    };
  });
}

export function parseBistekCitiesFromHtml(html: string): readonly BistekCity[] {
  validateNonBlank(html, 'html');
  const literal = extractJavascriptVariableLiteral(html, 'cidades_list');
  const parsed = JSON.parse(literal) as JsonValue;

  if (!isJsonObject(parsed)) {
    throw new BistekTargetsParseError('Bistek cidades_list must be an object.');
  }

  const cities: BistekCity[] = [];

  for (const [cityId, value] of Object.entries(parsed)) {
    if (cityId === '0') {
      continue;
    }

    if (typeof value !== 'string') {
      throw new BistekTargetsParseError(`Bistek city ${cityId} must have a string name.`);
    }

    cities.push(parseCity(cityId, value));
  }

  if (cities.length === 0) {
    throw new BistekTargetsParseError('Bistek cidades_list did not expose selectable cities.');
  }

  return cities;
}

export function parseBistekStoresFromHtml(html: string): readonly BistekStore[] {
  validateNonBlank(html, 'html');
  const literal = extractJavascriptVariableLiteral(html, 'lojas');
  const parsed = JSON.parse(literal) as JsonValue;

  if (!isJsonArray(parsed)) {
    throw new BistekTargetsParseError('Bistek lojas must be an array.');
  }

  const stores = parsed.map((item, index) => parseStore(item, index));

  if (stores.length === 0) {
    throw new BistekTargetsParseError('Bistek lojas did not expose selectable stores.');
  }

  return stores;
}

export function createBistekStoreSlug(city: BistekCity, store: BistekStore): string {
  return slugify(`${city.stateCode}-${city.cityName}-${store.storeName}-${store.storeId}`);
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .replace(/º/g, 'o')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length === 0 ? 'bistek' : slug;
}

function extractJavascriptVariableLiteral(html: string, variableName: string): string {
  const expression = new RegExp(`var\\s+${variableName}\\s*=\\s*([\\s\\S]*?);`);
  const match = expression.exec(html);
  const literal = match?.slice(1, 2).join('').trim() ?? '';

  if (literal.length === 0) {
    throw new BistekTargetsParseError(`Bistek page did not expose ${variableName}.`);
  }

  return literal;
}

function parseCity(cityId: string, displayName: string): BistekCity {
  const match = /^([A-Z]{2})\s*-\s*(.+)$/.exec(displayName.trim());

  if (match === null) {
    throw new BistekTargetsParseError(`Bistek city has unsupported display name: ${displayName}.`);
  }

  const stateCode = match.slice(1, 2).join('');
  const cityName = match.slice(2, 3).join('').trim();

  if (cityName.length === 0) {
    throw new BistekTargetsParseError(`Bistek city has blank city name: ${displayName}.`);
  }

  return {
    cityId,
    stateCode,
    cityName,
    displayName,
  };
}

function parseStore(value: JsonValue, index: number): BistekStore {
  if (!isJsonObject(value)) {
    throw new BistekTargetsParseError(`Bistek store at index ${String(index)} must be an object.`);
  }

  const cityId = readRequiredString(value, 'cidade', index);
  const storeId = readRequiredString(value, 'id', index);
  const storeName = readRequiredString(value, 'loja', index);

  return {
    cityId,
    storeId,
    storeName,
    latitude: parseNullableCoordinate(readRequiredString(value, 'lat', index)),
    longitude: parseNullableCoordinate(readRequiredString(value, 'lng', index)),
  };
}

function readRequiredString(value: JsonObject, key: string, index: number): string {
  const field = value[key];

  if (typeof field !== 'string' || field.trim().length === 0) {
    throw new BistekTargetsParseError(
      `Bistek store at index ${String(index)} must have a non-blank ${key}.`,
    );
  }

  return field.trim();
}

function parseNullableCoordinate(value: string): number | null {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }

  return parsed;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function validateNonBlank(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new BistekTargetsParseError(`${fieldName} cannot be blank.`);
  }
}
