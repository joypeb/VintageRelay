import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import { interpretSearch, searchClothing } from '@/lib/api/search';
import type { SearchConditions } from '@/types/search';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
const conditions: SearchConditions = { category: 'outer', colors: ['green', 'navy'], measurements: { chest: { min: 20, max: 24 } }, keywords: ['workwear'], unrecognized: ['vintage'] };
const clothing = {
  id: 'c1', eventId: 'e1', owner: { participantId: 'p1', displayName: 'Alex', isOrganizer: true },
  isMine: false, photos: [{ id: 'photo1', url: 'https://example.com/photo.jpg' }],
  category: 'outer', title: 'Green jacket', description: 'A warm jacket', measurements: null,
  status: 'available', contentVersion: 1, analysis: null,
  createdAt: '2026-11-02T05:30:00Z', updatedAt: '2026-11-02T06:00:00Z',
};
const results = { items: [{ clothing, matchCount: 2, missingMeasurements: false }], conditionCount: 3, nextCursor: null };
beforeEach(() => vi.resetAllMocks());

describe('interpretSearch', () => {
  it('posts text for the encoded event and returns parsed conditions', async () => {
    vi.mocked(apiFetch).mockResolvedValue(conditions);
    await expect(interpretSearch('a/b c', 'green jacket')).resolves.toEqual(conditions);
    const call = vi.mocked(apiFetch).mock.calls[0];
    expect(call?.slice(0, 2)).toEqual(['a/b c', '/events/a%2Fb%20c/search/interpretation']);
    expect(call?.[2]).toMatchObject({ method: 'POST', body: JSON.stringify({ text: 'green jacket' }) });
    expect(apiFetch).toHaveBeenCalledOnce();
  });
  it('rejects malformed conditions', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ category: 'shoes' });
    await expect(interpretSearch('e1', 'shoes')).rejects.toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
  });
  it('propagates AI unavailability unchanged', async () => {
    const error = new ApiError(503, 'AI_UNAVAILABLE', 'Search unavailable');
    vi.mocked(apiFetch).mockRejectedValue(error);
    await expect(interpretSearch('e1', 'jacket')).rejects.toBe(error);
  });
});

describe('searchClothing', () => {
  it('requests ranked results with encoded event and filter parameters only', async () => {
    vi.mocked(apiFetch).mockResolvedValue(results);
    await expect(searchClothing('a/b c', conditions)).resolves.toEqual(results);
    const call = vi.mocked(apiFetch).mock.calls[0];
    expect(call?.[0]).toBe('a/b c');
    const [path, query] = (call?.[1] as string).split('?');
    expect(path).toBe('/events/a%2Fb%20c/clothing/search');
    expect([...new URLSearchParams(query).entries()]).toEqual([
      ['category', 'outer'], ['color', 'green'], ['color', 'navy'], ['chestMin', '20'], ['chestMax', '24'], ['keyword', 'workwear'],
    ]);
    expect(apiFetch).toHaveBeenCalledOnce();
  });
  it('rejects malformed results', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: 'invalid', conditionCount: 0, nextCursor: null });
    await expect(searchClothing('e1', conditions)).rejects.toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
  });
  it('propagates API errors unchanged', async () => {
    const error = new ApiError(503, 'AI_UNAVAILABLE', 'Search unavailable');
    vi.mocked(apiFetch).mockRejectedValue(error);
    await expect(searchClothing('e1', conditions)).rejects.toBe(error);
  });
});
