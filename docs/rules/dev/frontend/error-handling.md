# Error Handling

## 1. Parsing API Errors

Server errors follow the [shared API contract](../common/api-contract.md).

```json
{ "error": { "code": "PROPOSAL_VERSION_MISMATCH", "message": "The proposal has changed.", "details": null, "requestId": "b7e2..." } }
```

- **SHOULD:** retain `requestId` in `ApiError` and error logs for support/bug reports (do not display on screen).

- **MUST:** convert every failed response to `ApiError` in `apiFetch`. Screens do not handle `Response` or raw JSON.
- **MUST:** normalize malformed bodies (e.g. HTML 502 pages) and network failures to `ApiError` too.
- **MUST:** branch on `error.code`; HTTP status is supplementary.
- **MUST:** copy shared codes into a literal union in `src/lib/api/error-codes.ts`. Do not invent codes except normalization-only `NETWORK_ERROR`/`UNKNOWN_ERROR`.

```ts
// src/lib/api/api-error.ts
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

function isErrorBody(
  v: unknown,
): v is { error: { code: string; message: string; details?: unknown; requestId?: string } } {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false;
  const e = (v as { error: unknown }).error;
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e;
}

export async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  if (isErrorBody(body)) {
    const { code, message, details, requestId } = body.error;
    return new ApiError(res.status, code, message, details, requestId);
  }
  return new ApiError(res.status, 'UNKNOWN_ERROR', 'Please try again shortly.');
}
```

Catch `fetch` failures (`TypeError`) in `apiFetch` and throw `new ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.')`.

## 2. User Messages

| Situation | Presentation |
|---|---|
| Query failure | Inline screen error and [Retry] (`refetch`) |
| Mutation failure | Toast or inline message near button |
| Proposal version conflict/invalidation | "The proposal has changed" modal; refresh on acknowledgment |
| Rejected due to closure | Closed banner and event query invalidation |
| Alternative acceptance fails revalidation | Explain, then navigate to exchange list (T1) |
| AI analysis/recommendation failure | Manual fallback (B1 → B2 all items, C3 → [Skip]) |
| Missing permission/session | Guide to entry screen (P1) |

- **MUST:** show `error.message`, prioritizing code-specific copy/actions above. Centralize mappings in `lib/api/error-messages.ts`.
- **MUST NOT:** display stacks, raw responses, or raw `details`.
- **MUST:** always offer manual selection on AI failure; never leave users at a dead end.
- **MUST:** restore buttons after failed mutations so users can retry.

## 3. error.tsx / not-found.tsx

- **MUST:** provide root `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/global-error.tsx`.
- **MUST:** provide `src/app/events/[eventId]/error.tsx` to contain event screen errors within the bottom-tab area.
- **MUST:** make `error.tsx` a client component with [Retry] (`reset`) and [Home].
- **MUST:** call `notFound()` or show equivalent empty UI for missing events/clothing/proposals (server not-found code).
- **SHOULD:** handle query errors in components, not error boundaries (keep default `throwOnError`). Reserve `error.tsx` for unexpected render errors.

```tsx
// src/app/events/[eventId]/error.tsx
'use client';

export default function EventError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="p-6 text-center">
      <p>Unable to load this screen.</p>
      <button type="button" onClick={reset}>Retry</button>
    </div>
  );
}
```

## 4. Form Validation

- **MUST:** define Zod schemas and use `safeParse` before submission. Colocate schemas with forms in `components/<domain>/` or use `lib/validation/`.
- **MUST:** treat client validation as convenience only. Show server validation `details` field errors beneath corresponding inputs, using the common format.
- **MUST:** put messages directly below inputs, linked with `aria-invalid` and `aria-describedby`.
- **MUST:** disable submit buttons while submitting to prevent duplicates.
- **SHOULD:** avoid form libraries; consider `react-hook-form` if many fields become difficult to manage.
- **SHOULD:** validate image MIME/size before upload. The size limit remains undecided; centralize it in `MAX_PHOTO_BYTES` and update later.

```ts
export const itemFormSchema = z.object({
  description: z.string().trim().min(1, 'Please enter a description.').max(500, 'Use at most 500 characters.'),
  photo: z.instanceof(File, { message: 'Please select a photo.' }),
});
```

Validation lengths/numbers are examples; align with server constraints once agreed.
