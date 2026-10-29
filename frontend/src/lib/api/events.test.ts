import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import {
  createEvent,
  eventRefetchInterval,
  getEvent,
  shouldRetryEventQuery,
  useEventQuery,
} from '@/lib/api/events';
import type { Event, EventSession } from '@/types/event';

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

describe('getEvent', () => {
  beforeEach(() => vi.resetAllMocks());

  it('fetches and returns the validated event', async () => {
    vi.mocked(apiFetch).mockResolvedValue(session.event);
    await expect(getEvent('e1')).resolves.toEqual(session.event);
    expect(apiFetch).toHaveBeenCalledWith('e1', '/events/e1', {}, { timeoutMs: 15000 });
  });

  it('encodes the event ID in the path', async () => {
    vi.mocked(apiFetch).mockResolvedValue(session.event);
    await getEvent('a/b');
    expect(apiFetch).toHaveBeenCalledWith('a/b', '/events/a%2Fb', {}, { timeoutMs: 15000 });
  });

  it('rejects malformed organizer data with an unknown error', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...session.event, stats: null });
    await expect(getEvent('e1')).rejects.toBeInstanceOf(ApiError);
    await expect(getEvent('e1')).rejects.toMatchObject({ code: 'UNKNOWN_ERROR' });
  });
});

describe('shouldRetryEventQuery', () => {
  it.each([
    [401, 'UNAUTHENTICATED'],
    [404, 'NOT_FOUND'],
    [200, 'UNKNOWN_ERROR'],
  ])('does not retry %s %s', (status, code) => {
    expect(shouldRetryEventQuery(0, new ApiError(status, code, 'Error'))).toBe(false);
  });

  it.each([
    [0, 'NETWORK_ERROR'],
    [500, 'INTERNAL_ERROR'],
  ])('retries %s %s only once', (status, code) => {
    const error = new ApiError(status, code, 'Error');
    expect(shouldRetryEventQuery(0, error)).toBe(true);
    expect(shouldRetryEventQuery(1, error)).toBe(false);
  });
});

describe('eventRefetchInterval', () => {
  it('polls before data arrives and while active, then stops when closed', () => {
    const client = new QueryClient();
    const query = client.getQueryCache().build<Event>(client, { queryKey: ['events', 'e1'] });
    expect(eventRefetchInterval(query)).toBe(30000);
    client.setQueryData(['events', 'e1'], session.event);
    expect(eventRefetchInterval(query)).toBe(30000);
    client.setQueryData(['events', 'e1'], {
      ...session.event,
      status: 'closed',
      closedAt: '2026-10-29T00:00:00Z',
    });
    expect(eventRefetchInterval(query)).toBe(false);
  });
});

describe('useEventQuery', () => {
  beforeEach(() => vi.resetAllMocks());

  function setup() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    return { queryClient, wrapper };
  }

  it('does not fetch when disabled', () => {
    const { wrapper } = setup();
    renderHook(() => useEventQuery('e1', { enabled: false }), { wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('fetches the event and stores it under the event key when enabled', async () => {
    vi.mocked(apiFetch).mockResolvedValue(session.event);
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useEventQuery('e1', { enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(session.event));
    expect(queryClient.getQueryData(['events', 'e1'])).toEqual(session.event);
  });
});
