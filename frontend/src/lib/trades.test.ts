import { describe, expect, it } from 'vitest';

import { countTradesBadge, groupProposals } from '@/lib/trades';

const proposal = (id: string, status: string, myResponse: string, cycleSize: number, createdAt: string) =>
  ({ id, status, myResponse, cycleSize, createdAt });
const intent = (status: string, acceptedProposalId: string | null) => ({ status, acceptedProposalId });

describe('trade lists', () => {
  it('groups proposals by state and sorts each group newest first', () => {
    const awaitingOld = proposal('await-old', 'pending', 'pending', 2, '2026-11-01T00:00:00Z');
    const awaitingNew = proposal('await-new', 'pending', 'pending', 2, '2026-11-03T00:00:00Z');
    const found = proposal('found', 'pending', 'consented', 3, '2026-11-02T00:00:00Z');
    const confirmed = proposal('confirmed', 'confirmed', 'consented', 2, '2026-11-02T00:00:00Z');
    const rejected = proposal('rejected', 'rejected', 'rejected', 2, '2026-11-01T00:00:00Z');
    const invalidated = proposal('invalidated', 'invalidated', 'pending', 3, '2026-11-03T00:00:00Z');
    const cancelled = proposal('cancelled', 'cancelled', 'consented', 2, '2026-11-02T00:00:00Z');
    expect(groupProposals([awaitingOld, rejected, found, cancelled, awaitingNew, confirmed, invalidated])).toEqual({
      awaitingMyConsent: [awaitingNew, awaitingOld], threePersonFound: [found],
      confirmed: [confirmed], history: [invalidated, cancelled, rejected],
    });
  });

  it('only groups consented three-person proposals as found', () => {
    const twoPerson = proposal('two', 'pending', 'consented', 2, '2026-11-02T00:00:00Z');
    const threePerson = proposal('three', 'pending', 'consented', 3, '2026-11-02T00:00:00Z');

    expect(groupProposals([twoPerson, threePerson])).toEqual({
      awaitingMyConsent: [], threePersonFound: [threePerson], confirmed: [], history: [twoPerson],
    });
  });

  it('counts only active unaccepted received requests and proposals awaiting my response', () => {
    expect(countTradesBadge(
      [intent('active', null), intent('active', 'p1'), intent('declined', null), intent('withdrawn', null)],
      [proposal('p1', 'pending', 'pending', 2, ''), proposal('p2', 'pending', 'consented', 3, ''), proposal('p3', 'confirmed', 'pending', 2, '')],
    )).toBe(2);
  });
});
