import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import {
  deleteClothing,
  getClothing,
  listClothing,
  registerClothing,
  shouldRetryClothingQuery,
  updateClothing,
  useClothingListQuery,
  useClothingQuery,
  useMyItemsQuery,
} from '@/lib/api/clothing';
import { queryKeys } from '@/lib/api/query-keys';
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


describe('disabled clothing read hooks', () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);

  it('does not fetch the list when disabled', () => {
    renderHook(() => useClothingListQuery('e1', { enabled: false }), { wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('does not fetch detail when disabled', () => {
    renderHook(() => useClothingQuery('e1', 'c1', { enabled: false }), { wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('shouldRetryClothingQuery', () => {
  it.each([
    ['network error', 0, new ApiError(0, 'NETWORK_ERROR', 'Network error'), true],
    ['server error', 0, new ApiError(500, 'INTERNAL_ERROR', 'Server error'), true],
    ['unauthenticated', 0, new ApiError(401, 'UNAUTHENTICATED', 'Unauthenticated'), false],
    ['not found', 0, new ApiError(404, 'NOT_FOUND', 'Not found'), false],
    ['validation error', 0, new ApiError(422, 'VALIDATION_ERROR', 'Invalid'), false],
    ['malformed response', 0, new ApiError(200, 'UNKNOWN_ERROR', 'Invalid response'), false],
    ['retry budget exhausted', 3, new ApiError(0, 'NETWORK_ERROR', 'Network error'), false],
  ])('handles %s', (_name, failureCount, error, expected) => {
    expect(shouldRetryClothingQuery(failureCount, error)).toBe(expected);
  });
});

describe('listClothing ownership', () => {
  it('requests own garments with ownership=mine', async () => {
    vi.mocked(apiFetch).mockResolvedValue(clothingList);
    await expect(listClothing('e1', 'mine')).resolves.toEqual(clothingList);
    expect(vi.mocked(apiFetch).mock.calls[0]?.slice(0, 2)).toEqual([
      'e1',
      '/events/e1/clothing?ownership=mine',
    ]);
    expect(apiFetch).toHaveBeenCalledOnce();
  });

  it('requests own garments with an encoded event ID', async () => {
    vi.mocked(apiFetch).mockResolvedValue(clothingList);
    await expect(listClothing('a/b c', 'mine')).resolves.toEqual(clothingList);
    expect(vi.mocked(apiFetch).mock.calls[0]?.slice(0, 2)).toEqual([
      'a/b c',
      '/events/a%2Fb%20c/clothing?ownership=mine',
    ]);
  });
});

describe('updateClothing', () => {
  const updateBody = {
    photoIds: ['p1', 'p2'],
    category: 'top' as const,
    title: 'Jacket',
    description: 'Green',
    measurements: { chest: 21.5 },
  };

  it('sends PATCH to the encoded clothing ID and returns the parsed clothing', async () => {
    vi.mocked(apiFetch).mockResolvedValue(clothing);
    await expect(updateClothing('event/session', 'a/b c', updateBody)).resolves.toEqual(clothing);
    const calls = vi.mocked(apiFetch).mock.calls[0];
    expect(calls?.slice(0, 2)).toEqual(['event/session', '/clothing/a%2Fb%20c']);
    expect(calls?.[2]).toMatchObject({ method: 'PATCH', body: JSON.stringify(updateBody) });
    expect(apiFetch).toHaveBeenCalledOnce();
  });

  it('rejects a malformed response with an unknown error', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: 'c1' });
    const error = await updateClothing('e1', 'c1', updateBody).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
  });

  it.each([
    new ApiError(0, 'NETWORK_ERROR', 'Network error'),
    new ApiError(409, 'EVENT_CLOSED', 'Event closed'),
    new ApiError(409, 'CLOTHING_ALREADY_CONFIRMED', 'Confirmed'),
  ])('rethrows API errors unchanged', async (error) => {
    vi.mocked(apiFetch).mockRejectedValue(error);
    await expect(updateClothing('e1', 'c1', updateBody)).rejects.toBe(error);
  });
});

describe('deleteClothing', () => {
  it('sends DELETE to the encoded clothing ID', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    await expect(deleteClothing('event/session', 'a/b c')).resolves.toBeUndefined();
    const calls = vi.mocked(apiFetch).mock.calls[0];
    expect(calls?.slice(0, 2)).toEqual(['event/session', '/clothing/a%2Fb%20c']);
    expect(calls?.[2]).toMatchObject({ method: 'DELETE' });
    expect(apiFetch).toHaveBeenCalledOnce();
  });

  it.each([
    new ApiError(0, 'NETWORK_ERROR', 'Network error'),
    new ApiError(409, 'EVENT_CLOSED', 'Event closed'),
    new ApiError(409, 'CLOTHING_ALREADY_CONFIRMED', 'Confirmed'),
  ])('rethrows API errors unchanged', async (error) => {
    vi.mocked(apiFetch).mockRejectedValue(error);
    await expect(deleteClothing('e1', 'c1')).rejects.toBe(error);
  });
});

describe('clothing list keys', () => {
  it('separates mine and others lists', () => {
    expect(queryKeys.clothingList('e1', 'mine')).not.toEqual(
      queryKeys.clothingList('e1', 'others'),
    );
  });

  it('includes ownership in the key', () => {
    expect(JSON.stringify(queryKeys.clothingList('e1', 'mine'))).toContain('mine');
    expect(JSON.stringify(queryKeys.clothingList('e1', 'others'))).toContain('others');
  });
});

const pendingAnalysis = {
  contentVersion: 1,
  status: 'pending',
  features: null,
  uncertainties: [],
  modelInfo: null,
  updatedAt: '2026-11-04T00:00:00Z',
};

const doneAnalysis = {
  contentVersion: 1,
  status: 'done',
  features: {
    colors: ['green'],
    pattern: 'solid',
    materialEstimate: 'denim',
    styleTags: ['vintage'],
    visibleDetails: ['front zip'],
    sizeLabel: 'M',
  },
  uncertainties: [{ aspect: 'logo', message: 'Check in person for a back logo.' }],
  modelInfo: { modelId: 'muse-spark-1.3' },
  updatedAt: '2026-11-04T00:01:00Z',
};

const failedAnalysis = {
  contentVersion: 1,
  status: 'failed',
  features: null,
  uncertainties: [],
  modelInfo: null,
  updatedAt: '2026-11-04T00:01:00Z',
};

describe('clothing analysis polling', () => {
  it('polls detail every 5 seconds while analysis is pending', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...clothing, analysis: pendingAnalysis });
    let query!: ReturnType<typeof useClothingQuery>;
    function Probe() {
      query = useClothingQuery('e1', 'c1');
      return null;
    }
    vi.useFakeTimers();
    const { unmount } = renderWithClient(createElement(Probe));
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(query.data).toEqual({ ...clothing, analysis: pendingAnalysis });
      expect(apiFetch).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(apiFetch).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(apiFetch).toHaveBeenCalledTimes(3);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it.each([
    ['done', doneAnalysis],
    ['failed', failedAnalysis],
    ['null', null],
  ])('does not poll detail when analysis is %s', async (_label, analysis) => {
    vi.mocked(apiFetch).mockResolvedValue({ ...clothing, analysis });
    let query!: ReturnType<typeof useClothingQuery>;
    function Probe() {
      query = useClothingQuery('e1', 'c1');
      return null;
    }
    vi.useFakeTimers();
    const { unmount } = renderWithClient(createElement(Probe));
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(query.data).toEqual({ ...clothing, analysis });
      expect(apiFetch).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300_000);
      });
      expect(apiFetch).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('polls my items every 5 seconds while any item is pending', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      items: [{ ...clothing, analysis: pendingAnalysis }],
      nextCursor: null,
    });
    let query!: ReturnType<typeof useMyItemsQuery>;
    function Probe() {
      query = useMyItemsQuery('e1');
      return null;
    }
    vi.useFakeTimers();
    const { unmount } = renderWithClient(createElement(Probe));
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(apiFetch).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(apiFetch).toHaveBeenCalledTimes(2);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it.each([
    ['done', doneAnalysis],
    ['failed', failedAnalysis],
    ['null', null],
  ])('does not poll my items when analysis is %s', async (_label, analysis) => {
    vi.mocked(apiFetch).mockResolvedValue({
      items: [{ ...clothing, analysis }],
      nextCursor: null,
    });
    let query!: ReturnType<typeof useMyItemsQuery>;
    function Probe() {
      query = useMyItemsQuery('e1');
      return null;
    }
    vi.useFakeTimers();
    const { unmount } = renderWithClient(createElement(Probe));
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(apiFetch).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300_000);
      });
      expect(apiFetch).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });
});
