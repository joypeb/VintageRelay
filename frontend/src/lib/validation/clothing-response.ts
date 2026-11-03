import { z } from 'zod';

import { ApiError } from '@/lib/api/api-error';
import type { Clothing, ClothingList } from '@/types/clothing';

const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Please try again.';

const clothingSchema = z.object({
  id: z.string().min(1),
});

export type RegisteredClothing = z.infer<typeof clothingSchema>;

/** Validates a register-clothing response body; only the id is used. */
export function parseClothing(data: unknown): RegisteredClothing {
  const result = clothingSchema.safeParse(data);
  if (!result.success) {
    throw new ApiError(200, 'UNKNOWN_ERROR', UNKNOWN_ERROR_MESSAGE);
  }
  return result.data;
}

const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

const measurementValue = z.number().positive().max(120).nullable();

const measurementsSchema = z.object({
  totalLength: measurementValue,
  chest: measurementValue,
  shoulder: measurementValue,
  sleeve: measurementValue,
  waist: measurementValue,
  hem: measurementValue,
  inseam: measurementValue,
  thigh: measurementValue,
});

export const clothingColorSchema = z.enum([
  'black',
  'white',
  'gray',
  'beige',
  'brown',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'navy',
  'purple',
  'pink',
  'multicolor',
]);

const analysisFeaturesSchema = z.object({
  colors: z.array(clothingColorSchema).max(3),
  pattern: z.enum(['solid', 'striped', 'checked', 'floral', 'graphic', 'other']).nullable(),
  materialEstimate: z.string().min(1).nullable(),
  styleTags: z.array(z.string().min(1)).max(8),
  visibleDetails: z.array(z.string().min(1)).max(8),
  sizeLabel: z.string().min(1).nullable(),
});

const analysisSchema = z.object({
  contentVersion: z.number().int().nonnegative(),
  status: z.enum(['pending', 'done', 'failed', 'stale']),
  features: analysisFeaturesSchema.nullable(),
  uncertainties: z.array(
    z.object({
      aspect: z.enum(['condition', 'size', 'fit', 'material', 'logo', 'color', 'other']),
      message: z.string().min(1).max(200),
    }),
  ),
  modelInfo: z
    .object({
      modelId: z.string().min(1),
      latencyMs: z.number().nonnegative().nullish(),
      promptTokens: z.number().int().nonnegative().nullish(),
      completionTokens: z.number().int().nonnegative().nullish(),
    })
    .nullable(),
  updatedAt: timestamp,
});

export const clothingCategorySchema = z.enum(['top', 'outer', 'bottom', 'other']);

export const clothingItemSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  owner: z.object({
    participantId: z.string().min(1),
    displayName: z.string(),
    isOrganizer: z.boolean(),
  }),
  isMine: z.boolean(),
  photos: z
    .array(
      z.object({
        id: z.string().min(1),
        url: z.string().min(1),
      }),
    )
    .min(1),
  category: clothingCategorySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  measurements: measurementsSchema.nullable(),
  status: z.enum(['available', 'confirmed', 'withdrawn']),
  contentVersion: z.number().int().nonnegative(),
  // Strict: unknown vocab, over-cap arrays, and malformed shapes reject as UNKNOWN_ERROR.
  analysis: analysisSchema.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

/** Validates a clothing detail response body; the payload is never logged. */
export function parseClothingItem(data: unknown): Clothing {
  const result = clothingItemSchema.safeParse(data);
  if (!result.success) throw new ApiError(200, 'UNKNOWN_ERROR', UNKNOWN_ERROR_MESSAGE);
  return result.data;
}

const clothingListSchema = z.object({
  items: z.array(clothingItemSchema),
  nextCursor: z.null(),
});

/** Validates a clothing list response body; the payload is never logged. */
export function parseClothingList(data: unknown): ClothingList {
  const result = clothingListSchema.safeParse(data);
  if (!result.success) throw new ApiError(200, 'UNKNOWN_ERROR', UNKNOWN_ERROR_MESSAGE);
  return result.data;
}
