export type EventStatus = 'active' | 'closed';

export type CreateEventRequest = {
  name: string;
  organizerDisplayName: string;
};

export type EventMe = {
  participantId: string;
  displayName: string;
  isOrganizer: boolean;
};

export type EventStats = {
  participantCount: number;
  availableClothingCount: number;
  confirmedExchangeCount: number;
};

export type Event = {
  id: string;
  name: string;
  status: EventStatus;
  entryCode: string;
  entryUrl: string;
  organizerParticipantId: string;
  /** ISO 8601 timestamp with a Z suffix. */
  createdAt: string;
  /** ISO 8601 timestamp, or null while the event is active. */
  closedAt: string | null;
  me: EventMe;
  /** Always present on create; null for non-organizers in read-event. */
  stats: EventStats | null;
};

/** `POST /api/v1/events` response body (201). */
export type EventSession = {
  event: Event;
  participantToken: string;
};
