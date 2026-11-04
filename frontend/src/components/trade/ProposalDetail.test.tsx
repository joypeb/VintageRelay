import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProposalDetail } from '@/components/trade/ProposalDetail';
import { ApiError } from '@/lib/api/api-error';
import { cancelProposal, consentProposal, getProposal, rejectProposal } from '@/lib/api/proposals';
import { routes } from '@/lib/routes';
import { renderWithClient } from '@/test/render';
import type { Proposal } from '@/types/proposal';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/api/proposals', () => ({
  getProposal: vi.fn(), consentProposal: vi.fn(), rejectProposal: vi.fn(), cancelProposal: vi.fn(),
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

const confirmed = {
  ...pending, status: 'confirmed', canConsent: false, canReject: false, canCancel: true,
  confirmedAt: '2026-11-03T00:00:00Z',
};

describe('confirmed exchange', () => {
  it('shows both handover directions and highlights the current participant', async () => {
    const alex = { participantId: 'a', displayName: 'Alex', isOrganizer: false };
    const sam = { participantId: 's', displayName: 'Sam', isOrganizer: false };
    const jacket = { id: 'c1', owner: alex, photoUrl: '', category: 'top' as const, title: 'Jacket', description: '', status: 'confirmed' as const, contentVersion: 1 };
    const shirt = { ...jacket, id: 'c2', owner: sam, title: 'Shirt' };
    const proposal: Proposal = {
      ...confirmed,
      participants: [
        { participant: alex, isMe: true, offeredClothing: jacket, receivedClothing: shirt, response: 'consented', respondedAt: null },
        { participant: sam, isMe: false, offeredClothing: shirt, receivedClothing: jacket, response: 'consented', respondedAt: null },
      ],
    };
    vi.mocked(getProposal).mockResolvedValue(proposal);
    renderWithClient(<ProposalDetail eventId="e1" proposalId="p1" eventStatus="active" />);

    expect(await screen.findByText('Confirmed at 2026-11-03T00:00:00Z')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Alex gives Jacket · top to Sam');
    expect(rows[0]).toHaveTextContent('Receives Shirt · top from Sam');
    expect(rows[1]).toHaveTextContent('Sam gives Shirt · top to Alex');
    expect(rows[1]).toHaveTextContent('Receives Jacket · top from Alex');
    for (const row of rows) {
      expect(within(row).getByRole('link', { name: 'Jacket · top' })).toHaveAttribute('href', routes.itemDetail('e1', 'c1'));
      expect(within(row).getByRole('link', { name: 'Shirt · top' })).toHaveAttribute('href', routes.itemDetail('e1', 'c2'));
    }
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    expect(rows[1]).not.toHaveAttribute('aria-current');
  });

  it('shows the handover notice and lets a participant keep the exchange', async () => {
    const user = userEvent.setup();
    vi.mocked(getProposal).mockResolvedValue(confirmed);
    renderWithClient(<ProposalDetail eventId="e1" proposalId="p1" eventStatus="active" />);
    expect(await screen.findByText('Confirmed. Inspect the garments in person before handing them over.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel exchange' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel this exchange?' });
    expect(dialog).toHaveTextContent('The whole exchange is cancelled for every participant, and all its garments become available again.');
    await user.click(within(dialog).getByRole('button', { name: 'Keep exchange' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(cancelProposal).not.toHaveBeenCalled();
  });

  it('cancels once and returns to trades after confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(getProposal).mockResolvedValue(confirmed);
    vi.mocked(cancelProposal).mockResolvedValue({ ...confirmed, status: 'cancelled', canCancel: false });
    renderWithClient(<ProposalDetail eventId="e1" proposalId="p1" eventStatus="active" />);
    await user.click(await screen.findByRole('button', { name: 'Cancel exchange' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel exchange' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(routes.trades('e1')));
    expect(cancelProposal).toHaveBeenCalledOnce();
    expect(cancelProposal).toHaveBeenCalledWith('e1', 'p1');
  });

  it('does not offer cancellation when the event is closed', async () => {
    vi.mocked(getProposal).mockResolvedValue({ ...confirmed, canCancel: false });
    renderWithClient(<ProposalDetail eventId="e1" proposalId="p1" eventStatus="closed" />);
    expect(await screen.findByText('Confirmed. Inspect the garments in person before handing them over.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel exchange' })).not.toBeInTheDocument();
  });

  it('shows the cancelled banner without the notice or cancel button', async () => {
    vi.mocked(getProposal).mockResolvedValue({ ...confirmed, status: 'cancelled', canCancel: false, cancelledAt: '2026-11-03T01:00:00Z' });
    renderWithClient(<ProposalDetail eventId="e1" proposalId="p1" eventStatus="active" />);
    expect(await screen.findByText('This exchange was cancelled.')).toBeInTheDocument();
    expect(screen.getByText('Cancelled at 2026-11-03T01:00:00Z')).toBeInTheDocument();
    expect(screen.queryByText('Confirmed. Inspect the garments in person before handing them over.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel exchange' })).not.toBeInTheDocument();
  });

  it('closes the dialog, displays the error and refetches when no longer confirmed', async () => {
    const user = userEvent.setup();
    vi.mocked(getProposal).mockResolvedValue(confirmed);
    vi.mocked(cancelProposal).mockRejectedValue(new ApiError(409, 'PROPOSAL_NOT_CONFIRMED', 'Only confirmed exchanges can be cancelled.'));
    renderWithClient(<ProposalDetail eventId="e1" proposalId="p1" eventStatus="active" />);
    await user.click(await screen.findByRole('button', { name: 'Cancel exchange' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel exchange' }));
    expect(await screen.findByText('Only confirmed exchanges can be cancelled.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(getProposal).toHaveBeenCalledTimes(2));
    expect(push).not.toHaveBeenCalled();
  });

  it('invalidates event queries after cancellation fails because the proposal is no longer confirmed', async () => {
    const user = userEvent.setup();
    vi.mocked(getProposal).mockResolvedValue(confirmed);
    vi.mocked(cancelProposal).mockRejectedValue(new ApiError(409, 'PROPOSAL_NOT_CONFIRMED', 'Only confirmed exchanges can be cancelled.'));
    const { queryClient } = renderWithClient(<ProposalDetail eventId="e1" proposalId="p1" eventStatus="active" />);
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    await user.click(await screen.findByRole('button', { name: 'Cancel exchange' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel exchange' }));
    await screen.findByText('Only confirmed exchanges can be cancelled.');
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['events', 'e1'] }));
  });
});
