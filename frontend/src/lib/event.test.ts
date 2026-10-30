import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import {
  getCloseEventFailure,
  getEventScreenState,
  getJoinFailure,
  getLookupFailure,
  getPhotoUploadFailure,
  isClosed,
  isOrganizer,
  keepClosedEvent,
} from '@/lib/event';
import type { Event } from '@/types/event';

const event: Event = {
  id: 'event-1',
  name: 'Neighborhood exchange',
  status: 'active',
  entryCode: 'ABC123',
  entryUrl: 'https://example.com/join?code=ABC123',
  organizerParticipantId: 'organizer-1',
  createdAt: '2026-10-27T09:00:00Z',
  closedAt: null,
  me: { participantId: 'organizer-1', displayName: 'Alex', isOrganizer: false },
  stats: { participantCount: 1, availableClothingCount: 0, confirmedExchangeCount: 0 },
};

const unauthenticated = new ApiError(401, 'UNAUTHENTICATED', 'x');
const notFound = new ApiError(404, 'NOT_FOUND', 'x');

describe('isOrganizer', () => {
  it('uses matching participant IDs even when the organizer flag is false', () => {
    expect(isOrganizer(event)).toBe(true);
  });

  it('rejects different participant IDs even when the organizer flag is true', () => {
    expect(
      isOrganizer({ ...event, me: { ...event.me, participantId: 'other', isOrganizer: true } }),
    ).toBe(false);
  });
});

describe('isClosed', () => {
  it('returns false for an active event and true for a closed event', () => {
    expect(isClosed(event)).toBe(false);
    expect(isClosed({ ...event, status: 'closed' })).toBe(true);
  });
});

describe('getEventScreenState', () => {
  it('denies access without a session even when data and an error exist', () => {
    expect(
      getEventScreenState({ hasSession: false, data: event, error: notFound, isPending: false }),
    ).toEqual({ kind: 'no-access' });
  });

  it('denies access for an authentication error, including with stale data', () => {
    for (const data of [undefined, event]) {
      expect(
        getEventScreenState({ hasSession: true, data, error: unauthenticated, isPending: false }),
      ).toEqual({ kind: 'no-access' });
    }
  });

  it('shows not found for a not-found error even with stale data', () => {
    expect(
      getEventScreenState({ hasSession: true, data: event, error: notFound, isPending: false }),
    ).toEqual({ kind: 'not-found' });
  });

  it('shows available data with no error or a background network error', () => {
    for (const error of [null, new ApiError(0, 'NETWORK_ERROR', 'Network error.')]) {
      expect(
        getEventScreenState({ hasSession: true, data: event, error, isPending: false }),
      ).toEqual({ kind: 'ready', event });
    }
  });

  it('shows the server message for an API error without data', () => {
    expect(
      getEventScreenState({
        hasSession: true,
        data: undefined,
        error: new ApiError(500, 'INTERNAL_ERROR', 'Server message.'),
        isPending: false,
      }),
    ).toEqual({ kind: 'error', message: 'Server message.' });
  });

  it('shows a generic message for an unexpected error without data', () => {
    expect(
      getEventScreenState({
        hasSession: true,
        data: undefined,
        error: new Error('boom'),
        isPending: false,
      }),
    ).toEqual({ kind: 'error', message: 'Something went wrong. Please try again.' });
  });

  it('shows loading when there is no data or error', () => {
    expect(
      getEventScreenState({ hasSession: true, data: undefined, error: null, isPending: true }),
    ).toEqual({ kind: 'loading' });
  });
});

