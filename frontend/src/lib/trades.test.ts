import { describe, expect, it } from 'vitest';

import { countTradesBadge, groupProposals, toHandoverRows, isLiveLeg, isReceivedActionable, isSentActionable, intentStatusLabel, requestStageItems, pendingParticipantNames, proposalStatusLabel, responseLabel } from '@/lib/trades';
import type { Intent } from '@/types/intent';
import type { Proposal, ProposalParticipant } from '@/types/proposal';


const proposal = (id: string, status: string, myResponse: string, cycleSize: number, createdAt: string) =>
  ({ id, status, myResponse, cycleSize, createdAt });

describe('trade lists', () => {
  it('groups proposals by state and sorts each group newest first', () => {
    const awaitingOld = proposal('await-old', 'pending', 'pending', 2, '2026-11-01T00:00:00Z');
    const awaitingNew = proposal('await-new', 'pending', 'pending', 2, '2026-11-03T00:00:00Z');
    const found = proposal('found', 'pending', 'consented', 3, '2026-11-02T00:00:00Z');
    const confirmed = proposal('confirmed', 'confirmed', 'consented', 2, '2026-11-02T00:00:00Z');
    const rejected = proposal('rejected', 'rejected', 'rejected', 2, '2026-11-01T00:00:00Z');
    const invalidated = proposal('invalidated', 'invalidated', 'pending', 3, '2026-11-03T00:00:00Z');
    const unknown = proposal('unknown', 'unknown', 'pending', 2, '2026-10-31T00:00:00Z');
    const cancelled = proposal('cancelled', 'cancelled', 'consented', 2, '2026-11-02T00:00:00Z');
    expect(groupProposals([awaitingOld, rejected, found, cancelled, awaitingNew, confirmed, invalidated, unknown])).toEqual({
      awaitingMyConsent: [awaitingNew, awaitingOld], waitingForOthers: [found],
      confirmed: [confirmed], history: [invalidated, cancelled, rejected, unknown],
    });
  });

  it('groups consented proposals of any size as waiting for others', () => {
    const twoPerson = proposal('two', 'pending', 'consented', 2, '2026-11-02T00:00:00Z');
    const threePerson = proposal('three', 'pending', 'consented', 3, '2026-11-02T00:00:00Z');

    expect(groupProposals([twoPerson, threePerson])).toEqual({
      awaitingMyConsent: [], waitingForOthers: [twoPerson, threePerson], confirmed: [], history: [],
    });
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

const owner = (id: string) => ({ participantId: id, displayName: id, isOrganizer: false });
const clothing = (id: string, status: 'available' | 'confirmed' | 'withdrawn' = 'available') => ({ id, owner: owner(id), photoUrl: '', category: 'top' as const, title: id, description: '', status, contentVersion: 1 });
const request = (id: string, overrides: Partial<Intent> = {}): Intent => ({ id, eventId: 'e1', participantId: 'a', offeredClothing: clothing('a'), wantedClothing: clothing('b'), status: 'active' as const, acceptedProposalId: null, createdAt: `2026-11-0${id}T00:00:00Z`, updatedAt: '', ...overrides });
const leg = (participantId: string, offered: string, received: string, response = 'pending', isMe = false): ProposalParticipant => ({ participant: owner(participantId), isMe, offeredClothing: clothing(offered), receivedClothing: clothing(received), response, respondedAt: null });
const exchange = (status: string, participants = [leg('a', 'a', 'b')]): Proposal & { endDetail: 'intent_declined' | 'intent_withdrawn' | 'intent_invalidated' | null } => ({ id: 'p1', eventId: 'e1', version: 1, status, endReason: null, endDetail: null, cycleSize: participants.length, participants, myResponse: 'pending', canConsent: true, canReject: true, canCancel: false, createdAt: '', confirmedAt: null, cancelledAt: null, endedAt: null });

describe('trades badge', () => {
  it('counts actionable requests and proposals awaiting my consent', () => {
    const awaiting = { ...exchange('pending', []), myResponse: 'pending' };
    const consented = { ...exchange('pending', []), myResponse: 'consented' };
    expect(countTradesBadge([request('1'), request('2', { status: 'declined' })], [awaiting, consented, exchange('confirmed', [])], false)).toBe(2);
  });

  it.each(['offeredClothing', 'wantedClothing'] as const)('does not count a request with confirmed %s', (field) => {
    expect(countTradesBadge([request('1', { [field]: clothing('a', 'confirmed') })], [], false)).toBe(0);
  });

  it.each(['rejected', 'invalidated', 'cancelled'])('counts an accepted request again when its proposal is %s', (status) => {
    expect(countTradesBadge([request('1', { acceptedProposalId: 'p1' })], [exchange(status)], false)).toBe(1);
  });

  it.each(['pending', 'confirmed'])('does not count a request that is a live %s leg', (status) => {
    const live = { ...exchange(status), myResponse: 'consented' };
    expect(countTradesBadge([request('1')], [live], false)).toBe(0);
  });

  it('does not count requests after closure but still counts proposals awaiting consent', () => {
    expect(countTradesBadge([request('1')], [{ ...exchange('pending', []), myResponse: 'pending' }], true)).toBe(1);
  });
});

describe('request state', () => {
  const active = request('1');
  it('matches all three leg fields only in pending or confirmed proposals', () => {
    for (const status of ['pending', 'confirmed']) expect(isLiveLeg(active, [exchange(status)])).toBe(true);
    for (const status of ['rejected', 'invalidated', 'cancelled']) expect(isLiveLeg(active, [exchange(status)])).toBe(false);
    for (const participant of [leg('other', 'a', 'b'), leg('a', 'other', 'b'), leg('a', 'a', 'other')]) expect(isLiveLeg(active, [exchange('pending', [participant])])).toBe(false);
  });
  it('permits received actions only on available requests outside live proposals', () => {
    expect(isReceivedActionable(active, [], false)).toBe(true);
    expect(isReceivedActionable(active, [], true)).toBe(false);
    expect(isReceivedActionable(active, [exchange('pending')], false)).toBe(false);
    for (const status of ['declined', 'withdrawn', 'invalidated'] as const) expect(isReceivedActionable(request('1', { status }), [], false)).toBe(false);
    for (const key of ['offeredClothing', 'wantedClothing']) expect(isReceivedActionable(request('1', { [key]: clothing('a', 'confirmed') }), [], false)).toBe(false);
    for (const status of ['rejected', 'invalidated', 'cancelled']) expect(isReceivedActionable(request('1', { acceptedProposalId: 'p1' }), [exchange(status)], false)).toBe(true);
  });
  it('allows withdrawal of active sent requests even when a garment is confirmed', () => {
    expect(isSentActionable(request('1', { offeredClothing: clothing('a', 'confirmed') }), false)).toBe(true);
    expect(isSentActionable(active, true)).toBe(false);
    expect(isSentActionable(request('1', { status: 'withdrawn' }), false)).toBe(false);
  });
  it('labels requests using current garments and live legs', () => {
    expect(intentStatusLabel(active, [])).toBe('Waiting');
    expect(intentStatusLabel(request('1', { acceptedProposalId: 'p1' }), [exchange('pending')])).toBe('Accepted');
    expect(intentStatusLabel(active, [exchange('pending')])).toBe('In a proposal');
    expect(intentStatusLabel(request('1', { acceptedProposalId: 'p1', wantedClothing: clothing('b', 'confirmed') }), [exchange('confirmed')])).toBe('Item already exchanged');
    for (const [status, label] of [['declined', 'Declined'], ['withdrawn', 'Withdrawn'], ['invalidated', 'Item withdrawn']] as const) expect(intentStatusLabel(request('1', { status }), [])).toBe(label);
  });
  it('shows eligible requests newest first and excludes both directions of live cycles', () => {
    const cycle = exchange('pending', [leg('a', 'a', 'b'), leg('b', 'b', 'c'), leg('c', 'c', 'a')]);
    const reverse = request('2', { participantId: 'b', offeredClothing: clothing('b'), wantedClothing: clothing('c') });
    const lastLeg = request('3', { participantId: 'c', offeredClothing: clothing('c'), wantedClothing: clothing('a') });
    const ended = request('4', { participantId: 'd', offeredClothing: clothing('d'), acceptedProposalId: 'ended' });
    const received = request('5', { participantId: 'e', offeredClothing: clothing('e') });
    const excluded = (['declined', 'withdrawn', 'invalidated'] as const).map((status) => request('1', { status }));
    const confirmed = request('1', { wantedClothing: clothing('b', 'confirmed') });
    expect(requestStageItems([active, reverse, lastLeg, ended, ...excluded, confirmed], [received], [cycle, exchange('rejected', [leg('d', 'd', 'b')])])).toEqual([
      { intent: received, direction: 'received', nextActor: 'me' }, { intent: ended, direction: 'sent', nextActor: 'owner' },
    ]);
    const swap = exchange('confirmed', [leg('a', 'a', 'b'), leg('b', 'b', 'a')]);
    expect(requestStageItems([active], [request('2', { participantId: 'b', offeredClothing: clothing('b'), wantedClothing: clothing('a') })], [swap])).toEqual([]);
  });
  it('names only other participants whose response is pending', () => {
    expect(pendingParticipantNames(exchange('pending', [leg('a', 'a', 'b', 'pending', true), leg('b', 'b', 'a'), leg('c', 'c', 'a', 'consented')]))).toEqual(['b']);
  });
});

describe('plain proposal labels', () => {
  it.each([
    ['pending', null, null, 'Waiting for consent'], ['confirmed', null, null, 'Confirmed'], ['rejected', 'participant_rejected', null, 'Rejected'],
    ['invalidated', 'intent_changed', 'intent_declined', 'Declined'], ['invalidated', 'intent_changed', 'intent_withdrawn', 'Request withdrawn'],
    ['invalidated', 'intent_changed', 'intent_invalidated', 'Request ended'], ['invalidated', 'intent_changed', null, 'Request ended'],
    ['invalidated', 'clothing_changed', null, 'Item changed'], ['invalidated', 'clothing_withdrawn', null, 'Item withdrawn'],
    ['invalidated', 'clothing_confirmed_elsewhere', null, 'Item exchanged elsewhere'], ['invalidated', 'event_closed', null, 'Event closed'],
    ['cancelled', null, null, 'Cancelled'], ['unknown', null, null, 'Ended'], ['invalidated', 'unknown', null, 'Ended'],
  ] as const)('labels %s / %s / %s', (status, endReason, endDetail, label) => {
    expect(proposalStatusLabel({ ...exchange(status), endReason, endDetail })).toBe(label);
  });
  it.each([['pending', 'Waiting'], ['consented', 'Consented'], ['rejected', 'Rejected']])('labels response %s', (response, label) => {
    expect(responseLabel(response)).toBe(label);
  });
});
