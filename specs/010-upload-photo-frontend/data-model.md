# Data Model: Upload Photo Frontend (Mobile)

These are frontend-only types. The shared API contract is unchanged; see [contracts/ui-upload-photo.md](contracts/ui-upload-photo.md).

## Photo (new, `src/types/photo.ts`)

Validated result of `POST /api/v1/events/{eventId}/photos` via `parsePhoto`.

| Field | Type | Rule |
|---|---|---|
| `id` | string | non-empty (held for the later clothing registration) |
| `url` | string | valid URL (ready image source) |
| `contentType` | `image/jpeg` \| `image/png` \| `image/webp` | — |
| `sizeBytes` | number | integer, 1–10485760 |
| `createdAt` | string | parseable date |

Any other shape, or an unreadable body → `ApiError(status, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')`.

## PhotoValidation (new, `src/lib/validation/photo.ts`)

- `MAX_PHOTO_BYTES = 10485760`
- `ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const`
- `validatePhotoFile(file) → { ok: true; file } | { ok: false; message }` per research R3.
- Extension fallback set: `{.jpg, .jpeg, .png, .webp}` — used only when `file.type` is empty or `application/octet-stream`.

## Failure mapping (`src/lib/event.ts`)

`getPhotoUploadFailure(error)` per research R6:

| Input code | Output |
|---|---|
| `FILE_TOO_LARGE` | `{ kind: 'photoField', message: error.message }` |
| `UNSUPPORTED_MEDIA_TYPE` | `{ kind: 'photoField', message: error.message }` |
| `VALIDATION_ERROR` / `BAD_REQUEST` | `{ kind: 'photoField', message: error.message }` |
| `EVENT_CLOSED` | `{ kind: 'closed' }` |
| `UNAUTHENTICATED` | `{ kind: 'no-access' }` |
| `NOT_FOUND` | `{ kind: 'not-found', message: error.message }` |
| anything else | `{ kind: 'form', message: getFormErrorMessage(error) }` |

## Upload mutation (`src/lib/api/photos.ts`)

- `uploadPhoto(eventId, file)`: builds `FormData` with the single `file` part, calls `apiFetch<unknown>(eventId, …/photos, { method: 'POST', body })` with a 15 s timeout, returns `parsePhoto(data)`.
- `useUploadPhotoMutation(eventId)`: `useMutation` with `mutationKey: mutationKeys.uploadPhoto(eventId)`, `retry: 0`.
- Query-key addition in `query-keys.ts`: `mutationKeys.uploadPhoto(eventId) = ['events', eventId, 'photos', 'upload']`.
- No event-query invalidation on success: the photo is C2-local state (held identity), not shared server state read elsewhere yet. The shared `useEventQuery` in the layout keeps driving the closed banner.

## C2 view state (`PhotoUploadScreen`)

Derived on each render, not stored. Check order is the precedence:

| View | Condition | Shows |
|---|---|---|
| `no-access` | no device-held session for the event, or upload returned `no-access` | existing "not joined on this device" guidance with [Join with entry code] and [Go to start]; no picker |
| `not-found` | event query or upload returned `not-found` | "This event could not be found." with [Go to start]; no picker |
| `closed` | shared event says `closed`, or upload returned `closed` | closed banner + disabled photo step; no upload actions |
| `ready` | a validated `Photo` is held and no upload pending | server-URL image, "Photo ready", [Change photo], [Remove] |
| `failed` | last upload attempt failed (non-closed) and a file context exists | file/photo-step error (`role="alert"`, focused), [Try again], [Choose another photo] |
| `uploading` | mutation pending | local preview, "Uploading photo…" (`role="status"`), controls busy |
| `previewing` | file chosen, upload about to start (transient; normally collapses into `uploading`) | local preview |
| `empty` | otherwise | [Choose photo] + help text (formats, 10 MB) |

Local state: `chosenFile: File | null`, `localPreviewUrl: string | null`, `heldPhoto: Photo | null`, `requestSeq` ref + `latestAttemptSeq`, `photoFieldError: string | null`, `formError: string | null`.

### Transitions

```text
empty ──choose file (valid locally)──▶ uploading ──201 valid──▶ ready
  │                                        │  ├─FILE_TOO_LARGE/UNSUPPORTED/422/400──▶ failed (photo error)
  │                                        │  ├─EVENT_CLOSED──▶ closed
  │                                        │  ├─UNAUTHENTICATED──▶ no-access
  │                                        │  ├─NOT_FOUND──▶ not-found
  │                                        │  └─network/timeout/5xx/invalid──▶ failed (form error + [Try again])
  │                                        ▼
  │                              stale result (seq mismatch) ──▶ ignored
  └─choose file (invalid locally)──▶ empty (photo-step message, no request)
ready ──[Change photo]──▶ uploading (new file; old identity discarded)
ready ──[Remove]──▶ empty (preview + identity cleared; no request)
failed ──[Try again]──▶ uploading (same file) | ──[Choose another photo]──▶ empty→uploading
any ──event becomes closed──▶ closed (step disabled; held server copy untouched)
```
