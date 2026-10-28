/**
 * Error codes from the shared API contract (docs/rules/dev/common/api-contract.md §7).
 *
 * `NETWORK_ERROR` and `UNKNOWN_ERROR` do not come from the server. They are
 * normalization-only codes produced by `apiFetch` / `toApiError` when the
 * response cannot be read or the request never reached the API.
 */
export type ErrorCode =
  // Common error codes.
  | 'VALIDATION_ERROR'
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EVENT_CLOSED'
  | 'PROPOSAL_VERSION_MISMATCH'
  | 'CLOTHING_ALREADY_CONFIRMED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'AI_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  // Feature-specific error codes.
  | 'DISPLAY_NAME_TAKEN'
  | 'PHOTO_ALREADY_ATTACHED'
  | 'CLOTHING_NOT_AVAILABLE'
  | 'INTENT_NOT_ACTIVE'
  | 'ALTERNATIVE_NO_LONGER_VALID'
  | 'PROPOSAL_NOT_CONFIRMED'
  | 'CONTENT_VERSION_MISMATCH'
  | 'ANALYSIS_NOT_READY'
  | 'PREFERENCE_REQUIRED'
  // Normalization-only codes.
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';
