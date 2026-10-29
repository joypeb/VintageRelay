import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import type { CreateEventRequest, EventSession } from '@/types/event';

const CREATE_EVENT_TIMEOUT_MS = 15000;
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
