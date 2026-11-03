import type { Clothing, ClothingCategory, ClothingColor, ClothingMeasurements } from '@/types/clothing';

export type MeasurementRange = {
  min?: number;
  max?: number;
};

export type SearchConditions = {
  category: ClothingCategory | null;
  colors: ClothingColor[];
  measurements: Partial<Record<keyof ClothingMeasurements, MeasurementRange>>;
  unrecognized: string[];
};

export type SearchResultItem = {
  clothing: Clothing;
  matchCount: number;
  missingMeasurements: boolean;
};

export type SearchResults = {
  items: SearchResultItem[];
  conditionCount: number;
  nextCursor: null;
};
