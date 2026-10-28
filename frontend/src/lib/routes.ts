export const routes = {
  landing: () => '/',
  createEvent: () => '/events/new',
  eventCreated: (eventId: string) => `/events/${encodeURIComponent(eventId)}/created`,
  join: () => '/join',
  eventHome: (eventId: string) => `/events/${encodeURIComponent(eventId)}`,
  newItem: (eventId: string) => `/events/${encodeURIComponent(eventId)}/my-items/new`,
} as const;
