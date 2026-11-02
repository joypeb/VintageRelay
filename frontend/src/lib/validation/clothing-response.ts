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

const clothingItemSchema = z.object({
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
  category: z.enum(['top', 'outer', 'bottom', 'other']),
  title: z.string().min(1),
  description: z.string().min(1),
  measurements: measurementsSchema.nullable(),
  status: z.enum(['available', 'confirmed', 'withdrawn']),
  contentVersion: z.number().int().nonnegative(),
  // shortcut: strict null until 018 ships analysis; relax to z.unknown().nullable() then
  analysis: z.null(),
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
