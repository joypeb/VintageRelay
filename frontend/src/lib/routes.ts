export const routes = {
  landing: () => '/',
  createEvent: () => '/events/new',
  eventCreated: (eventId: string) => `/events/${encodeURIComponent(eventId)}/created`,
  join: () => '/join',
  eventHome: (eventId: string) => `/events/${encodeURIComponent(eventId)}`,
  manageEvent: (eventId: string) => `/events/${encodeURIComponent(eventId)}/manage`,
  newItem: (eventId: string) => `/events/${encodeURIComponent(eventId)}/my-items/new`,
  search: (eventId: string) => `/events/${encodeURIComponent(eventId)}/search`,
  trades: (eventId: string) => `/events/${encodeURIComponent(eventId)}/trades`,
  myItems: (eventId: string) => `/events/${encodeURIComponent(eventId)}/my-items`,
} as const;
