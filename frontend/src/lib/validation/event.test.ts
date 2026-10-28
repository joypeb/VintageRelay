import { describe, expect, it } from 'vitest';

import {
  DISPLAY_NAME_MAX,
  EVENT_NAME_MAX,
  mapServerFieldErrors,
  toCreateEventRequest,
  validateCreateEventForm,
} from '@/lib/validation/event';

describe('toCreateEventRequest', () => {
  it('trims both fields without mutating the input', () => {
    const values = {
      name: '  Mangwon Flea Market Swap Corner  ',
      organizerDisplayName: '  Mina  ',
    };
    expect(toCreateEventRequest(values)).toEqual({
      name: 'Mangwon Flea Market Swap Corner',
      organizerDisplayName: 'Mina',
    });
    expect(values).toEqual({
      name: '  Mangwon Flea Market Swap Corner  ',
      organizerDisplayName: '  Mina  ',
    });
  });

  it('strips a trailing newline and a leading full-width space', () => {
    expect(toCreateEventRequest({ name: '\u3000Market', organizerDisplayName: 'Mina\n' })).toEqual({
      name: 'Market',
      organizerDisplayName: 'Mina',
    });
  });
});

describe('validateCreateEventForm', () => {
  it('exports the field length limits', () => {
    expect(EVENT_NAME_MAX).toBe(60);
    expect(DISPLAY_NAME_MAX).toBe(30);
  });

  it.each(['', '   '])('returns both required errors for empty values %j', (value) => {
    expect(validateCreateEventForm({ name: value, organizerDisplayName: value })).toEqual({
      ok: false,
      errors: {
        name: 'Please enter an event name.',
        organizerDisplayName: 'Please enter your display name.',
      },
    });
  });

  it.each(['a', '가'])('counts up to 60 event name code points for %s', (character) => {
    const valid = character.repeat(60);
    expect(validateCreateEventForm({ name: valid, organizerDisplayName: 'Mina' })).toEqual({
      ok: true,
      value: { name: valid, organizerDisplayName: 'Mina' },
    });
    expect(
      validateCreateEventForm({ name: character.repeat(61), organizerDisplayName: 'Mina' }),
    ).toEqual({ ok: false, errors: { name: 'Use at most 60 characters.' } });
  });

  it.each([
    ['letters', 'a'.repeat(30), 'a'.repeat(31)],
    ['emoji', '👍🏽'.repeat(15), '👍🏽'.repeat(16)],
  ])('counts display name code points for %s', (_case, valid, invalid) => {
    expect(validateCreateEventForm({ name: 'Market', organizerDisplayName: valid })).toEqual({
      ok: true,
      value: { name: 'Market', organizerDisplayName: valid },
    });
    expect(validateCreateEventForm({ name: 'Market', organizerDisplayName: invalid })).toEqual({
      ok: false,
      errors: { organizerDisplayName: 'Use at most 30 characters.' },
    });
  });

  it.each(['Mina\nKim', 'Mina\tKim'])('rejects internal control characters in %j', (value) => {
    expect(validateCreateEventForm({ name: 'Market', organizerDisplayName: value })).toEqual({
      ok: false,
      errors: { organizerDisplayName: 'Remove line breaks and tabs.' },
    });
  });

  it.each([
    ['Mina\n', 'Mina'],
    ['Mina Kim', 'Mina Kim'],
  ])('accepts %j after trimming', (input, output) => {
    expect(validateCreateEventForm({ name: 'Market', organizerDisplayName: input })).toEqual({
      ok: true,
      value: { name: 'Market', organizerDisplayName: output },
    });
  });

  it('prioritizes required and length errors over control characters per field', () => {
    expect(validateCreateEventForm({ name: '\n', organizerDisplayName: '\t' })).toEqual({
      ok: false,
      errors: {
        name: 'Please enter an event name.',
        organizerDisplayName: 'Please enter your display name.',
      },
    });
    expect(
      validateCreateEventForm({
        name: `${'a'.repeat(60)}\nb`,
        organizerDisplayName: `${'a'.repeat(30)}\nb`,
      }),
    ).toEqual({
      ok: false,
      errors: {
        name: 'Use at most 60 characters.',
        organizerDisplayName: 'Use at most 30 characters.',
      },
    });
    expect(validateCreateEventForm({ name: 'A\nB', organizerDisplayName: 'Mina\tKim' })).toEqual({
      ok: false,
      errors: {
        name: 'Remove line breaks and tabs.',
        organizerDisplayName: 'Remove line breaks and tabs.',
      },
    });
  });
});

describe('mapServerFieldErrors', () => {
  it.each([
    ['name', 'too_long', 'Use at most 60 characters.'],
    ['organizerDisplayName', 'required', 'Please enter your display name.'],
    ['name', 'invalid_type', 'Please enter text.'],
    ['organizerDisplayName', 'invalid_characters', 'Remove line breaks and tabs.'],
  ])('maps %s %s to its field message', (field, reason, message) => {
    expect(mapServerFieldErrors({ fields: [{ field, reason }] })).toEqual({
      fieldErrors: { [field]: message },
      formError: null,
    });
  });

  it('maps errors for both fields', () => {
    expect(
      mapServerFieldErrors({
        fields: [
          { field: 'name', reason: 'too_long' },
          { field: 'organizerDisplayName', reason: 'required' },
        ],
      }),
    ).toEqual({
      fieldErrors: {
        name: 'Use at most 60 characters.',
        organizerDisplayName: 'Please enter your display name.',
      },
      formError: null,
    });
  });

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'rejects inherited property %s as an unknown reason',
    (reason) => {
      expect(mapServerFieldErrors({ fields: [{ field: 'name', reason }] })).toEqual({
        fieldErrors: {},
        formError: 'Something went wrong. Please try again.',
      });
    },
  );

  it.each([
    ['unknown field', { fields: [{ field: 'theme', reason: 'unknown_field' }] }],
    ['unknown reason', { fields: [{ field: 'name', reason: 'unknown' }] }],
    ['null', null],
    ['string', 'x'],
    ['invalid fields', { fields: 'x' }],
  ])('uses a form error for %s', (_case, details) => {
    expect(mapServerFieldErrors(details)).toMatchObject({
      formError: 'Something went wrong. Please try again.',
    });
  });
});
