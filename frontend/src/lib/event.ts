import { replaceEqualDeep } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';
import { getFormErrorMessage } from '@/lib/api/error-messages';
import { mapJoinServerFieldErrors } from '@/lib/validation/join';
import type { Event } from '@/types/event';

export type EventScreenState =
  | { kind: 'loading' }
  | { kind: 'no-access' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; event: Event };

export function isOrganizer(event: Event): boolean {
  return event.me.participantId === event.organizerParticipantId;
}

export function isClosed(event: Event): boolean {
  return event.status === 'closed';
}

export type CloseEventFailure =
  | { kind: 'forbidden' }
  | { kind: 'no-access' }
  | { kind: 'not-found' }
  | { kind: 'dialog'; message: string };

export function getCloseEventFailure(error: unknown): CloseEventFailure {
  const code = error instanceof ApiError ? error.code : null;
  if (code === 'FORBIDDEN') return { kind: 'forbidden' };
  if (code === 'UNAUTHENTICATED') return { kind: 'no-access' };
  if (code === 'NOT_FOUND') return { kind: 'not-found' };
  return { kind: 'dialog', message: getFormErrorMessage(error) };
}

export type LookupFailure =
  | { kind: 'codeField'; message: string }
  | { kind: 'form'; message: string };

export function getLookupFailure(error: unknown): LookupFailure {
  if (error instanceof ApiError && error.code === 'NOT_FOUND') {
    return { kind: 'codeField', message: error.message };
  }
  return { kind: 'form', message: getFormErrorMessage(error) };
}

export type JoinFailure =
  | { kind: 'displayNameField'; message: string }
  | { kind: 'closed' }
  | { kind: 'codeNotFound'; message: string }
  | ({ kind: 'fields' } & ReturnType<typeof mapJoinServerFieldErrors>)
  | { kind: 'form'; message: string };

export function getJoinFailure(error: unknown): JoinFailure {
  if (error instanceof ApiError) {
    if (error.code === 'DISPLAY_NAME_TAKEN') {
      return { kind: 'displayNameField', message: error.message };
    }
    if (error.code === 'EVENT_CLOSED') return { kind: 'closed' };
    if (error.code === 'NOT_FOUND') {
      return { kind: 'codeNotFound', message: error.message };
    }
    if (error.code === 'VALIDATION_ERROR') {
      return { kind: 'fields', ...mapJoinServerFieldErrors(error.details) };
    }
  }
  return { kind: 'form', message: getFormErrorMessage(error) };
}

export type PhotoUploadFailure =
  | { kind: 'photoField'; message: string }
  | { kind: 'closed' }
  | { kind: 'no-access' }
  | { kind: 'not-found'; message: string }
  | { kind: 'form'; message: string };

export function getPhotoUploadFailure(error: unknown): PhotoUploadFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'FILE_TOO_LARGE':
      case 'UNSUPPORTED_MEDIA_TYPE':
      case 'VALIDATION_ERROR':
      case 'BAD_REQUEST':
        return { kind: 'photoField', message: error.message };
      case 'EVENT_CLOSED':
        return { kind: 'closed' };
      case 'UNAUTHENTICATED':
        return { kind: 'no-access' };
      case 'NOT_FOUND':
        return { kind: 'not-found', message: error.message };
      default:
        break;
    }
  }
  return { kind: 'form', message: getFormErrorMessage(error) };
}

function hasStatus(value: unknown, status: Event['status']): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    value.status === status
  );
}

// TanStack `structuralSharing` function: a closed event is never overwritten
// by a stale active response.
export function keepClosedEvent(prev: unknown, next: unknown): unknown {
  if (hasStatus(prev, 'closed') && hasStatus(next, 'active')) return prev;
  return replaceEqualDeep(prev, next);
}

type EventScreenInput = {
  hasSession: boolean;
  data: Event | undefined;
  error: unknown;
  isPending: boolean;
};

export function getEventScreenState({
  hasSession,
  data,
  error,
}: EventScreenInput): EventScreenState {
  const code = error instanceof ApiError ? error.code : null;
  if (!hasSession || code === 'UNAUTHENTICATED') return { kind: 'no-access' };
  if (code === 'NOT_FOUND') return { kind: 'not-found' };
  if (data) return { kind: 'ready', event: data };
  if (error) return { kind: 'error', message: getFormErrorMessage(error) };
  return { kind: 'loading' };
}
