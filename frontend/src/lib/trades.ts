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

type MirrorIntentLike = {
  acceptedProposalId: string | null;
  offeredClothing: { id: string };
  wantedClothing: { id: string };
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

export function visibleReceivedIntents<T extends MirrorIntentLike>(
  sent: readonly T[],
  received: readonly T[],
): T[] {
  return received.filter(
    (intent) =>
      !sent.some(
        (other) =>
          other.acceptedProposalId != null &&
          other.offeredClothing.id === intent.wantedClothing.id &&
          other.wantedClothing.id === intent.offeredClothing.id,
      ),
  );
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
