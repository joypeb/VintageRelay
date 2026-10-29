import { z } from 'zod';

import { ApiError } from '@/lib/api/api-error';
import type { Event } from '@/types/event';

const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Please try again.';

const count = z.number().int().nonnegative();

const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

const eventMeSchema = z.object({
  participantId: z.string(),
  displayName: z.string(),
  isOrganizer: z.boolean(),
});

const eventStatsSchema = z.object({
  participantCount: count,
  availableClothingCount: count,
  confirmedExchangeCount: count,
});

export const eventSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['active', 'closed']),
    entryCode: z.string(),
    entryUrl: z.string(),
    organizerParticipantId: z.string(),
    createdAt: timestamp,
    closedAt: timestamp.nullable(),
    me: eventMeSchema,
    stats: eventStatsSchema.nullable(),
  })
  .superRefine((event, ctx) => {
    if (event.status === 'closed' && event.closedAt === null) {
      ctx.addIssue({ code: 'custom', path: ['closedAt'], message: 'closedAt is required' });
    }
    if (event.me.participantId === event.organizerParticipantId && event.stats === null) {
      ctx.addIssue({ code: 'custom', path: ['stats'], message: 'stats is required' });
    }
  });

/** Validates a read/create event response body; the payload is never logged. */
export function parseEvent(data: unknown): Event {
  const result = eventSchema.safeParse(data);
  if (!result.success) throw new ApiError(200, 'UNKNOWN_ERROR', UNKNOWN_ERROR_MESSAGE);
  return result.data;
}
