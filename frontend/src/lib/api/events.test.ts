import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import {
  closeEvent,
  createEvent,
  eventRefetchInterval,
  getEvent,
  joinEvent,
  lookupEntryCode,
  shouldRetryEventQuery,
  useCloseEventMutation,
  useEventQuery,
  useEntryCodePreviewQuery,
  useIsEntryCodeLookupPending,
  useJoinEventMutation,
  useIsCloseEventPending,
} from '@/lib/api/events';
import { mutationKeys, queryKeys } from '@/lib/api/query-keys';
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

const closedEvent: Event = {
  ...session.event,
  status: 'closed',
  closedAt: '2026-10-29T00:00:00Z',
  stats: { participantCount: 3, availableClothingCount: 2, confirmedExchangeCount: 1 },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setupCloseClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(queryKeys.event('e1'), session.event);
  queryClient.setQueryData(queryKeys.event('e2'), { ...session.event, id: 'e2' });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('closeEvent', () => {
  beforeEach(() => vi.resetAllMocks());

  it('posts with the timeout and returns the parsed closed event', async () => {
    vi.mocked(apiFetch).mockResolvedValue(closedEvent);
    await expect(closeEvent('e1')).resolves.toEqual(closedEvent);
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith(
      'e1',
      '/events/e1/close',
      { method: 'POST' },
      {
        timeoutMs: 15000,
        timeoutMessage: 'The connection timed out. The event may already be closed; check again.',
      },
    );
  });

  it('encodes the event ID', async () => {
    vi.mocked(apiFetch).mockResolvedValue(closedEvent);
    await closeEvent('a/b');
    expect(apiFetch).toHaveBeenCalledWith(
      'a/b',
      '/events/a%2Fb/close',
      { method: 'POST' },
      expect.anything(),
    );
  });

  it.each([
    ['malformed', { ...closedEvent, stats: null }],
    ['active', session.event],
    ['closed without closedAt', { ...closedEvent, closedAt: null }],
  ])('rejects a %s response with an unknown error', async (_label, body) => {
    vi.mocked(apiFetch).mockResolvedValue(body);
    const error = await closeEvent('e1').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'UNKNOWN_ERROR', status: 200 });
  });

  it('propagates API errors unchanged', async () => {
    const error = new ApiError(403, 'FORBIDDEN', 'Forbidden');
    vi.mocked(apiFetch).mockRejectedValue(error);
    await expect(closeEvent('e1')).rejects.toBe(error);
  });
});

describe('close mutation key', () => {
  it('identifies the event close mutation', () => {
    expect(mutationKeys.closeEvent('e1')).toEqual(['events', 'e1', 'close']);
  });
});

