import { z } from 'zod';

import { ApiError } from '@/lib/api/api-error';
import {
  clothingCategorySchema,
  clothingColorSchema,
  clothingItemSchema,
} from '@/lib/validation/clothing-response';
import type { SearchConditions, SearchResults } from '@/types/search';

const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Please try again.';

const measurementRangeSchema = z
  .object({
    min: z.number().positive().max(120).optional(),
    max: z.number().positive().max(120).optional(),
  })
  .refine((range) => range.min !== undefined || range.max !== undefined, {
    message: 'Invalid range',
  })
  .refine(
    (range) => range.min === undefined || range.max === undefined || range.min <= range.max,
    { message: 'Invalid range' },
  );

const searchConditionsSchema = z.object({
  category: clothingCategorySchema.nullable(),
  colors: z.array(clothingColorSchema),
  measurements: z.object({
    totalLength: measurementRangeSchema.optional(),
    chest: measurementRangeSchema.optional(),
    shoulder: measurementRangeSchema.optional(),
    sleeve: measurementRangeSchema.optional(),
    waist: measurementRangeSchema.optional(),
    hem: measurementRangeSchema.optional(),
    inseam: measurementRangeSchema.optional(),
    thigh: measurementRangeSchema.optional(),
  }),
  unrecognized: z.array(z.string().min(1)),
});

/** Validates an interpretation response body; the payload is never logged. */
export function parseSearchConditions(data: unknown): SearchConditions {
  const result = searchConditionsSchema.safeParse(data);
  if (!result.success) throw new ApiError(200, 'UNKNOWN_ERROR', UNKNOWN_ERROR_MESSAGE);
  return result.data;
}

const searchResultsSchema = z.object({
  items: z.array(
    z.object({
      clothing: clothingItemSchema,
      matchCount: z.number().int().nonnegative(),
      missingMeasurements: z.boolean(),
    }),
  ),
  conditionCount: z.number().int().nonnegative(),
  nextCursor: z.null(),
});

/** Validates a ranked search response body; the payload is never logged. */
export function parseSearchResults(data: unknown): SearchResults {
  const result = searchResultsSchema.safeParse(data);
  if (!result.success) throw new ApiError(200, 'UNKNOWN_ERROR', UNKNOWN_ERROR_MESSAGE);
  return result.data;
}
