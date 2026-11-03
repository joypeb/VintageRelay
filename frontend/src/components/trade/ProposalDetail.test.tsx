import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProposalDetail } from '@/components/trade/ProposalDetail';
import { ApiError } from '@/lib/api/api-error';
import { consentProposal, getProposal, rejectProposal } from '@/lib/api/proposals';
import { renderWithClient } from '@/test/render';

vi.mock('@/lib/api/proposals', () => ({
  getProposal: vi.fn(), consentProposal: vi.fn(), rejectProposal: vi.fn(),
}));

const pending = {
  id: 'p1', eventId: 'e1', version: 7, status: 'pending', endReason: null,
  cycleSize: 2, participants: [], myResponse: 'pending', canConsent: true,
  canReject: true, canCancel: false, createdAt: '2026-11-02T00:00:00Z',
  confirmedAt: null, cancelledAt: null, endedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getProposal).mockResolvedValue(pending);
  vi.mocked(consentProposal).mockResolvedValue(pending);
  vi.mocked(rejectProposal).mockResolvedValue(pending);
});

describe('proposal detail', () => {
  it.each([
    ['Consent', consentProposal],
    ['Reject', rejectProposal],
  ])('sends the displayed version when confirming %s', async (label, action) => {
    const user = userEvent.setup();
    renderWithClient(<ProposalDetail eventId="e1" proposalId="p1" eventStatus="active" />);
    await user.click(await screen.findByRole('button', { name: label }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: label }));
    await waitFor(() => expect(action).toHaveBeenCalledWith('e1', 'p1', 7));
  });

  it('shows a conflict notice and reloads after acknowledgment', async () => {
    const user = userEvent.setup();
    vi.mocked(consentProposal).mockRejectedValue(new ApiError(409, 'PROPOSAL_VERSION_MISMATCH', 'Changed', {
      currentStatus: 'invalidated', latestProposalId: null,
    }));
    renderWithClient(<ProposalDetail eventId="e1" proposalId="p1" eventStatus="active" />);
    await user.click(await screen.findByRole('button', { name: 'Consent' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Consent' }));
    expect(await screen.findByText(/the proposal has changed/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reload/i }));
    await waitFor(() => expect(getProposal).toHaveBeenCalledTimes(2));
  });

  it('disables consent for an invalidated proposal', async () => {
    vi.mocked(getProposal).mockResolvedValue({ ...pending, status: 'invalidated', canConsent: false });
    renderWithClient(<ProposalDetail eventId="e1" proposalId="p1" eventStatus="active" />);
    expect(await screen.findByRole('button', { name: 'Consent' })).toBeDisabled();
  });

  it('disables consent when the event is closed', async () => {
    renderWithClient(<ProposalDetail eventId="e1" proposalId="p1" eventStatus="closed" />);
    expect(await screen.findByRole('button', { name: 'Consent' })).toBeDisabled();
  });

  it('disables consent and shows a notice when a refreshed proposal has another version', async () => {
    const { queryClient } = renderWithClient(<ProposalDetail eventId="e1" proposalId="p1" eventStatus="active" />);
    expect(await screen.findByRole('button', { name: 'Consent' })).toBeEnabled();
    vi.mocked(getProposal).mockResolvedValue({ ...pending, version: 8 });
    await queryClient.refetchQueries();
    expect(await screen.findByText(/the proposal has changed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consent' })).toBeDisabled();
  });
});
