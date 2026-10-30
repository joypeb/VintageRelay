import { z } from 'zod';

import { ApiError } from '@/lib/api/api-error';
import type { Photo } from '@/types/photo';

const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Please try again.';

const photoSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().min(1).max(10485760),
  createdAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
});

/** Validates an upload-photo response body; the payload is never logged. */
export function parsePhoto(data: unknown): Photo {
  const result = photoSchema.safeParse(data);
  if (!result.success) throw new ApiError(200, 'UNKNOWN_ERROR', UNKNOWN_ERROR_MESSAGE);
  return result.data;
}
