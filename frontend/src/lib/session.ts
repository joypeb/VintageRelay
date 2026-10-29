import { z } from 'zod';

const shareSchema = z.object({
  name: z.string(),
  entryCode: z.string(),
  entryUrl: z.string(),
});

const eventSessionSchema = z.object({
  participantToken: z.string().min(1),
  participantId: z.string().min(1),
  share: shareSchema.optional(),
});

export type EventShare = z.infer<typeof shareSchema>;
export type EventSessionRecord = z.infer<typeof eventSessionSchema>;

const PROBE_KEY = 'vr:probe';

function keyFor(eventId: string): string {
  return `vr:event:${eventId}`;
}

export function saveEventSession(eventId: string, record: EventSessionRecord): void {
  localStorage.setItem(keyFor(eventId), JSON.stringify(record));
}

export function getEventSession(eventId: string): EventSessionRecord | null {
  try {
    const raw = localStorage.getItem(keyFor(eventId));
    if (raw === null) return null;
    const parsed = eventSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function hasEventSession(eventId: string): boolean {
  return getEventSession(eventId) !== null;
}

export function getEventShare(eventId: string): EventShare | null {
  return getEventSession(eventId)?.share ?? null;
}

export function getSessionHeaders(eventId: string): Record<string, string> {
  const session = getEventSession(eventId);
  return session ? { Authorization: `Bearer ${session.participantToken}` } : {};
}

export function isStorageAvailable(): boolean {
  try {
    localStorage.setItem(PROBE_KEY, '1');
    localStorage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}
