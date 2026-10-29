export const queryKeys = {
  event: (eventId: string) => ['events', eventId] as const,
};
