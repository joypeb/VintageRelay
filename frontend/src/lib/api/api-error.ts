export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ErrorFields = { code: string; message: string; details?: unknown; requestId?: string };

function isErrorFields(v: unknown): v is ErrorFields {
  return (
    typeof v === 'object' &&
    v !== null &&
    'code' in v &&
    typeof v.code === 'string' &&
    'message' in v &&
    typeof v.message === 'string'
  );
}

function isErrorBody(v: unknown): v is { error: ErrorFields } {
  return typeof v === 'object' && v !== null && 'error' in v && isErrorFields(v.error);
}

export async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  if (isErrorBody(body)) {
    const { code, message, details, requestId } = body.error;
    return new ApiError(res.status, code, message, details, requestId);
  }
  return new ApiError(res.status, 'UNKNOWN_ERROR', 'Please try again shortly.');
}
