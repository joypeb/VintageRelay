export const queryKeys = {
  event: (eventId: string) => ['events', eventId] as const,
  clothingList: (eventId: string, ownership: string = 'others') =>
    ['events', eventId, 'clothing', 'list', ownership] as const,
  clothing: (eventId: string, clothingId: string) =>
    ['events', eventId, 'clothing', clothingId] as const,
  clothingSearch: (eventId: string, params: string) =>
    ['events', eventId, 'clothing', 'search', params] as const,
  entryCodePreview: (code: string) => ['entry-codes', code] as const,
  entryCodePreviews: () => ['entry-codes'] as const,
  intents: (eventId: string, direction: string = 'sent', params: string = 'active') =>
    ['events', eventId, 'intents', direction, params] as const,
  proposals: (eventId: string, params: string = 'all') =>
    ['events', eventId, 'proposals', 'list', params] as const,
  proposal: (eventId: string, proposalId: string) =>
    ['events', eventId, 'proposals', 'detail', proposalId] as const,
};

export const mutationKeys = {
  closeEvent: (eventId: string) => ['events', eventId, 'close'] as const,
  uploadPhoto: (eventId: string) => ['events', eventId, 'photos', 'upload'] as const,
  registerClothing: (eventId: string) => ['events', eventId, 'clothing', 'register'] as const,
  updateClothing: (eventId: string, clothingId: string) =>
    ['events', eventId, 'clothing', clothingId, 'update'] as const,
  deleteClothing: (eventId: string, clothingId: string) =>
    ['events', eventId, 'clothing', clothingId, 'delete'] as const,
  interpretSearch: (eventId: string) => ['events', eventId, 'search', 'interpretation'] as const,
  registerIntent: (eventId: string) => ['events', eventId, 'intents', 'register'] as const,
  withdrawIntent: (eventId: string, intentId: string) =>
    ['events', eventId, 'intents', intentId, 'withdraw'] as const,
  acceptIntent: (eventId: string, intentId: string) =>
    ['events', eventId, 'intents', intentId, 'accept'] as const,
  declineIntent: (eventId: string, intentId: string) =>
    ['events', eventId, 'intents', intentId, 'decline'] as const,
  consentProposal: (eventId: string, proposalId: string) =>
    ['events', eventId, 'proposals', proposalId, 'consent'] as const,
  rejectProposal: (eventId: string, proposalId: string) =>
    ['events', eventId, 'proposals', proposalId, 'reject'] as const,
  cancelProposal: (eventId: string, proposalId: string) =>
    ['events', eventId, 'proposals', proposalId, 'cancel'] as const,
};
