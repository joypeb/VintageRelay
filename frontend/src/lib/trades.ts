import type { Intent, IntentClothingSummary } from '@/types/intent';
import type { Proposal, ProposalParticipant } from '@/types/proposal';

type ProposalLike = {
  id: string;
  status: string;
  myResponse: string;
  cycleSize: number;
  createdAt: string;
};

export type GroupedProposals<T extends ProposalLike> = {
  awaitingMyConsent: T[];
  waitingForOthers: T[];
  confirmed: T[];
  history: T[];
};

function isLiveStatus(status: string): boolean {
  return status === 'pending' || status === 'confirmed';
}

function byNewest<T extends ProposalLike>(a: T, b: T): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

export function groupProposals<T extends ProposalLike>(proposals: readonly T[]): GroupedProposals<T> {
  const awaitingMyConsent: T[] = [];
  const waitingForOthers: T[] = [];
  const confirmed: T[] = [];
  const history: T[] = [];
  for (const proposal of proposals) {
    if (proposal.status === 'pending' && proposal.myResponse === 'pending') {
      awaitingMyConsent.push(proposal);
    } else if (proposal.status === 'pending' && proposal.myResponse === 'consented') {
      waitingForOthers.push(proposal);
    } else if (proposal.status === 'confirmed') {
      confirmed.push(proposal);
    } else {
      history.push(proposal);
    }
  }
  awaitingMyConsent.sort(byNewest);
  waitingForOthers.sort(byNewest);
  confirmed.sort(byNewest);
  history.sort(byNewest);
  return { awaitingMyConsent, waitingForOthers, confirmed, history };
}

export function countTradesBadge(
  received: readonly Intent[],
  proposals: readonly Proposal[],
  closed: boolean,
): number {
  if (closed) return 0;
  const awaitingRequests = received.filter((intent) =>
    isReceivedActionable(intent, proposals, closed),
  ).length;
  const awaitingProposals = proposals.filter(
    (proposal) => proposal.status === 'pending' && proposal.myResponse === 'pending',
  ).length;
  return awaitingRequests + awaitingProposals;
}

export function isLiveLeg(intent: Intent, proposals: readonly Proposal[]): boolean {
  return proposals.some(
    (proposal) =>
      isLiveStatus(proposal.status) &&
      proposal.participants.some(
        (participant) =>
          participant.participant.participantId === intent.participantId &&
          participant.offeredClothing.id === intent.offeredClothing.id &&
          participant.receivedClothing.id === intent.wantedClothing.id,
      ),
  );
}

export function isReceivedActionable(
  intent: Intent,
  proposals: readonly Proposal[],
  closed: boolean,
): boolean {
  return (
    intent.status === 'active' &&
    !closed &&
    !isLiveLeg(intent, proposals) &&
    intent.offeredClothing.status === 'available' &&
    intent.wantedClothing.status === 'available'
  );
}

export function isSentActionable(intent: Intent, closed: boolean): boolean {
  return intent.status === 'active' && !closed;
}

export function intentStatusLabel(
  intent: Intent,
  proposals: readonly Proposal[],
  viewerId?: string,
): string {
  if (intent.status === 'declined') return 'Declined';
  if (intent.status === 'withdrawn') return 'Withdrawn';
  if (intent.status === 'invalidated') return 'Item withdrawn';
  if (isLiveLeg(
    intent,
    proposals.filter((proposal) => proposal.status === 'confirmed'),
  )) {
    return 'In your confirmed exchange';
  }
  if (
    intent.offeredClothing.status === 'confirmed' ||
    intent.wantedClothing.status === 'confirmed'
  ) {
    return 'Item already exchanged';
  }
  if (isLiveLeg(intent, proposals)) {
    return intent.acceptedProposalId !== null ? 'Accepted' : 'In a proposal';
  }
  if (intent.participantId === viewerId) {
    return `Waiting for ${intent.wantedClothing.owner.displayName} to answer`;
  }
  return 'Your answer needed';
}

export type RequestStageItem = {
  intent: Intent;
  direction: 'sent' | 'received';
  nextActor: 'owner' | 'me';
};

