import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { parseEvent } from '@/lib/validation/event-response';
import type { Event } from '@/types/event';

const organizer: Event = {
  id: 'event-1',
  name: 'Neighborhood exchange',
  status: 'active',
  entryCode: 'ABC123',
  entryUrl: 'https://example.com/join/ABC123',
  organizerParticipantId: 'participant-1',
  createdAt: '2026-10-27T05:30:00Z',
  closedAt: null,
  me: { participantId: 'participant-1', displayName: 'Alex', isOrganizer: true },
  stats: { participantCount: 1, availableClothingCount: 0, confirmedExchangeCount: 0 },
};

const participant: Event = {
  ...organizer,
  me: { participantId: 'participant-2', displayName: 'Sam', isOrganizer: false },
  stats: null,
};

describe('parseEvent', () => {
  it.each([
    ['organizer', organizer],
    ['participant', participant],
    ['closed event', { ...organizer, status: 'closed', closedAt: '2026-10-27T09:00:00Z' }],
  ])('accepts a valid %s response', (_description, event) => {
    expect(parseEvent(event)).toEqual(event);
  });

  const { name: _name, ...withoutName } = organizer;
  const { displayName: _displayName, ...meWithoutDisplayName } = organizer.me;
  void _name;
  void _displayName;

  it.each([
    ['null', null],
    ['missing name', withoutName],
    ['unknown status', { ...organizer, status: 'archived' }],
    ['closed without a closure time', { ...organizer, status: 'closed', closedAt: null }],
    ['closed with an empty closure time', { ...organizer, status: 'closed', closedAt: '' }],
    ['closed with an invalid closure time', { ...organizer, status: 'closed', closedAt: 'not-a-date' }],
    ['empty creation time', { ...organizer, createdAt: '' }],
    ['invalid creation time', { ...organizer, createdAt: 'not-a-date' }],
    ['organizer without statistics', { ...organizer, stats: null }],
    ['negative count', { ...organizer, stats: { ...organizer.stats, participantCount: -1 } }],
    ['non-integer count', { ...organizer, stats: { ...organizer.stats, participantCount: 1.5 } }],
    ['missing display name', { ...organizer, me: meWithoutDisplayName }],
  ])('rejects %s with an unexpected response error', (_description, data) => {
    try {
      parseEvent(data);
      expect.fail('Expected an ApiError');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 200,
        code: 'UNKNOWN_ERROR',
        message: 'Something went wrong. Please try again.',
      });
    }
  });
});
