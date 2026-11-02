export type ClothingCategory = 'top' | 'outer' | 'bottom' | 'other';

export type ClothingStatus = 'available' | 'confirmed' | 'withdrawn';

export type ClothingPhoto = {
  id: string;
  url: string;
};

export type ClothingOwner = {
  participantId: string;
  displayName: string;
  isOrganizer: boolean;
};

export type ClothingMeasurements = {
  totalLength: number | null;
  chest: number | null;
  shoulder: number | null;
  sleeve: number | null;
  waist: number | null;
  hem: number | null;
  inseam: number | null;
  thigh: number | null;
};

/** Full `Clothing` as returned by list and detail reads. */
export type Clothing = {
  id: string;
  eventId: string;
  owner: ClothingOwner;
  isMine: boolean;
  photos: ClothingPhoto[];
  category: ClothingCategory;
  title: string;
  description: string;
  measurements: ClothingMeasurements | null;
  status: ClothingStatus;
  contentVersion: number;
  analysis: null;
  createdAt: string;
  updatedAt: string;
};

/** `GET /api/v1/events/{event_id}/clothing` response body. */
export type ClothingList = {
  items: Clothing[];
  nextCursor: null;
};
