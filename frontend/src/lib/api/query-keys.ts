export const queryKeys = {
  event: (eventId: string) => ['events', eventId] as const,
};

export const mutationKeys = {
  closeEvent: (eventId: string) => ['events', eventId, 'close'] as const,
};
