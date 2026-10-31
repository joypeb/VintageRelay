import { describe, expect, it } from 'vitest';

import {
  buildRegisterClothingBody,
  codePointLength,
  mapClothingServerFieldErrors,
  measurementFieldsFor,
  pruneMeasurements,
  validateClothingDraft,
} from '@/lib/validation/clothing-form';

type MeasurementField =
  'totalLength' | 'chest' | 'shoulder' | 'sleeve' | 'waist' | 'hem' | 'inseam' | 'thigh';
type Draft = {
  title: string;
  description: string;
  category: 'top' | 'outer' | 'bottom' | 'other' | '';
  measurements: Partial<Record<MeasurementField, string>>;
};
const draft: Draft = {
  title: 'Jacket',
  description: 'Green jacket',
  category: 'top',
  measurements: {},
};

describe('validateClothingDraft', () => {
  it.each([
    ['', 'Enter a title.'],
    ['   ', 'Enter a title.'],
    ['a'.repeat(101), 'Use 100 characters or fewer.'],
    ['😀'.repeat(101), 'Use 100 characters or fewer.'],
    ['a\nb', 'Use a single line without special characters.'],
  ])('rejects invalid title %s', (title, message) => {
    expect(validateClothingDraft({ ...draft, title })).toEqual({ title: message });
  });
  it.each(['a'.repeat(100), '😀'.repeat(100)])('accepts 100 code points in the title', (title) => {
    expect(validateClothingDraft({ ...draft, title })).toEqual({});
  });
  it.each([
    ['', 'Enter a description.'],
    [' '.repeat(3), 'Enter a description.'],
    ['a'.repeat(1001), 'Use 1,000 characters or fewer.'],
  ])('rejects invalid descriptions', (description, message) => {
    expect(validateClothingDraft({ ...draft, description })).toEqual({ description: message });
  });
  it('accepts a 1,000-code-point description', () => {
    expect(validateClothingDraft({ ...draft, description: 'a'.repeat(1000) })).toEqual({});
  });
  it('requires a category', () => {
    expect(validateClothingDraft({ ...draft, category: '' })).toEqual({
      category: 'Choose a category.',
    });
  });
  it.each(['0', '120.1', '32,5', 'abc', '32.55'])('rejects measurement %s', (chest) => {
    expect(validateClothingDraft({ ...draft, measurements: { chest } })).toEqual({
      chest: 'Enter a number from 0.1 to 120.',
    });
  });
  it.each(['0.1', '120', '32.5', ' 32 ', ''])('accepts measurement %s', (chest) => {
    expect(validateClothingDraft({ ...draft, measurements: { chest } })).toEqual({});
  });
});

it('counts Unicode code points including combining marks', () => {
  expect(codePointLength('😀a')).toBe(2);
  expect(codePointLength('é')).toBe(2);
});
it.each([
  ['top', ['totalLength', 'chest', 'shoulder', 'sleeve']],
  ['outer', ['totalLength', 'chest', 'shoulder', 'sleeve']],
  ['bottom', ['totalLength', 'waist', 'hem', 'inseam', 'thigh']],
  ['other', []],
  ['', []],
] as const)('returns measurement fields for %s', (category, fields) => {
  expect(measurementFieldsFor(category)).toEqual(fields);
});
it('prunes fields invalid for the new category', () => {
  expect(pruneMeasurements('bottom', { totalLength: '28', chest: '20' })).toEqual({
    totalLength: '28',
  });
  expect(pruneMeasurements('other', { totalLength: '28', chest: '20' })).toEqual({});
});
it('builds a trimmed request with ordered photos and numeric entered measurements', () => {
  expect(
    buildRegisterClothingBody(
      {
        ...draft,
        title: ' Jacket ',
        description: ' Green ',
        measurements: { chest: '21.5', sleeve: '' },
      },
      ['p1', 'p2'],
    ),
  ).toEqual({
    photoIds: ['p1', 'p2'],
    category: 'top',
    title: 'Jacket',
    description: 'Green',
    measurements: { chest: 21.5 },
  });
  expect(buildRegisterClothingBody({ ...draft, measurements: { chest: '' } }, ['p1'])).toEqual({
    photoIds: ['p1'],
    category: 'top',
    title: 'Jacket',
    description: 'Green jacket',
  });
});

describe('mapClothingServerFieldErrors', () => {
  it.each([
    ['title', 'required', 'title', 'Enter a title.'],
    ['title', 'too_long', 'title', 'Use 100 characters or fewer.'],
    ['title', 'invalid_characters', 'title', 'Use a single line without special characters.'],
    ['description', 'required', 'description', 'Enter a description.'],
    ['description', 'too_long', 'description', 'Use 1,000 characters or fewer.'],
    ['category', 'required', 'category', 'Choose a category.'],
    ['category', 'invalid', 'category', 'Choose a category.'],
    ...['totalLength', 'chest', 'shoulder', 'sleeve', 'waist', 'hem', 'inseam', 'thigh'].map(
      (field) => [`measurements.${field}`, 'invalid', field, 'Enter a number from 0.1 to 120.'],
    ),
  ])('maps %s %s to its field message', (field, reason, target, message) => {
    expect(mapClothingServerFieldErrors({ fields: [{ field, reason }] })).toEqual({
      fieldErrors: { [target]: message },
      formError: null,
      photoProblem: false,
    });
  });

  it.each(['invalid', 'anything'])('maps photoIds %s to a photo problem', (reason) => {
    expect(mapClothingServerFieldErrors({ fields: [{ field: 'photoIds', reason }] })).toEqual({
      fieldErrors: {},
      formError: null,
      photoProblem: true,
    });
  });

  it.each([
    [
      'unknown measurement reason',
      { fields: [{ field: 'measurements.chest', reason: 'unknown_field' }] },
    ],
    ['measurements object', { fields: [{ field: 'measurements', reason: 'invalid' }] }],
    ['unknown field', { fields: [{ field: 'unknown', reason: 'required' }] }],
    ['unknown reason', { fields: [{ field: 'title', reason: 'unknown' }] }],
    ['null', null],
    ['empty object', {}],
    ['malformed fields', { fields: 'x' }],
  ])('uses a form error for %s', (_name, details) => {
    expect(mapClothingServerFieldErrors(details)).toEqual({
      fieldErrors: {},
      formError: 'Check your entries and try again.',
      photoProblem: false,
    });
  });

  it('keeps the first message for each field while reporting unknown fields', () => {
    expect(
      mapClothingServerFieldErrors({
        fields: [
          { field: 'title', reason: 'required' },
          { field: 'title', reason: 'too_long' },
          { field: 'unknown', reason: 'invalid' },
        ],
      }),
    ).toEqual({
      fieldErrors: { title: 'Enter a title.' },
      formError: 'Check your entries and try again.',
      photoProblem: false,
    });
  });
});
