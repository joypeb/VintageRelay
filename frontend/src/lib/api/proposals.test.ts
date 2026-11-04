import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import { cancelProposal, consentProposal, getProposal, getProposalConflict, rejectProposal } from '@/lib/api/proposals';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe('proposal API', () => {
  it('selects the event token for a top-level proposal path', async () => {
    await getProposal('event-2', 'p/1');
    expect(apiFetch).toHaveBeenCalledWith('event-2', '/proposals/p%2F1');
  });

  it.each([
    ['consent', consentProposal, 'consents'],
    ['reject', rejectProposal, 'reject'],
  ])('%s sends the displayed version unchanged', async (_name, action, endpoint) => {
    await action('event-2', 'p/1', 17);
    expect(apiFetch).toHaveBeenCalledWith('event-2', `/proposals/p%2F1/${endpoint}`, {
      method: 'POST', body: JSON.stringify({ version: 17 }),
    });
  });

  it('maps a version conflict to the current status and latest proposal for the notice', () => {
    const error = new ApiError(409, 'PROPOSAL_VERSION_MISMATCH', 'Changed', {
      currentStatus: 'invalidated', latestProposalId: 'p2',
    });
    expect(getProposalConflict(error)).toEqual({ currentStatus: 'invalidated', latestProposalId: 'p2' });
    expect(getProposalConflict(new ApiError(409, 'EVENT_CLOSED', 'Closed'))).toBeNull();
  });
});

describe('cancel proposal', () => {
  it('posts without a body and returns the cancelled proposal', async () => {
    const cancelled = { id: 'p/1', status: 'cancelled' };
    vi.mocked(apiFetch).mockResolvedValue(cancelled);
    await expect(cancelProposal('event-2', 'p/1')).resolves.toEqual(cancelled);
    expect(apiFetch).toHaveBeenCalledWith('event-2', '/proposals/p%2F1/cancel', { method: 'POST' });
  });

  it.each(['PROPOSAL_NOT_CONFIRMED', 'EVENT_CLOSED'])('surfaces %s as an API error', async (code) => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, code, 'Cannot cancel.'));
    const result = cancelProposal('event-2', 'p1');
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ status: 409, code });
  });
});