export function requestStageItems(
  sent: readonly Intent[],
  received: readonly Intent[],
  proposals: readonly Proposal[],
): RequestStageItem[] {
  const items: RequestStageItem[] = [];
  for (const intent of sent) {
    if (isRequestStageEligible(intent, proposals)) {
      items.push({ intent, direction: 'sent', nextActor: 'owner' });
    }
  }
  for (const intent of received) {
    if (isRequestStageEligible(intent, proposals)) {
      items.push({ intent, direction: 'received', nextActor: 'me' });
    }
  }
  items.sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === 'received' ? -1 : 1;
    return Date.parse(b.intent.createdAt) - Date.parse(a.intent.createdAt);
  });
  return items;
}

function isRequestStageEligible(intent: Intent, proposals: readonly Proposal[]): boolean {
  return (
    intent.status === 'active' &&
    intent.offeredClothing.status === 'available' &&
    intent.wantedClothing.status === 'available' &&
    !isLiveLeg(intent, proposals)
  );
}

export function pendingParticipantNames(proposal: Proposal): string[] {
  return proposal.participants
    .filter((participant) => !participant.isMe && participant.response === 'pending')
    .map((participant) => participant.participant.displayName);
}

export function proposalStatusLabel(
  proposal: Pick<Proposal, 'status' | 'endReason' | 'endDetail'>,
): string {
  if (proposal.status === 'pending') return 'Waiting for consent';
  if (proposal.status === 'confirmed') return 'Confirmed';
  if (proposal.status === 'rejected') return 'Rejected';
  if (proposal.status === 'cancelled') return 'Cancelled';
  if (proposal.status === 'invalidated') {
    if (proposal.endReason === 'intent_changed') {
      if (proposal.endDetail === 'intent_declined') return 'Declined';
      if (proposal.endDetail === 'intent_withdrawn') return 'Request withdrawn';
      return 'Request ended';
    }
    if (proposal.endReason === 'clothing_changed') return 'Item changed';
    if (proposal.endReason === 'clothing_withdrawn') return 'Item withdrawn';
    if (proposal.endReason === 'clothing_confirmed_elsewhere') return 'Item exchanged elsewhere';
    if (proposal.endReason === 'event_closed') return 'Event closed';
    return 'Ended';
  }
  return 'Ended';
}

export function proposalRowLabel(proposal: Proposal): string {
  const me = proposal.participants.find((participant) => participant.isMe) ?? proposal.participants[0];
  const base = `You give ${me?.offeredClothing.title} · get ${me?.receivedClothing.title}`;
  return proposal.cycleSize === 3 ? `${base} · 3-person swap` : base;
}

export function proposalRowDescription(proposal: Proposal): string {
  if (proposal.status === 'pending') {
    if (proposal.myResponse === 'pending') return 'Your consent needed';
    const names = pendingParticipantNames(proposal);
    return names.length > 0 ? `Waiting for ${names.join(', ')}` : 'Waiting for consent';
  }
  return proposalStatusLabel(proposal);
}

export function responseLabel(response: string): string {
  if (response === 'pending') return 'Waiting';
  if (response === 'consented') return 'Consented';
  if (response === 'rejected') return 'Rejected';
  return 'Ended';
}

export type HandoverRow = {
  name: string;
  isMe: boolean;
  gives: IntentClothingSummary;
  givesTo: string;
  receives: IntentClothingSummary;
  receivesFrom: string;
};

export function toHandoverRows(participants: readonly ProposalParticipant[]): HandoverRow[] {
  return participants.map((participant) => ({
    name: participant.participant.displayName,
    isMe: participant.isMe,
    gives: participant.offeredClothing,
    givesTo:
      participants.find((other) => other.receivedClothing.id === participant.offeredClothing.id)
        ?.participant.displayName ?? '',
    receives: participant.receivedClothing,
    receivesFrom:
      participants.find((other) => other.offeredClothing.id === participant.receivedClothing.id)
        ?.participant.displayName ?? '',
  }));
}