describe('useCloseEventMutation', () => {
  beforeEach(() => vi.resetAllMocks());

  it('stores the closed response and invalidates only the exact event', async () => {
    const post = deferred<Event>();
    vi.mocked(apiFetch).mockImplementation((_id, _path, init) =>
      init?.method === 'POST' ? post.promise : new Promise(() => {}),
    );
    const { queryClient, wrapper } = setupCloseClient();
    const cancel = vi.spyOn(queryClient, 'cancelQueries');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCloseEventMutation('e1'), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await act(async () => post.resolve(closedEvent));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(queryKeys.event('e1'))).toEqual(closedEvent);
    expect(queryClient.getQueryState(queryKeys.event('e1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(queryKeys.event('e2'))?.isInvalidated).toBe(false);
    expect(cancel).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalled();
    for (const [filter] of [...cancel.mock.calls, ...invalidate.mock.calls]) {
      expect(filter).toMatchObject({ queryKey: queryKeys.event('e1'), exact: true });
    }
  });

  it('prevents existing and later in-flight active GETs from overwriting closure', async () => {
    const firstGet = deferred<Event>();
    const secondGet = deferred<Event>();
    const post = deferred<Event>();
    let getCount = 0;
    vi.mocked(apiFetch).mockImplementation((_id, _path, init) => {
      if (init?.method === 'POST') return post.promise;
      getCount += 1;
      return getCount === 1 ? firstGet.promise : secondGet.promise;
    });
    const { queryClient, wrapper } = setupCloseClient();
    const first = queryClient
      .fetchQuery({ queryKey: queryKeys.event('e1'), queryFn: () => getEvent('e1'), staleTime: 0 })
      .catch(() => undefined);
    await waitFor(() => expect(getCount).toBe(1));
    const { result } = renderHook(() => useCloseEventMutation('e1'), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        'e1',
        '/events/e1/close',
        expect.anything(),
        expect.anything(),
      ),
    );
    const second = queryClient
      .fetchQuery({ queryKey: queryKeys.event('e1'), queryFn: () => getEvent('e1'), staleTime: 0 })
      .catch(() => undefined);
    await waitFor(() => expect(getCount).toBe(2));
    await act(async () => post.resolve(closedEvent));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      firstGet.resolve(session.event);
      secondGet.resolve(session.event);
      await Promise.all([first, second]);
    });
    expect(queryClient.getQueryData(queryKeys.event('e1'))).toEqual(closedEvent);
  });

  it('preserves active cache on failure, invalidates it, and does not retry a 500', async () => {
    const error = new ApiError(500, 'INTERNAL_ERROR', 'Server says no.');
    vi.mocked(apiFetch).mockImplementation((_id, _path, init) =>
      init?.method === 'POST' ? Promise.reject(error) : new Promise(() => {}),
    );
    const { queryClient, wrapper } = setupCloseClient();
    const { result } = renderHook(() => useCloseEventMutation('e1'), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(queryKeys.event('e1'))).toEqual(session.event);
    expect(queryClient.getQueryState(queryKeys.event('e1'))?.isInvalidated).toBe(true);
    expect(
      vi.mocked(apiFetch).mock.calls.filter(([, , init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });

  it.each(['success', 'failure'] as const)(
    'settles %s while the invalidation GET remains pending',
    async (outcome) => {
      const get = deferred<Event>();
      vi.mocked(apiFetch).mockImplementation((_id, _path, init) =>
        init?.method === 'POST'
          ? outcome === 'success'
            ? Promise.resolve(closedEvent)
            : Promise.reject(new ApiError(500, 'INTERNAL_ERROR', 'Error'))
          : get.promise,
      );
      const { wrapper } = setupCloseClient();
      renderHook(() => useEventQuery('e1', { enabled: true }), { wrapper });
      const { result } = renderHook(() => useCloseEventMutation('e1'), { wrapper });
      act(() => result.current.mutate());
      await waitFor(() =>
        expect(apiFetch).toHaveBeenCalledWith('e1', '/events/e1', {}, expect.anything()),
      );
      await waitFor(() =>
        expect(outcome === 'success' ? result.current.isSuccess : result.current.isError).toBe(
          true,
        ),
      );
    },
  );

  it('updates and invalidates the cache after the mutation hook unmounts', async () => {
    const post = deferred<Event>();
    vi.mocked(apiFetch).mockReturnValue(post.promise);
    const { queryClient, wrapper } = setupCloseClient();
    const { result, unmount } = renderHook(() => useCloseEventMutation('e1'), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    unmount();
    await act(async () => post.resolve(closedEvent));
    await waitFor(() =>
      expect(queryClient.getQueryData(queryKeys.event('e1'))).toEqual(closedEvent),
    );
    await waitFor(() =>
      expect(queryClient.getQueryState(queryKeys.event('e1'))?.isInvalidated).toBe(true),
    );
  });
});

describe('useIsCloseEventPending', () => {
  beforeEach(() => vi.resetAllMocks());

  it('tracks an e1 mutation across unmount and returns false after settlement', async () => {
    const post = deferred<Event>();
    vi.mocked(apiFetch).mockReturnValue(post.promise);
    const { wrapper } = setupCloseClient();
    const pending = renderHook(() => useIsCloseEventPending('e1'), { wrapper });
    expect(pending.result.current).toBe(false);
    const mutation = renderHook(() => useCloseEventMutation('e1'), { wrapper });
    act(() => mutation.result.current.mutate());
    await waitFor(() => expect(pending.result.current).toBe(true));
    pending.unmount();
    mutation.unmount();
    const remounted = renderHook(() => useIsCloseEventPending('e1'), { wrapper });
    expect(remounted.result.current).toBe(true);
    await act(async () => post.resolve(closedEvent));
    await waitFor(() => expect(remounted.result.current).toBe(false));
  });

  it('ignores a close for a different event', async () => {
    const post = deferred<Event>();
    vi.mocked(apiFetch).mockReturnValue(post.promise);
    const { wrapper } = setupCloseClient();
    const pending = renderHook(() => useIsCloseEventPending('e1'), { wrapper });
    const mutation = renderHook(() => useCloseEventMutation('e2'), { wrapper });
    act(() => mutation.result.current.mutate());
    await waitFor(() => expect(mutation.result.current.isPending).toBe(true));
    expect(pending.result.current).toBe(false);
    await act(async () => post.resolve({ ...closedEvent, id: 'e2' }));
    await waitFor(() => expect(mutation.result.current.isSuccess).toBe(true));
  });
});

describe('useEventQuery structural sharing', () => {
  beforeEach(() => vi.resetAllMocks());

  it('keeps a cached closed event when a refetch returns an active event', async () => {
    const get = deferred<Event>();
    vi.mocked(apiFetch).mockReturnValue(get.promise);
    const { queryClient, wrapper } = setupCloseClient();
    queryClient.setQueryData(queryKeys.event('e1'), closedEvent);
    const { result } = renderHook(() => useEventQuery('e1', { enabled: true }), { wrapper });
    act(() => {
      void result.current.refetch();
    });
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await act(async () => get.resolve(session.event));
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.data).toEqual(closedEvent);
    expect(queryClient.getQueryData(queryKeys.event('e1'))).toEqual(closedEvent);
  });
});

const preview = { eventId: 'e1', name: 'Mangwon Swap', status: 'active' as const };
const joinedSession: EventSession = {
  event: {
    ...session.event,
    me: { participantId: 'p2', displayName: 'Joon', isOrganizer: false },
    stats: null,
  },
  participantToken: 'tok',
};
const joinBody = { entryCode: 'k7p3qx', displayName: 'Joon' };

function setupJoinClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 1, retryDelay: 0 },
      mutations: { retry: 1, retryDelay: 0 },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('lookupEntryCode', () => {
  beforeEach(() => vi.resetAllMocks());
  it('fetches without authorization and returns the parsed preview', async () => {
    vi.mocked(apiFetch).mockResolvedValue(preview);
    await expect(lookupEntryCode('K7P3QX')).resolves.toEqual(preview);
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith(
      null,
      '/entry-codes/K7P3QX',
      {},
      { timeoutMs: 15000 },
    );
  });
  it('encodes the entry code', async () => {
    vi.mocked(apiFetch).mockResolvedValue(preview);
    await lookupEntryCode('a/b c');
    expect(apiFetch).toHaveBeenCalledWith(null, '/entry-codes/a%2Fb%20c', {}, { timeoutMs: 15000 });
  });
  it('rejects a malformed response with an unknown error', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...preview, status: 'open' });
    const error = await lookupEntryCode('K7P3QX').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
  });
  it('propagates API errors unchanged', async () => {
    const error = new ApiError(404, 'NOT_FOUND', 'Not found');
    vi.mocked(apiFetch).mockRejectedValue(error);
    await expect(lookupEntryCode('K7P3QX')).rejects.toBe(error);
  });
});

