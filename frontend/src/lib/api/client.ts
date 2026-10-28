import { env } from '@/lib/env';
import { getSessionHeaders } from '@/lib/session';

import { ApiError, toApiError } from './api-error';

const TIMEOUT_MESSAGE =
  "The connection timed out. Your event may have been created; if you don't see it, create it again.";

export async function apiFetch<T>(
  eventId: string | null,
  path: string,
  init: RequestInit = {},
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (eventId !== null) {
    for (const [name, value] of Object.entries(getSessionHeaders(eventId))) {
      headers.set(name, value);
    }
  }

  const signal =
    options.timeoutMs !== undefined ? AbortSignal.timeout(options.timeoutMs) : init.signal;

  let res: Response;
  try {
    res = await fetch(`${env.apiBaseUrl}/api/v1${path}`, { ...init, headers, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ApiError(0, 'NETWORK_ERROR', TIMEOUT_MESSAGE);
    }
    if (err instanceof TypeError) {
      throw new ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.');
    }
    throw err;
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
