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

export type AnalysisStatus = 'pending' | 'done' | 'failed' | 'stale';

export type ClothingColor =
  | 'black'
  | 'white'
  | 'gray'
  | 'beige'
  | 'brown'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'navy'
  | 'purple'
  | 'pink'
  | 'multicolor';

export type ClothingPattern = 'solid' | 'striped' | 'checked' | 'floral' | 'graphic' | 'other';

export type UncertaintyAspect =
  | 'condition'
  | 'size'
  | 'fit'
  | 'material'
  | 'logo'
  | 'color'
  | 'other';

export type ClothingAnalysisFeatures = {
  colors: ClothingColor[];
  pattern: ClothingPattern | null;
  materialEstimate: string | null;
  styleTags: string[];
  visibleDetails: string[];
  sizeLabel: string | null;
};

export type ClothingAnalysisUncertainty = {
  aspect: UncertaintyAspect;
  message: string;
};

export type ClothingAnalysisModelInfo = {
  modelId: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
};

export type ClothingAnalysis = {
  contentVersion: number;
  status: AnalysisStatus;
  features: ClothingAnalysisFeatures | null;
  uncertainties: ClothingAnalysisUncertainty[];
  modelInfo: ClothingAnalysisModelInfo | null;
  updatedAt: string;
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
  analysis: ClothingAnalysis | null;
  createdAt: string;
  updatedAt: string;
};

/** `GET /api/v1/events/{event_id}/clothing` response body. */
export type ClothingList = {
  items: Clothing[];
  nextCursor: null;
};
