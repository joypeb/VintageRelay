import { createElement } from 'react';

import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import {
  getClothing,
  listClothing,
  registerClothing,
  useClothingListQuery,
  useClothingQuery,
} from '@/lib/api/clothing';
import { renderWithClient } from '@/test/render';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const body = {
  photoIds: ['p1', 'p2'],
  category: 'top' as const,
  title: 'Jacket',
  description: 'Green',
  measurements: { chest: 21.5 },
};

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());

describe('registerClothing', () => {
  it('posts the body using an encoded event ID and returns the parsed clothing', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: 'c1' });
    await expect(registerClothing('a/b', body)).resolves.toMatchObject({ id: 'c1' });
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith(
      'a/b',
      '/events/a%2Fb/clothing',
      { method: 'POST', body: JSON.stringify(body) },
      { timeoutMs: 15000 },
    );
  });
  it('rejects a response missing the clothing ID', async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const error = await registerClothing('e1', body).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
  });
  it.each([
    new ApiError(0, 'NETWORK_ERROR', 'Network error'),
    new ApiError(500, 'INTERNAL_ERROR', 'Server error'),
  ])('rethrows API errors unchanged', async (error) => {
    vi.mocked(apiFetch).mockRejectedValue(error);
    await expect(registerClothing('e1', body)).rejects.toBe(error);
  });
});

const clothing = {
  id: 'c1',
  eventId: 'e1',
  owner: { participantId: 'p1', displayName: 'Alex', isOrganizer: true },
  isMine: false,
  photos: [{ id: 'photo1', url: 'https://example.com/photo.jpg' }],
  category: 'outer',
  title: 'Green jacket',
  description: 'A warm jacket',
  measurements: null,
  status: 'available',
  contentVersion: 1,
  analysis: null,
  createdAt: '2026-11-02T05:30:00Z',
  updatedAt: '2026-11-02T06:00:00Z',
};
const clothingList = { items: [clothing], nextCursor: null };

describe('listClothing', () => {
  it('selects the event session and requests other available clothing with an encoded ID', async () => {
    vi.mocked(apiFetch).mockResolvedValue(clothingList);
    await expect(listClothing('a/b c')).resolves.toEqual(clothingList);
    expect(vi.mocked(apiFetch).mock.calls[0]?.slice(0, 2)).toEqual([
      'a/b c',
      '/events/a%2Fb%20c/clothing?ownership=others&status=available',
    ]);
    expect(apiFetch).toHaveBeenCalledOnce();
  });
  it('rejects a malformed response with an unknown error', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: 'invalid', nextCursor: null });
    const error = await listClothing('e1').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
  });
  it.each([
    new ApiError(0, 'NETWORK_ERROR', 'Network error'),
    new ApiError(500, 'INTERNAL_ERROR', 'Server error'),
  ])('rethrows API errors unchanged', async (error) => {
    vi.mocked(apiFetch).mockRejectedValue(error);
    await expect(listClothing('e1')).rejects.toBe(error);
  });
});

describe('getClothing', () => {
  it('selects the event session and requests an encoded clothing ID', async () => {
    vi.mocked(apiFetch).mockResolvedValue(clothing);
    await expect(getClothing('event/session', 'a/b c')).resolves.toEqual(clothing);
    expect(vi.mocked(apiFetch).mock.calls[0]?.slice(0, 2)).toEqual([
      'event/session',
      '/clothing/a%2Fb%20c',
    ]);
    expect(apiFetch).toHaveBeenCalledOnce();
  });
  it('rejects a malformed response with an unknown error', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: 'c1' });
    const error = await getClothing('e1', 'c1').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
  });
  it.each([
    new ApiError(0, 'NETWORK_ERROR', 'Network error'),
    new ApiError(500, 'INTERNAL_ERROR', 'Server error'),
  ])('rethrows API errors unchanged', async (error) => {
    vi.mocked(apiFetch).mockRejectedValue(error);
    await expect(getClothing('e1', 'c1')).rejects.toBe(error);
  });
});

describe('clothing read hooks', () => {
  it('fetches the list on mount and refetch, without polling', async () => {
    vi.mocked(apiFetch).mockResolvedValue(clothingList);
    let query!: ReturnType<typeof useClothingListQuery>;
    function Probe() {
      query = useClothingListQuery('e1');
      return null;
    }
    vi.useFakeTimers();
    const { unmount } = renderWithClient(createElement(Probe));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(query.data).toEqual(clothingList);
    expect(apiFetch).toHaveBeenCalledOnce();
    await act(async () => {
      await query.refetch();
    });
    expect(apiFetch).toHaveBeenCalledTimes(2);
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300_000);
      });
      expect(apiFetch).toHaveBeenCalledTimes(2);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });
  it('fetches detail on mount and refetch, without polling', async () => {
    vi.mocked(apiFetch).mockResolvedValue(clothing);
    let query!: ReturnType<typeof useClothingQuery>;
    function Probe() {
      query = useClothingQuery('e1', 'c1');
      return null;
    }
    vi.useFakeTimers();
    const { unmount } = renderWithClient(createElement(Probe));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(query.data).toEqual(clothing);
    expect(apiFetch).toHaveBeenCalledOnce();
    await act(async () => {
      await query.refetch();
    });
    expect(apiFetch).toHaveBeenCalledTimes(2);
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300_000);
      });
      expect(apiFetch).toHaveBeenCalledTimes(2);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });
});
