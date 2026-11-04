import type { IntentClothingSummary } from '@/types/intent';
import type { ProposalParticipant } from '@/types/proposal';

type ProposalLike = {
  id: string;
  status: string;
  myResponse: string;
  cycleSize: number;
  createdAt: string;
};

type IntentLike = {
  status: string;
  acceptedProposalId: string | null;
};

export type GroupedProposals<T extends ProposalLike> = {
  awaitingMyConsent: T[];
  threePersonFound: T[];
  confirmed: T[];
  history: T[];
};

function byNewest<T extends ProposalLike>(a: T, b: T): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

export function groupProposals<T extends ProposalLike>(proposals: readonly T[]): GroupedProposals<T> {
  const awaitingMyConsent: T[] = [];
  const threePersonFound: T[] = [];
  const confirmed: T[] = [];
  const history: T[] = [];
  for (const proposal of proposals) {
    if (proposal.status === 'pending' && proposal.myResponse === 'pending') {
      awaitingMyConsent.push(proposal);
    } else if (
      proposal.status === 'pending' &&
      proposal.myResponse === 'consented' &&
      proposal.cycleSize === 3
    ) {
      threePersonFound.push(proposal);
    } else if (proposal.status === 'confirmed') {
      confirmed.push(proposal);
    } else {
      history.push(proposal);
    }
  }
  awaitingMyConsent.sort(byNewest);
  threePersonFound.sort(byNewest);
  confirmed.sort(byNewest);
  history.sort(byNewest);
  return { awaitingMyConsent, threePersonFound, confirmed, history };
}

export function countTradesBadge(
  received: readonly IntentLike[],
  proposals: readonly Pick<ProposalLike, 'status' | 'myResponse'>[],
): number {
  const awaitingRequests = received.filter(
    (intent) => intent.status === 'active' && intent.acceptedProposalId === null,
  ).length;
  const awaitingProposals = proposals.filter(
    (proposal) => proposal.status === 'pending' && proposal.myResponse === 'pending',
  ).length;
  return awaitingRequests + awaitingProposals;
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