describe('joinEvent', () => {
  beforeEach(() => vi.resetAllMocks());
  it('posts without authorization and returns the parsed session', async () => {
    vi.mocked(apiFetch).mockResolvedValue(joinedSession);
    await expect(joinEvent('e1', joinBody)).resolves.toEqual(joinedSession);
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith(
      null,
      '/events/e1/participants',
      { method: 'POST', body: JSON.stringify(joinBody) },
      {
        timeoutMs: 15000,
        timeoutMessage:
          'The connection timed out. Please try again. If your display name is now taken, choose a different one.',
      },
    );
  });
  it('encodes the event ID', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ...joinedSession,
      event: { ...joinedSession.event, id: 'a/b' },
    });
    await joinEvent('a/b', joinBody);
    expect(apiFetch).toHaveBeenCalledWith(
      null,
      '/events/a%2Fb/participants',
      expect.anything(),
      expect.anything(),
    );
  });
  it.each([
    ['different event ID', { ...joinedSession, event: { ...joinedSession.event, id: 'e2' } }],
    [
      'organizer',
      {
        ...joinedSession,
        event: { ...joinedSession.event, me: { ...joinedSession.event.me, isOrganizer: true } },
      },
    ],
  ])('rejects a response with %s', async (_label, body) => {
    vi.mocked(apiFetch).mockResolvedValue(body);
    const error = await joinEvent('e1', joinBody).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
  });
  it('propagates API errors unchanged', async () => {
    const error = new ApiError(500, 'INTERNAL_ERROR', 'Server says no.');
    vi.mocked(apiFetch).mockRejectedValue(error);
    await expect(joinEvent('e1', joinBody)).rejects.toBe(error);
  });
});

