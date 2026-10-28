import { describe, expect, it } from 'vitest';

import { ApiError, toApiError } from '@/lib/api/api-error';

describe('API error normalization', () => {
  it('retains the standard error response fields', async () => {
    const response = new Response(
      JSON.stringify({
        error: { code: 'BAD_REQUEST', message: 'Malformed JSON.', details: null, requestId: 'r1' },
      }),
      { status: 400 },
    );
    const error = await toApiError(response);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Malformed JSON.',
      details: null,
      requestId: 'r1',
    });
  });

  it('normalizes an HTML error response', async () => {
    const error = await toApiError(new Response('<html>Bad gateway</html>', { status: 502 }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      code: 'UNKNOWN_ERROR',
      message: 'Please try again shortly.',
    });
  });

  it('normalizes JSON without an error object', async () => {
    const error = await toApiError(
      new Response(JSON.stringify({ message: 'Oops' }), { status: 400 }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'UNKNOWN_ERROR',
      message: 'Please try again shortly.',
    });
  });
});
