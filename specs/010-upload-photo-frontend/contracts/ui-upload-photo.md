# UI Contract: C2 Photo Upload Step

## Consumed API

Defined by [`docs/plans/api/05-upload-photo.md`](../../../docs/plans/api/05-upload-photo.md) and [`specs/009-upload-photo/contracts/upload-photo.openapi.yaml`](../../009-upload-photo/contracts/upload-photo.openapi.yaml). The call uses `apiFetch(eventId, …)` so the device-held token for that event is attached, with a 15 s timeout. `Content-Type` is never set manually for the `FormData` body.

### `POST /api/v1/events/{eventId}/photos` — `uploadPhoto(eventId, file)`

The body is `FormData` with the single `file` part (the chosen `File` object; its name is device-provided and never used as the stored identity).

| Response | Frontend handling |
|---|---|
| `201` passing `parsePhoto` | hold the photo, revoke the local object URL, show the server-`url` image as "Photo ready" with [Change photo] and [Remove] |
| `201` failing `parsePhoto`, or an unreadable body | `UNKNOWN_ERROR` → photo-step form error; [Try again] retries the same file |
| `413 FILE_TOO_LARGE` | server message on the photo step (names 10 MB); file context kept; [Try again] + [Choose another photo] |
| `415 UNSUPPORTED_MEDIA_TYPE` | server message on the photo step (lists JPEG/PNG/WebP); same retry actions |
| `422 VALIDATION_ERROR` / `400 BAD_REQUEST` | server message on the photo step |
| `409 EVENT_CLOSED` | closed view; photo step disabled; server copy untouched |
| `401 UNAUTHENTICATED` | "not joined on this device" guidance; photo step disabled; no upload attempted |
| `404 NOT_FOUND` | "This event could not be found." with [Go to start] |
| `500`, non-standard body, network failure, timeout | form error at the photo step (server `message` if present); file context kept; [Try again] retries |

Local checks run before any request (no request is sent): no file → choose-file prompt; empty file → empty-file message; over 10 MB → size message; disallowed type/extension (including HEIC when detectable) → allowed-types message.

## Route (`src/app/events/[eventId]/(tabs)/my-items/new/page.tsx`)

| Input | Behavior |
|---|---|
| Active event with device-held access | photo upload step (empty → uploading → ready / failed) |
| Event without device-held access | existing "not joined on this device" guidance; no picker, no upload |
| Event not found | "This event could not be found." with [Go to start] |
| Closed event | closed banner + disabled photo step |

The "coming soon" placeholder is removed. `routes.newItem(eventId)` is unchanged. No description field and no clothing registration request are added here.

## C2 elements (`components/clothing/PhotoUploadScreen.tsx`)

| Element | Text | Condition / behavior |
|---|---|---|
| Heading | "Register clothing" | always (existing page heading) |
| Photo step label | "Clothing photo" (labeled file input) | always when the step is enabled |
| Help text | "Use a JPEG, PNG, or WebP photo of 10 MB or less." | empty view |
| [Choose photo] | primary or secondary, full width | empty/failed views; native file picker; busy while uploading |
| Local preview | object-URL image | previewing/uploading views; revoked on success/change/remove/unmount |
| Uploading status | "Uploading photo…" in `role="status"` | uploading view; controls busy; at most one request in flight |
| Ready image | server-`url` image | ready view |
| Ready status | "Photo ready" in `role="status"` | ready view |
| [Change photo] | secondary | ready view; discards the held identity and uploads the new file as a new photo |
| [Remove] | tertiary/destructive | ready view; clears preview + held identity; sends no request |
| Photo error | server/preferred local message in `role="alert"`, focused on arrival | failed view; [Try again] (same file) + [Choose another photo] |
| Closed state | shared "This event has ended." banner; step disabled | closed view |
| Future step note | "You will attach this photo when you describe your clothing in the next step." (or equivalent fixed copy) | ready view; description/register UI itself is out of scope |

Field errors use the existing error pattern for the file control; form errors use `role="alert"`, as on H1/P1. Submitting a new file while an upload is pending is disabled; stale results for previous files are ignored.

## Logging

Only non-`ApiError` failures are logged (`'photo upload failed'`) with the error object. File bytes, the participant credential, `Authorization` headers, and response bodies are never logged.

This applies to app-written logs (the app logger and browser console). Request logging by the local Next.js dev server is outside the app and out of scope.
