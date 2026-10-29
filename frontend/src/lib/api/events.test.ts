import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '@/lib/api/client';
import { createEvent } from '@/lib/api/events';
import type { EventSession } from '@/types/event';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const session: EventSession = {
  event: {
    id: 'e1',
    name: 'N',
    status: 'active',
    entryCode: 'K7P3QX',
    entryUrl: 'http://localhost:3000/join?code=K7P3QX',
    organizerParticipantId: 'p1',
    createdAt: '2026-10-28T00:00:00Z',
    closedAt: null,
    me: { participantId: 'p1', displayName: 'Mina', isOrganizer: true },
    stats: { participantCount: 1, availableClothingCount: 0, confirmedExchangeCount: 0 },
  },
  participantToken: 't1',
};

describe('createEvent', () => {
  beforeEach(() => vi.resetAllMocks());

  it('posts the request and returns the event session', async () => {
    vi.mocked(apiFetch).mockResolvedValue(session);
    const body = { name: 'N', organizerDisplayName: 'Mina' };
    await expect(createEvent(body)).resolves.toEqual(session);
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(apiFetch).toHaveBeenCalledWith(
      null,
      '/events',
      { method: 'POST', body: JSON.stringify(body) },
      {
        timeoutMs: 15000,
        timeoutMessage:
          "The connection timed out. Your event may have been created; if you don't see it, create it again.",
      },
    );
  });
});
