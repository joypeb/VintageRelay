import { describe, expect, it } from 'vitest';

import {
  mapJoinServerFieldErrors,
  readInitialCode,
  validateDisplayName,
  validateEntryCode,
} from '@/lib/validation/join';

describe('readInitialCode', () => {
  it.each([
    ['K7P3QX', 'K7P3QX'],
    [' k7p3qx ', 'k7p3qx'],
    [['AB', 'CD'], 'AB'],
    [undefined, null],
    ['', null],
    ['   ', null],
    [[], null],
  ])('reads the first trimmed code from %j', (input, expected) => {
    expect(readInitialCode(input)).toBe(expected);
  });
});

describe('validateEntryCode', () => {
  it('trims the code without changing its case', () => {
    expect(validateEntryCode('  k7p3qx ')).toEqual({ ok: true, value: 'k7p3qx' });
  });

  it.each(['', '   '])('rejects a blank code %j', (value) => {
    expect(validateEntryCode(value)).toEqual({ ok: false, message: 'Enter the entry code.' });
  });
});

describe('validateDisplayName', () => {
  it.each([
    [' Joon ', 'Joon'],
    [' a ', 'a'],
    [` ${'a'.repeat(30)} `, 'a'.repeat(30)],
    [` ${'😀'.repeat(30)} `, '😀'.repeat(30)],
  ])('accepts and trims a valid name %j', (input, value) => {
    expect(validateDisplayName(input)).toEqual({ ok: true, value });
  });

  it.each(['', '   ', 'a'.repeat(31)])('rejects an invalid length for %j', (value) => {
    expect(validateDisplayName(value)).toEqual({
      ok: false,
      message: 'Enter a display name of 1–30 characters.',
    });
  });

  it.each(['Jo\non', 'Jo\ton'])('rejects internal control characters in %j', (value) => {
    expect(validateDisplayName(value)).toEqual({ ok: false, message: 'Remove line breaks and tabs.' });
  });
});

describe('mapJoinServerFieldErrors', () => {
  it.each([
    ['displayName', 'too_long', 'Enter a display name of 1–30 characters.'],
    ['displayName', 'required', 'Enter a display name of 1–30 characters.'],
    ['displayName', 'invalid_characters', 'Remove line breaks and tabs.'],
    ['displayName', 'invalid_type', 'Enter a display name of 1–30 characters.'],
    ['entryCode', 'required', 'Enter the entry code.'],
    ['entryCode', 'invalid_type', 'Enter the entry code.'],
  ])('maps %s %s to its field error', (field, reason, message) => {
    expect(mapJoinServerFieldErrors({ fields: [{ field, reason }] })).toEqual({
      fieldErrors: { [field]: message },
      formError: null,
    });
  });

  it.each([
    ['unknown field', { fields: [{ field: 'unknown', reason: 'required' }] }],
    ['unknown reason', { fields: [{ field: 'displayName', reason: 'unknown' }] }],
    ['null', null],
    ['malformed details', { fields: 'invalid' }],
    ['empty fields', { fields: [] }],
  ])('uses a form error for %s', (_case, details) => {
    expect(mapJoinServerFieldErrors(details)).toEqual({
      fieldErrors: {},
      formError: 'Something went wrong. Please try again.',
    });
  });
});
