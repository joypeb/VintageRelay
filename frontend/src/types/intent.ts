import type { ClothingCategory, ClothingStatus } from '@/types/clothing';

export type IntentStatus = 'active' | 'withdrawn' | 'declined' | 'invalidated';

export type IntentDirection = 'sent' | 'received';

export type IntentOwner = {
  participantId: string;
  displayName: string;
  isOrganizer: boolean;
};

export type IntentClothingSummary = {
  id: string;
  owner: IntentOwner;
  photoUrl: string;
  category: ClothingCategory;
  title: string;
  description: string;
  status: ClothingStatus;
  contentVersion: number;
};

export type Intent = {
  id: string;
  eventId: string;
  participantId: string;
  offeredClothing: IntentClothingSummary;
  wantedClothing: IntentClothingSummary;
  status: IntentStatus;
  acceptedProposalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntentList = {
  items: Intent[];
  nextCursor: null;
};