describe('getCloseEventFailure', () => {
  it.each([
    [new ApiError(403, 'FORBIDDEN', 'Forbidden.'), { kind: 'forbidden' }],
    [new ApiError(401, 'UNAUTHENTICATED', 'Unauthenticated.'), { kind: 'no-access' }],
    [new ApiError(404, 'NOT_FOUND', 'Not found.'), { kind: 'not-found' }],
    [new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'), { kind: 'dialog', message: 'Server says no.' }],
    [
      new ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.'),
      { kind: 'dialog', message: 'Please check your network connection.' },
    ],
    [new ApiError(200, 'UNKNOWN_ERROR', 'Invalid response.'), { kind: 'dialog', message: 'Invalid response.' }],
    [new ApiError(409, 'EVENT_CLOSED', 'Event closed.'), { kind: 'dialog', message: 'Event closed.' }],
    [new Error('x'), { kind: 'dialog', message: 'Something went wrong. Please try again.' }],
  ])('maps %s to the appropriate failure', (error, expected) => {
    expect(getCloseEventFailure(error)).toEqual(expected);
  });
});

describe('getLookupFailure', () => {
  it.each([
    [
      new ApiError(404, 'NOT_FOUND', "We couldn't find an event with this code. Check the code and try again."),
      { kind: 'codeField', message: "We couldn't find an event with this code. Check the code and try again." },
    ],
    [new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'), { kind: 'form', message: 'Server says no.' }],
    [
      new ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.'),
      { kind: 'form', message: 'Please check your network connection.' },
    ],
    [new ApiError(429, 'UNKNOWN_ERROR', 'Please try again shortly.'), { kind: 'form', message: 'Please try again shortly.' }],
    [new Error('x'), { kind: 'form', message: 'Something went wrong. Please try again.' }],
  ])('maps %s to the appropriate failure', (error, expected) => {
    expect(getLookupFailure(error)).toEqual(expected);
  });
});

describe('getJoinFailure', () => {
  it.each([
    [
      new ApiError(409, 'DISPLAY_NAME_TAKEN', 'This display name is already taken.', { field: 'displayName' }),
      { kind: 'displayNameField', message: 'This display name is already taken.' },
    ],
    [new ApiError(409, 'EVENT_CLOSED', 'Event closed.'), { kind: 'closed' }],
    [new ApiError(404, 'NOT_FOUND', 'Not here.'), { kind: 'codeNotFound', message: 'Not here.' }],
    [
      new ApiError(422, 'VALIDATION_ERROR', 'Invalid input.', { fields: [{ field: 'displayName', reason: 'too_long' }] }),
      { kind: 'fields', fieldErrors: { displayName: 'Enter a display name of 1–30 characters.' }, formError: null },
    ],
    [new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'), { kind: 'form', message: 'Server says no.' }],
    [
      new ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.'),
      { kind: 'form', message: 'Please check your network connection.' },
    ],
    [new ApiError(200, 'UNKNOWN_ERROR', 'Invalid response.'), { kind: 'form', message: 'Invalid response.' }],
    [new Error('x'), { kind: 'form', message: 'Something went wrong. Please try again.' }],
  ])('maps %s to the appropriate failure', (error, expected) => {
    expect(getJoinFailure(error)).toEqual(expected);
  });
});

describe('getPhotoUploadFailure', () => {
  it.each([
    [new ApiError(413, 'FILE_TOO_LARGE', 'Photo exceeds the 10 MB limit.'), { kind: 'photoField', message: 'Photo exceeds the 10 MB limit.' }],
    [new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use a JPEG, PNG, or WebP photo.'), { kind: 'photoField', message: 'Use a JPEG, PNG, or WebP photo.' }],
    [new ApiError(422, 'VALIDATION_ERROR', 'No file.'), { kind: 'photoField', message: 'No file.' }],
    [new ApiError(400, 'BAD_REQUEST', 'Bad body.'), { kind: 'photoField', message: 'Bad body.' }],
    [new ApiError(409, 'EVENT_CLOSED', 'Event closed.'), { kind: 'closed' }],
    [new ApiError(401, 'UNAUTHENTICATED', 'Unauthenticated.'), { kind: 'no-access' }],
    [new ApiError(404, 'NOT_FOUND', 'Not here.'), { kind: 'not-found', message: 'Not here.' }],
    [new ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.'), { kind: 'form', message: 'Please check your network connection.' }],
    [new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'), { kind: 'form', message: 'Server says no.' }],
    [new ApiError(201, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.'), { kind: 'form', message: 'Something went wrong. Please try again.' }],
    [new Error('x'), { kind: 'form', message: 'Something went wrong. Please try again.' }],
  ])('maps %s to the appropriate failure', (error, expected) => {
    expect(getPhotoUploadFailure(error)).toEqual(expected);
  });
});

describe('keepClosedEvent', () => {
  const closed: Event = { ...event, status: 'closed', closedAt: '2026-10-27T10:00:00Z' };

  it('accepts the first active event', () => {
    expect(keepClosedEvent(undefined, event)).toEqual(event);
  });

  it('accepts an updated active event', () => {
    const updated = { ...event, name: 'Updated exchange' };
    expect(keepClosedEvent(event, updated)).toEqual(updated);
  });

  it('accepts a transition from active to closed', () => {
    expect(keepClosedEvent(event, closed)).toEqual(closed);
  });

  it('accepts updated counts for a closed event', () => {
    const updated = {
      ...closed,
      stats: { participantCount: 2, availableClothingCount: 0, confirmedExchangeCount: 0 },
    };
    expect(keepClosedEvent(closed, updated)).toEqual(updated);
  });

  it('keeps the same closed event when a stale active event arrives', () => {
    expect(keepClosedEvent(closed, event)).toBe(closed);
  });

  it('preserves the previous reference for deeply equal events', () => {
    const copy = { ...event, me: { ...event.me }, stats: event.stats && { ...event.stats } };
    expect(keepClosedEvent(event, copy)).toBe(event);
  });
});
