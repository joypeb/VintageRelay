import { createElement, type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import { uploadPhoto, useUploadPhotoMutation } from '@/lib/api/photos';
import { renderWithClient } from '@/test/render';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const photo = {
  id: 'ph1',
  url: 'https://cdn.example/photos/ph1',
  contentType: 'image/jpeg',
  sizeBytes: 1834221,
  createdAt: '2026-10-27T05:42:10Z',
};
const file = new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' });

beforeEach(() => vi.resetAllMocks());

describe('uploadPhoto', () => {
  it('posts the file as multipart data and returns the parsed photo', async () => {
    vi.mocked(apiFetch).mockResolvedValue(photo);

    await expect(uploadPhoto('e1', file)).resolves.toEqual(photo);
    expect(apiFetch).toHaveBeenCalledOnce();
    const [eventId, path, init, options] = vi.mocked(apiFetch).mock.calls[0] ?? [];
    expect(eventId).toBe('e1');
    expect(path).toBe('/events/e1/photos');
    expect(init).toEqual({ method: 'POST', body: expect.any(FormData) });
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('file')).toBe(file);
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
    expect(options).toEqual({ timeoutMs: 15000 });
  });

  it('encodes the event ID in the path', async () => {
    vi.mocked(apiFetch).mockResolvedValue(photo);
    await uploadPhoto('a/b', file);
    expect(apiFetch).toHaveBeenCalledWith(
      'a/b',
      '/events/a%2Fb/photos',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
      { timeoutMs: 15000 },
    );
  });

  it('rejects a malformed response with an unknown error', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...photo, id: '' });
    const error = await uploadPhoto('e1', file).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
  });

  it('propagates API errors unchanged', async () => {
    const error = new ApiError(500, 'INTERNAL_ERROR', 'Server says no.');
    vi.mocked(apiFetch).mockRejectedValue(error);
    await expect(uploadPhoto('e1', file)).rejects.toBe(error);
  });
});

describe('useUploadPhotoMutation', () => {
  it('does not retry a 500 rejection', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Server says no.'));
    const { queryClient } = renderWithClient(createElement('div'));
    queryClient.setDefaultOptions({ mutations: { retry: 1, retryDelay: 0 } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useUploadPhotoMutation('e1'), { wrapper });

    act(() => result.current.mutate(file));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(apiFetch).toHaveBeenCalledOnce();
  });
});
