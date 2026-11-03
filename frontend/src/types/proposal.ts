import type { IntentClothingSummary } from '@/types/intent';

export type ProposalStatus = 'pending' | 'confirmed' | 'rejected' | 'invalidated' | 'cancelled';

export type ProposalResponse = 'pending' | 'consented' | 'rejected';

export type ProposalParticipant = {
  participant: {
    participantId: string;
    displayName: string;
    isOrganizer: boolean;
  };
  isMe: boolean;
  offeredClothing: IntentClothingSummary;
  receivedClothing: IntentClothingSummary;
  response: ProposalResponse | (string & {});
  respondedAt: string | null;
};

export type Proposal = {
  id: string;
  eventId: string;
  version: number;
  status: ProposalStatus | (string & {});
  endReason: string | null;
  cycleSize: number;
  participants: ProposalParticipant[];
  myResponse: ProposalResponse | (string & {});
  canConsent: boolean;
  canReject: boolean;
  canCancel: boolean;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  endedAt: string | null;
};

export type ProposalList = {
  items: Proposal[];
  nextCursor: null;
};

export type ProposalConflict = {
  currentStatus: string;
  latestProposalId: string | null;
};
