export const queryKeys = {
  event: (eventId: string) => ['events', eventId] as const,
  clothingList: (eventId: string, ownership: string = 'others') =>
    ['events', eventId, 'clothing', 'list', ownership] as const,
  clothing: (eventId: string, clothingId: string) =>
    ['events', eventId, 'clothing', clothingId] as const,
  entryCodePreview: (code: string) => ['entry-codes', code] as const,
  entryCodePreviews: () => ['entry-codes'] as const,
};

export const mutationKeys = {
  closeEvent: (eventId: string) => ['events', eventId, 'close'] as const,
  uploadPhoto: (eventId: string) => ['events', eventId, 'photos', 'upload'] as const,
  registerClothing: (eventId: string) => ['events', eventId, 'clothing', 'register'] as const,
  updateClothing: (eventId: string, clothingId: string) =>
    ['events', eventId, 'clothing', clothingId, 'update'] as const,
  deleteClothing: (eventId: string, clothingId: string) =>
    ['events', eventId, 'clothing', clothingId, 'delete'] as const,
};
