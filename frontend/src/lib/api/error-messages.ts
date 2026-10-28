import { ApiError } from '@/lib/api/api-error';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

export function getFormErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : GENERIC_MESSAGE;
}
