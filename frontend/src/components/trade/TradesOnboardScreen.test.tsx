import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TradesOnboardScreen } from '@/components/trade/TradesOnboardScreen';
import { renderWithClient } from '@/test/render';

const { useIntentsQuery, useProposalsQuery } = vi.hoisted(() => ({ useIntentsQuery: vi.fn(), useProposalsQuery: vi.fn() }));
vi.mock('@/lib/session', () => ({ hasEventSession: () => true }));
vi.mock('@/lib/api/events', () => ({ useEventQuery: () => ({ data: { status: 'active', me: { participantId: 'b' } }, isPending: false }) }));
vi.mock('@/lib/api/intents', () => ({
  useIntentsQuery, useAcceptIntentMutation: () => ({}), useDeclineIntentMutation: () => ({}), useWithdrawIntentMutation: () => ({}),
}));
vi.mock('@/lib/api/proposals', () => ({ useProposalsQuery }));

const owner = { participantId: 'a', displayName: 'Alex', isOrganizer: false };
const item = (id: string) => ({ id, owner, photoUrl: '', category: 'top', title: id, description: '', status: 'available', contentVersion: 1 });
const request = { id: 'i1', participantId: 'a', offeredClothing: item('Jacket'), wantedClothing: item('Shirt'), status: 'active', acceptedProposalId: 'p1' };
const proposal = { id: 'p1', status: 'pending', participants: [{ participant: owner, offeredClothing: item('Jacket'), receivedClothing: item('Shirt') }] };

describe('received requests', () => {
  it.each([[true], [false]])('only shows actions for unanswered requests (accepted: %s)', (accepted) => {
    useIntentsQuery.mockReturnValue({ data: { items: [{ ...request, acceptedProposalId: accepted ? 'p1' : null }] }, isPending: false });
    useProposalsQuery.mockReturnValue({ data: { items: accepted ? [proposal] : [] }, isPending: false });
    renderWithClient(<TradesOnboardScreen eventId="e1" tab="received" />);
    expect(screen.queryByRole('button', { name: 'Accept request for Shirt' }) !== null).toBe(!accepted);
    expect(screen.queryByRole('button', { name: 'Decline request for Shirt' }) !== null).toBe(!accepted);
  });
});


describe.each(['received', 'sent'] as const)('%s requests depend on proposal state', (tab) => {
  it('shows loading without request actions while proposals are pending', () => {
    useIntentsQuery.mockReturnValue({ data: { items: [{ ...request, acceptedProposalId: null }] }, isPending: false });
    useProposalsQuery.mockReturnValue({ isPending: true });
    renderWithClient(<TradesOnboardScreen eventId="e1" tab={tab} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    for (const name of [/Accept/, /Decline/, /Withdraw/]) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });

  it('shows an error and retries the proposals query', async () => {
    const refetch = vi.fn();
    useIntentsQuery.mockReturnValue({ data: { items: [request] }, isPending: false });
    useProposalsQuery.mockReturnValue({ error: new Error('Failed'), isPending: false, refetch });
    renderWithClient(<TradesOnboardScreen eventId="e1" tab={tab} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});


describe('trade row accessibility and summaries', () => {
  it('names received actions with the wanted item', () => {
    useIntentsQuery.mockReturnValue({ data: { items: [{ ...request, acceptedProposalId: null }] }, isPending: false });
    useProposalsQuery.mockReturnValue({ data: { items: [] }, isPending: false });
    renderWithClient(<TradesOnboardScreen eventId="e1" tab="received" />);
    expect(screen.getByRole('button', { name: 'Accept request for Shirt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline request for Shirt' })).toBeInTheDocument();
  });

  it('names the withdrawal action with the wanted item', () => {
    useIntentsQuery.mockReturnValue({ data: { items: [request] }, isPending: false });
    useProposalsQuery.mockReturnValue({ data: { items: [] }, isPending: false });
    renderWithClient(<TradesOnboardScreen eventId="e1" tab="sent" />);
    expect(screen.getByRole('button', { name: 'Withdraw request for Shirt' })).toBeInTheDocument();
  });

  it('shows a garment summary without version or response metadata in proposal rows', () => {
    useIntentsQuery.mockReturnValue({ data: { items: [] }, isPending: false });
    useProposalsQuery.mockReturnValue({ data: { items: [{ ...proposal, version: 1, myResponse: 'pending', cycleSize: 2, createdAt: '2026-11-01', participants: [{ ...proposal.participants[0], isMe: true, response: 'pending' }] }] }, isPending: false });
    renderWithClient(<TradesOnboardScreen eventId="e1" tab="exchanges" />);
    const row = screen.getByRole('link', { name: /You give Jacket · get Shirt/ });
    expect(row).toHaveTextContent('Your consent needed');
    expect(row).not.toHaveTextContent(/Version|Your response/);
  });
});
