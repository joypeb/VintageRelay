import { describe, expect, it } from 'vitest';

import { countTradesBadge, groupProposals, toHandoverRows } from '@/lib/trades';

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

describe('handover rows', () => {
  const person = (name: string, isMe: boolean, gives: string, receives: string) => ({
    participant: { participantId: name, displayName: name, isOrganizer: false },
    isMe,
    offeredClothing: { id: gives, owner: { participantId: name, displayName: name, isOrganizer: false }, photoUrl: '', category: 'top' as const, title: gives, description: '', status: 'confirmed' as const, contentVersion: 1 },
    receivedClothing: { id: receives, owner: { participantId: '', displayName: '', isOrganizer: false }, photoUrl: '', category: 'top' as const, title: receives, description: '', status: 'confirmed' as const, contentVersion: 1 },
    response: 'consented' as const,
    respondedAt: null,
  });

  it.each([
    ['two-person', [person('Me', true, 'shirt', 'coat'), person('Jo', false, 'coat', 'shirt')], ['Jo', 'Me'], ['Jo', 'Me']],
    ['three-person', [person('Me', true, 'shirt', 'hat'), person('Jo', false, 'coat', 'shirt'), person('Sam', false, 'hat', 'coat')], ['Jo', 'Sam', 'Me'], ['Sam', 'Me', 'Jo']],
  ])('maps both sides of each %s exchange in server order', (_label, participants, recipients, senders) => {
    expect(toHandoverRows(participants)).toEqual(participants.map((p, i) => ({
      name: p.participant.displayName, isMe: p.isMe,
      gives: p.offeredClothing, givesTo: recipients[i],
      receives: p.receivedClothing, receivesFrom: senders[i],
    })));
  });
});