describe('useEntryCodePreviewQuery', () => {
  beforeEach(() => vi.resetAllMocks());
  it('is idle with a null code', () => {
    const { wrapper } = setupJoinClient();
    const { result } = renderHook(() => useEntryCodePreviewQuery(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it('fetches once and exposes the preview, then clears it for null', async () => {
    vi.mocked(apiFetch).mockResolvedValue(preview);
    const { wrapper } = setupJoinClient();
    const { result, rerender } = renderHook(
      ({ code }: { code: string | null }) => useEntryCodePreviewQuery(code),
      {
        wrapper,
        initialProps: { code: 'K7P3QX' as string | null },
      },
    );
    await waitFor(() => expect(result.current.data).toEqual(preview));
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith(
      null,
      '/entry-codes/K7P3QX',
      {},
      { timeoutMs: 15000 },
    );
    rerender({ code: null });
    expect(result.current.data).toBeUndefined();
  });
  it('does not retry a failed lookup', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Error'));
    const { wrapper } = setupJoinClient();
    const { result } = renderHook(() => useEntryCodePreviewQuery('K7P3QX'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(apiFetch).toHaveBeenCalledOnce();
  });
  it('fetches again after a completed lookup is unmounted and remounted', async () => {
    vi.mocked(apiFetch).mockResolvedValue(preview);
    const { wrapper } = setupJoinClient();
    const first = renderHook(() => useEntryCodePreviewQuery('K7P3QX'), { wrapper });
    await waitFor(() => expect(first.result.current.data).toEqual(preview));
    first.unmount();
    const second = renderHook(() => useEntryCodePreviewQuery('K7P3QX'), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
  });
});

describe('useIsEntryCodeLookupPending', () => {
  beforeEach(() => vi.resetAllMocks());
  it('tracks a pending lookup after its consumer switches to null until it settles', async () => {
    const lookup = deferred<typeof preview>();
    vi.mocked(apiFetch).mockReturnValue(lookup.promise);
    const { wrapper } = setupJoinClient();
    const pending = renderHook(() => useIsEntryCodeLookupPending(), { wrapper });
    expect(pending.result.current).toBe(false);
    const consumer = renderHook(
      ({ code }: { code: string | null }) => useEntryCodePreviewQuery(code),
      {
        wrapper,
        initialProps: { code: 'AAA' as string | null },
      },
    );
    await waitFor(() => expect(pending.result.current).toBe(true));
    consumer.rerender({ code: null });
    expect(pending.result.current).toBe(true);
    await act(async () => lookup.resolve(preview));
    await waitFor(() => expect(pending.result.current).toBe(false));
  });
});

describe('useJoinEventMutation', () => {
  beforeEach(() => vi.resetAllMocks());
  it('does not retry a 500 rejection', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'));
    const { wrapper } = setupJoinClient();
    const { result } = renderHook(() => useJoinEventMutation(), { wrapper });
    act(() => result.current.mutate({ eventId: 'e1', body: joinBody }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(apiFetch).toHaveBeenCalledOnce();
  });
});
