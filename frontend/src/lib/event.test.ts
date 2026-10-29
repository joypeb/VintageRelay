import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { getEventScreenState, isClosed, isOrganizer } from '@/lib/event';
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
