import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { parseSearchConditions, parseSearchResults } from '@/lib/validation/search-response';

const conditions = { category: 'outer', colors: ['green', 'navy'], measurements: { chest: { min: 20, max: 24 } }, keywords: ['workwear'], unrecognized: ['vintage'] };
const clothing = {
  id: 'c1', eventId: 'e1', owner: { participantId: 'p1', displayName: 'Alex', isOrganizer: true },
  isMine: false, photos: [{ id: 'photo1', url: 'https://example.com/photo.jpg' }],
  category: 'outer', title: 'Green jacket', description: 'A warm jacket', measurements: null,
  status: 'available', contentVersion: 1, analysis: null,
  createdAt: '2026-11-02T05:30:00Z', updatedAt: '2026-11-02T06:00:00Z',
};
const results = { items: [{ clothing, matchCount: 2, missingMeasurements: false }], conditionCount: 3, nextCursor: null };

function expectUnexpectedResponse(parse: (data: unknown) => unknown, data: unknown) {
  try {
    parse(data);
    expect.fail('Expected an ApiError');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
  }
}

describe('parseSearchConditions', () => {
  it('parses interpretation conditions', () => expect(parseSearchConditions(conditions)).toEqual(conditions));
  it('accepts a null category and a one-sided range', () => {
    const body = { ...conditions, category: null, measurements: { chest: { min: 20 } } };
    expect(parseSearchConditions(body)).toEqual(body);
  });
  it.each([
    [{ min: 20, max: null }, { min: 20 }],
    [{ min: null, max: 22 }, { max: 22 }],
  ])('normalizes a null measurement bound in %o', (range, expected) => {
    const body = { ...conditions, measurements: { chest: range } };
    expect(parseSearchConditions(body)).toEqual({ ...body, measurements: { chest: expected } });
  });
  it.each([
    ['unknown category', { ...conditions, category: 'shoes' }],
    ['unknown color', { ...conditions, colors: ['chartreuse'] }],
    ['wrong colors type', { ...conditions, colors: 'green' }],
    ['wrong measurement bound type', { ...conditions, measurements: { chest: { min: '20' } } }],
    ['range with no bounds', { ...conditions, measurements: { chest: { min: null, max: null } } }],
    ['missing keywords', { ...conditions, keywords: undefined }],
    ['missing unrecognized', { ...conditions, unrecognized: undefined }],
  ])('rejects %s with an unexpected response error', (_label, body) => expectUnexpectedResponse(parseSearchConditions, body));
});

describe('parseSearchResults', () => {
  it('parses ranked clothing and the null cursor', () => expect(parseSearchResults(results)).toEqual(results));
  it.each([
    ['invalid clothing', { ...results, items: [{ ...results.items[0], clothing: { id: 'c1' } }] }],
    ['wrong match count type', { ...results, items: [{ ...results.items[0], matchCount: '2' }] }],
    ['missing measurement flag', { ...results, items: [{ ...results.items[0], missingMeasurements: undefined }] }],
    ['missing condition count', { ...results, conditionCount: undefined }],
    ['invalid cursor', { ...results, nextCursor: 'next' }],
    ['wrong items type', { ...results, items: 'invalid' }],
  ])('rejects %s with an unexpected response error', (_label, body) => expectUnexpectedResponse(parseSearchResults, body));
});
