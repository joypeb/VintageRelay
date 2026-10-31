import { z } from 'zod';

import { ApiError } from '@/lib/api/api-error';

const clothingSchema = z.object({
  id: z.string().min(1),
});

export type RegisteredClothing = z.infer<typeof clothingSchema>;

/** Validates a register-clothing response body; only the id is used. */
export function parseClothing(data: unknown): RegisteredClothing {
  const result = clothingSchema.safeParse(data);
  if (!result.success) {
    throw new ApiError(200, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.');
  }
  return result.data;
}
