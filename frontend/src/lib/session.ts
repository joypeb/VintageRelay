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
  savedAt: z.number().optional(),
});

export type EventShare = z.infer<typeof shareSchema>;
export type EventSessionRecord = z.infer<typeof eventSessionSchema>;

const PROBE_KEY = 'vr:probe';
const PREFIX = 'vr:event:';

function keyFor(eventId: string): string {
  return `${PREFIX}${eventId}`;
}

export function saveEventSession(eventId: string, record: EventSessionRecord): void {
  localStorage.setItem(keyFor(eventId), JSON.stringify({ ...record, savedAt: Date.now() }));
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

export function listAllEventSessions(): Array<{ eventId: string; record: EventSessionRecord }> {
  const items: Array<{ eventId: string; record: EventSessionRecord }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null || !key.startsWith(PREFIX)) continue;
    const eventId = key.slice(PREFIX.length);
    const record = getEventSession(eventId);
    if (record !== null) items.push({ eventId, record });
  }
  items.sort((a, b) => (b.record.savedAt ?? -Infinity) - (a.record.savedAt ?? -Infinity));
  return items;
}

export function removeEventSession(eventId: string): void {
  localStorage.removeItem(keyFor(eventId));
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
