import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import { getSessionHeaders } from '@/lib/session';

vi.mock('@/lib/session', () => ({ getSessionHeaders: vi.fn() }));

describe('API client', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(getSessionHeaders).mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('uses the API prefix and JSON headers without a session for public requests', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'e1' }), { status: 201 }));
    await expect(apiFetch(null, '/events', { method: 'POST', body: '{}' })).resolves.toEqual({
      id: 'e1',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://api.test/api/v1/events');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{}');
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.has('Authorization')).toBe(false);
    expect(getSessionHeaders).not.toHaveBeenCalled();
  });

  it('adds the session headers for the selected event', async () => {
    vi.mocked(getSessionHeaders).mockReturnValue({ Authorization: 'Bearer t1' });
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await apiFetch('e1', '/x');
    expect(getSessionHeaders).toHaveBeenCalledWith('e1');
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer t1',
    );
  });

  it('returns undefined for a 204 response', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch(null, '/x')).resolves.toBeUndefined();
  });

  it('rejects with the normalized API error for a failed response', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'BAD_REQUEST',
            message: 'Malformed JSON.',
            details: null,
            requestId: 'r1',
          },
        }),
        { status: 400 },
      ),
    );
    const result = apiFetch(null, '/x');
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Malformed JSON.',
      details: null,
      requestId: 'r1',
    });
  });

  it('normalizes a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network failure'));
    const result = apiFetch(null, '/x');
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Please check your network connection.',
    });
  });

  it('passes a signal when a timeout is requested', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await apiFetch(null, '/x', {}, { timeoutMs: 15000 });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('normalizes a timeout failure', async () => {
    fetchMock.mockRejectedValue(new DOMException('t', 'TimeoutError'));
    const result = apiFetch(null, '/events', {}, { timeoutMs: 15000 });
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'The connection timed out. Please try again.',
    });
  });

  it('uses a custom message for a timeout failure', async () => {
    fetchMock.mockRejectedValue(new DOMException('t', 'TimeoutError'));
    const result = apiFetch(null, '/events', {}, { timeoutMs: 15000, timeoutMessage: 'Custom.' });
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Custom.',
    });
  });
});
