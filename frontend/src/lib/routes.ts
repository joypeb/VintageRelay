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
  myItemDetail: (eventId: string, clothingId: string) =>
    `/events/${encodeURIComponent(eventId)}/my-items/${encodeURIComponent(clothingId)}`,
  myItemEdit: (eventId: string, clothingId: string) =>
    `/events/${encodeURIComponent(eventId)}/my-items/${encodeURIComponent(clothingId)}/edit`,
  itemDetail: (eventId: string, clothingId: string, from?: string) =>
    from === undefined || from === ''
      ? `/events/${encodeURIComponent(eventId)}/items/${encodeURIComponent(clothingId)}`
      : `/events/${encodeURIComponent(eventId)}/items/${encodeURIComponent(clothingId)}?from=${encodeURIComponent(from)}`,
} as const;
