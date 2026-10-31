import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import { registerClothing } from '@/lib/api/clothing';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const body = {
  photoIds: ['p1', 'p2'],
  category: 'top' as const,
  title: 'Jacket',
  description: 'Green',
  measurements: { chest: 21.5 },
};

beforeEach(() => vi.resetAllMocks());

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
