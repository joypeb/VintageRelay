import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/api-error';
import { getFormErrorMessage } from '@/lib/api/error-messages';

describe('getFormErrorMessage', () => {
  it.each(['NETWORK_ERROR', 'BAD_REQUEST', 'INTERNAL_ERROR', 'UNKNOWN_ERROR'])(
    'returns the message for %s',
    (code) => {
      expect(getFormErrorMessage(new ApiError(400, code, 'Specific error message.'))).toBe(
        'Specific error message.',
      );
    },
  );

  it.each([new Error('boom'), 'x'])('hides unexpected error details for %s', (error) => {
    expect(getFormErrorMessage(error)).toBe('Something went wrong. Please try again.');
  });
});
