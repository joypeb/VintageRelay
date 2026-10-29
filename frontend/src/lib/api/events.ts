import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type Query,
} from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import { mutationKeys, queryKeys } from '@/lib/api/query-keys';
import { keepClosedEvent } from '@/lib/event';
import { parseEvent } from '@/lib/validation/event-response';
import type { CreateEventRequest, Event, EventSession } from '@/types/event';

const CREATE_EVENT_TIMEOUT_MS = 15000;
const GET_EVENT_TIMEOUT_MS = 15_000;
const EVENT_REFETCH_INTERVAL_MS = 30_000;
const MAX_EVENT_QUERY_RETRIES = 1;
const CLOSE_EVENT_TIMEOUT_MS = 15_000;
const CLOSE_EVENT_TIMEOUT_MESSAGE =
  'The connection timed out. The event may already be closed; check again.';
const CREATE_EVENT_TIMEOUT_MESSAGE =
  "The connection timed out. Your event may have been created; if you don't see it, create it again.";

export function createEvent(body: CreateEventRequest): Promise<EventSession> {
  return apiFetch<EventSession>(
    null,
    '/events',
    { method: 'POST', body: JSON.stringify(body) },
    { timeoutMs: CREATE_EVENT_TIMEOUT_MS, timeoutMessage: CREATE_EVENT_TIMEOUT_MESSAGE },
  );
}

export function useCreateEventMutation() {
  return useMutation({ mutationFn: createEvent, retry: 0 });
}

export async function getEvent(eventId: string): Promise<Event> {
  const data = await apiFetch<unknown>(
    eventId,
    `/events/${encodeURIComponent(eventId)}`,
    {},
    { timeoutMs: GET_EVENT_TIMEOUT_MS },
  );
  return parseEvent(data);
}

export function shouldRetryEventQuery(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError) {
    if (error.code === 'UNAUTHENTICATED' || error.code === 'NOT_FOUND') return false;
    if (error.code === 'UNKNOWN_ERROR' && error.status === 200) return false;
  }
  return failureCount < MAX_EVENT_QUERY_RETRIES;
}

export function eventRefetchInterval(query: Query<Event>): number | false {
  return query.state.data?.status === 'closed' ? false : EVENT_REFETCH_INTERVAL_MS;
}

export function useEventQuery(eventId: string, { enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: queryKeys.event(eventId),
    queryFn: () => getEvent(eventId),
    enabled,
    refetchInterval: eventRefetchInterval,
    retry: shouldRetryEventQuery,
    structuralSharing: keepClosedEvent,
  });
}

export async function closeEvent(eventId: string): Promise<Event> {
  const data = await apiFetch<unknown>(
    eventId,
    `/events/${encodeURIComponent(eventId)}/close`,
    { method: 'POST' },
    { timeoutMs: CLOSE_EVENT_TIMEOUT_MS, timeoutMessage: CLOSE_EVENT_TIMEOUT_MESSAGE },
  );
  const event = parseEvent(data);
  if (event.status !== 'closed') {
    throw new ApiError(200, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.');
  }
  return event;
}

export function useCloseEventMutation(eventId: string) {
  const queryClient = useQueryClient();
  const eventFilter = { queryKey: queryKeys.event(eventId), exact: true } as const;
  return useMutation({
    mutationKey: mutationKeys.closeEvent(eventId),
    mutationFn: () => closeEvent(eventId),
    retry: 0,
    onMutate: async () => {
      await queryClient.cancelQueries(eventFilter);
    },
    onSuccess: async (event) => {
      await queryClient.cancelQueries(eventFilter);
      queryClient.setQueryData(queryKeys.event(eventId), event);
    },
    onSettled: () => {
      void queryClient.invalidateQueries(eventFilter);
    },
  });
}

export function useIsCloseEventPending(eventId: string): boolean {
  return useIsMutating({ mutationKey: mutationKeys.closeEvent(eventId), exact: true }) > 0;
}
