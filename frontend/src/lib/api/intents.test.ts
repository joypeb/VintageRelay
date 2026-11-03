import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '@/lib/api/client';
import { acceptIntent, declineIntent, withdrawIntent } from '@/lib/api/intents';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe('intent actions', () => {
  it.each([
    ['withdraw', withdrawIntent, '/intents/i%2F1', 'DELETE'],
    ['accept', acceptIntent, '/intents/i%2F1/accept', 'POST'],
    ['decline', declineIntent, '/intents/i%2F1/decline', 'POST'],
  ])('%s selects the event token for a top-level path', async (_name, action, path, method) => {
    await action('event-2', 'i/1');
    expect(apiFetch).toHaveBeenCalledWith('event-2', path, expect.objectContaining({ method }));
    expect(vi.mocked(apiFetch).mock.calls[0]?.[2]?.body).toBeUndefined();
  });
});
