import { describe, expect, it } from 'vitest';

import type { SearchConditions } from '@/types/search';

import {
  conditionCount,
  parseSearchParams,
  removeCondition,
  toSearchParams,
  validateFilters,
  validateQuery,
  withCategory,
} from './conditions';

const conditions: SearchConditions = {
  category: 'top',
  colors: ['black', 'blue'],
  measurements: { chest: { min: 20, max: 30 }, totalLength: { max: 40 } },
  unrecognized: ['soft fabric', 'vintage'],
};

describe('validateQuery', () => {
  it('accepts trimmed text of 1 through 200 characters', () => {
    expect(validateQuery('  x  ')).toBe(true);
    expect(validateQuery(` ${'x'.repeat(200)} `)).toBe(true);
  });

  it('rejects blank and overlong trimmed text', () => {
    expect(validateQuery('  ')).toBe(false);
    expect(validateQuery('x'.repeat(201))).toBe(false);
  });
});

describe('search parameters', () => {
  it('serializes and restores the query and all conditions', () => {
    const params = toSearchParams('blue jacket', conditions);
    expect(params.get('q')).toBe('blue jacket');
    expect(params.get('category')).toBe('top');
    expect(params.getAll('color')).toEqual(['black', 'blue']);
    expect(params.get('chestMin')).toBe('20');
    expect(params.get('chestMax')).toBe('30');
    expect(params.get('totalLengthMax')).toBe('40');
    expect(params.getAll('unrecognized')).toEqual(['soft fabric', 'vintage']);
    expect(parseSearchParams(params)).toEqual({ q: 'blue jacket', conditions });
  });

  it('ignores unknown values and invalid measurement bounds', () => {
    const params = new URLSearchParams(
      'category=unknown&color=ultraviolet&color=red&chestMin=abc&chestMax=120&waistMin=0&waistMax=121&unknownMin=12',
    );
    expect(parseSearchParams(params)).toEqual({
      q: '',
      conditions: {
        category: null,
        colors: ['red'],
        measurements: { chest: { max: 120 } },
        unrecognized: [],
      },
    });
  });

  it('collapses repeated colors', () => {
    const params = new URLSearchParams('color=green&color=green&color=blue');
    expect(parseSearchParams(params).conditions.colors).toEqual(['green', 'blue']);
  });
});

describe('condition editing', () => {
  it('removes the category without changing other conditions', () => {
    expect(removeCondition(conditions, { kind: 'category' })).toEqual({
      ...conditions,
      category: null,
    });
  });

  it('removes only the selected color', () => {
    expect(removeCondition(conditions, { kind: 'color', color: 'black' })).toEqual({
      ...conditions,
      colors: ['blue'],
    });
  });

  it('removes the selected measurement range', () => {
    expect(removeCondition(conditions, { kind: 'measurement', name: 'chest' })).toEqual({
      ...conditions,
      measurements: { totalLength: { max: 40 } },
    });
  });

  it('counts colors and measurement ranges, excluding category and unrecognized phrases', () => {
    expect(conditionCount(conditions)).toBe(4);
  });

  it('drops measurement ranges unavailable for the new category', () => {
    expect(withCategory(conditions, 'bottom')).toEqual({
      ...conditions,
      category: 'bottom',
      measurements: { totalLength: { max: 40 } },
    });
  });
});

describe('validateFilters', () => {
  it('accepts open ranges and inclusive bounds up to 120', () => {
    expect(validateFilters({ ...conditions, measurements: { chest: { min: 0.1, max: 120 }, waist: { min: 20 } } })).toBe(true);
  });

  it.each([
    { min: 30, max: 20 },
    { min: 0 },
    { max: 0 },
    { min: 121 },
    { max: 121 },
  ])('rejects an invalid range %o', (range) => {
    expect(validateFilters({ ...conditions, measurements: { chest: range } })).toBe(false);
  });
});
