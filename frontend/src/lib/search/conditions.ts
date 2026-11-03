import { MEASUREMENT_LABELS, codePointLength, measurementFieldsFor } from '@/lib/validation/clothing-form';
import type { ClothingCategory, ClothingColor, ClothingMeasurements } from '@/types/clothing';
import type { MeasurementRange, SearchConditions } from '@/types/search';

export const SEARCH_COLORS: ClothingColor[] = [
  'black',
  'white',
  'gray',
  'beige',
  'brown',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'navy',
  'purple',
  'pink',
  'multicolor',
];

export function colorLabel(color: ClothingColor): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

const CATEGORIES: ClothingCategory[] = ['top', 'outer', 'bottom', 'other'];

export type RemoveConditionTarget =
  | { kind: 'category' }
  | { kind: 'color'; color: ClothingColor }
  | { kind: 'measurement'; name: keyof ClothingMeasurements };

function isColor(value: string): value is ClothingColor {
  return SEARCH_COLORS.some((color) => color === value);
}

function isCategory(value: string): value is ClothingCategory {
  return CATEGORIES.some((category) => category === value);
}

function isMeasurementField(field: string): field is keyof ClothingMeasurements {
  return field in MEASUREMENT_LABELS;
}

function parseBound(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 120) return undefined;
  return numeric;
}

export function validateQuery(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed === '') return false;
  const length = codePointLength(trimmed);
  return length >= 1 && length <= 200;
}

export function toSearchParams(q: string, conditions: SearchConditions): URLSearchParams {
  const params = new URLSearchParams();
  if (q !== '') params.set('q', q);
  if (conditions.category !== null) params.set('category', conditions.category);
  for (const color of conditions.colors) params.append('color', color);
  for (const [name, range] of Object.entries(conditions.measurements)) {
    if (range === undefined) continue;
    if (range.min !== undefined) params.set(`${name}Min`, String(range.min));
    if (range.max !== undefined) params.set(`${name}Max`, String(range.max));
  }
  for (const phrase of conditions.unrecognized) params.append('unrecognized', phrase);
  return params;
}

export function parseSearchParams(params: URLSearchParams): {
  q: string;
  conditions: SearchConditions;
} {
  const q = params.get('q') ?? '';
  const rawCategory = params.get('category');
  const category = rawCategory !== null && isCategory(rawCategory) ? rawCategory : null;
  const colors: ClothingColor[] = [];
  for (const raw of params.getAll('color')) {
    if (isColor(raw) && !colors.includes(raw)) colors.push(raw);
  }
  const measurements: SearchConditions['measurements'] = {};
  for (const key of Object.keys(MEASUREMENT_LABELS)) {
    if (!isMeasurementField(key)) continue;
    const min = parseBound(params.get(`${key}Min`));
    const max = parseBound(params.get(`${key}Max`));
    if (min === undefined && max === undefined) continue;
    if (min !== undefined && max !== undefined && min > max) continue;
    const range: MeasurementRange = {};
    if (min !== undefined) range.min = min;
    if (max !== undefined) range.max = max;
    measurements[key] = range;
  }
  const unrecognized = params.getAll('unrecognized').filter((phrase) => phrase.trim() !== '');
  return { q, conditions: { category, colors, measurements, unrecognized } };
}

export function removeCondition(
  conditions: SearchConditions,
  target: RemoveConditionTarget,
): SearchConditions {
  switch (target.kind) {
    case 'category':
      return { ...conditions, category: null };
    case 'color':
      return { ...conditions, colors: conditions.colors.filter((color) => color !== target.color) };
    case 'measurement': {
      const next = { ...conditions.measurements };
      delete next[target.name];
      return { ...conditions, measurements: next };
    }
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

export function conditionCount(conditions: SearchConditions): number {
  return conditions.colors.length + Object.keys(conditions.measurements).length;
}

export function withCategory(
  conditions: SearchConditions,
  category: ClothingCategory | null,
): SearchConditions {
  if (category === null) return { ...conditions, category };
  const measurements: SearchConditions['measurements'] = {};
  for (const field of measurementFieldsFor(category)) {
    const range = conditions.measurements[field];
    if (range !== undefined) measurements[field] = range;
  }
  return { ...conditions, category, measurements };
}

export function validateFilters(conditions: SearchConditions): boolean {
  for (const [name, range] of Object.entries(conditions.measurements)) {
    if (!isMeasurementField(name) || range === undefined) return false;
    const { min, max } = range;
    if (min === undefined && max === undefined) return false;
    if (min !== undefined && (!Number.isFinite(min) || min <= 0 || min > 120)) return false;
    if (max !== undefined && (!Number.isFinite(max) || max <= 0 || max > 120)) return false;
    if (min !== undefined && max !== undefined && min > max) return false;
  }
  return true;
}
