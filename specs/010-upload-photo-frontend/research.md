# Research: Upload Photo Frontend (Mobile)

All Technical Context items are resolved; no NEEDS CLARIFICATION remains. Sources: [spec.md](spec.md), `docs/plans/api/05-upload-photo.md`, `specs/009-upload-photo/contracts/upload-photo.openapi.yaml`, `docs/rules/dev/common/api-contract.md`, `docs/rules/dev/frontend/`, and the existing frontend code from features 002/004/006/008.

## R1. Route and screen placement

- **Decision**: Replace the `my-items/new` placeholder with a client `PhotoUploadScreen` rendered by `src/app/events/[eventId]/(tabs)/my-items/new/page.tsx`. The page stays a server component reading `params.eventId` and passing it to the client screen. Access gating reuses the existing event-layout pattern: no session → existing "not joined on this device" guidance; the screen sends no upload in that case.
- **Rationale**: `routes.newItem(eventId)` already points here and C1 links here. The existing page is only a `ComingSoonScreen`, so there is no behavior to preserve.
- **Alternatives**: A new route outside `my-items/new` (rejected: breaks the C1 → C2 entry point).

## R2. API function and response validation

- **Decision**: Add to `src/lib/api/` (new `photos.ts` following the `events.ts` precedent):
  - `uploadPhoto(eventId, file)` → `POST /events/{encodeURIComponent(eventId)}/photos` with a `FormData` body containing the single `file` part. Call `apiFetch(eventId, …)` so the device-held token for that event is attached, with a 15 s timeout.
  - Never set `Content-Type` manually; `apiFetch` already skips it for `FormData` bodies (`client.ts`).
  - Validate the 201 body with a new `parsePhoto` Zod schema: non-empty `id`, `url` (valid URL string), `contentType` in `{image/jpeg, image/png, image/webp}`, `sizeBytes` integer 1–10485760, `createdAt` parseable date. Any mismatch or an unreadable 2xx body becomes the existing `ApiError(status, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')` — `apiFetch` already normalizes unreadable bodies this way, so no `client.ts` change is needed.
- **Rationale**: Matches `05-upload-photo.md` and the backend contract; `FR-009` (never show ready without a validated success) and `data-fetching.md` §1 (one client, FormData rule).
- **Alternatives**: Unvalidated cast like `createEvent` (rejected: FR-005/FR-009 require validation).

## R3. Local file checks before sending

- **Decision**: New pure `src/lib/validation/photo.ts`:
  - `MAX_PHOTO_BYTES = 10485760`, `ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']`.
  - `validatePhotoFile(file: File | null | undefined)` trims nothing (binary) and returns `{ ok: true; file }` or `{ ok: false; message }`:
    - missing/cancelled pick → "Choose a photo to upload."
    - `file.size === 0` → "The chosen file is empty. Choose another photo."
    - `file.size > MAX_PHOTO_BYTES` → "Choose a photo of 10 MB or less."
    - `file.type` present and outside the allowed list, or the file-name extension outside `{.jpg,.jpeg,.png,.webp}` when the type is empty/generic → "Use a JPEG, PNG, or WebP photo."
  - Extension is only a fallback when `file.type` is empty or `application/octet-stream` (some mobile browsers); a file passing locally can still be rejected by the server as disguised content.
- **Rationale**: FR-003, edge cases (exactly-10 MB accepted locally; HEIC rejected locally when detectable, otherwise by the server). Keeps the same message-wording pattern as `validation/join.ts`.
- **Alternatives**: Server-only validation (rejected: wastes uploads on slow networks, contradicts SC-003).

## R4. Upload mutation: single in-flight, stale-result protection

- **Decision**: `useUploadPhotoMutation(eventId)` is a `useMutation` with `retry: 0`. The screen additionally keeps a `requestSeq` ref incremented per attempt plus the `File` identity it was sent with:
  - Success/error handlers ignore results whose sequence does not match the latest attempt (covers change-during-upload and remove-during-upload).
  - [Choose photo], [Change photo], [Try again] are disabled/busy while the mutation is pending, so at most one request is in flight (FR-004, US3-2).
  - The mutation never auto-retries: photo upload is not idempotent (each success creates a distinct photo), so a lost response retried blindly would create a duplicate server copy.
- **Rationale**: `data-fetching.md` §3 (`retry: 0`, disable while pending). Mirrors the join lookup serialization (R3 in 008) but with a sequence ref because the "key" here is a `File` object, not a string.
- **Alternatives**: Keying a query by file name (rejected: names are not unique and may be unavailable on device).

## R5. Previews: local object URL vs. server URL

- **Decision**: On selection, create `URL.createObjectURL(file)` for the immediate local preview; on success, revoke it and render the returned `url` as the ready image. Revoke any outstanding object URL on change, remove, and unmount. The ready image uses the server URL only (SC-002: the shown image is the stored bytes).
- **Rationale**: Spec US1-2/US1-3 (instant preview, then viewable server image) without leaking object URLs.
- **Alternatives**: Rendering only the server URL after upload (rejected: no instant feedback on slow networks).

## R6. Failure mapping as pure functions

- **Decision**: Add `getPhotoUploadFailure(error)` to `src/lib/event.ts` (same file as the other mappers):
  - `FILE_TOO_LARGE` → `{ kind: 'photoField', message: error.message }`
  - `UNSUPPORTED_MEDIA_TYPE` → `{ kind: 'photoField', message: error.message }`
  - `VALIDATION_ERROR` / `BAD_REQUEST` → `{ kind: 'photoField', message: error.message }`
  - `EVENT_CLOSED` → `{ kind: 'closed' }`
  - `UNAUTHENTICATED` → `{ kind: 'no-access' }`
  - `NOT_FOUND` → `{ kind: 'not-found', message: error.message }`
  - anything else (network, timeout, 5xx, `UNKNOWN_ERROR`, non-`ApiError`) → `{ kind: 'form', message: getFormErrorMessage(error) }`
- **Rationale**: Pure functions are the unit-testable non-trivial logic per `testing.md`; screen tests check wiring only. Mirrors `getLookupFailure`/`getJoinFailure` from feature 008.
- **Alternatives**: Inline branching in the component (rejected: harder to test exhaustively).

## R7. Screen states, focus, and accessibility

- **Decision**: `PhotoUploadScreen` derives one view from the event query, local file state, and the upload mutation (see [data-model.md](data-model.md)): `no-access`, `not-found`, `closed`, `empty`, `previewing`, `uploading`, `ready`, `failed`. Closed is derived with the shared `isClosed()` helper and `getEventScreenState` precedence; the event layout banner keeps polling closure, so no new polling is added here.
  - File input is a labeled native `<input type="file" accept="image/jpeg,image/png,image/webp">` (camera/album choice left to the device picker).
  - Photo-step errors use the `TextInput`-style error pattern adapted to the file control plus a `role="alert"` region; when an upload fails, focus moves to the error region.
  - Uploading/ready transitions are announced via a `role="status"` region ("Uploading photo…", "Photo ready").
  - Closed state reuses the shared banner/label pattern from P2/M1; the photo step is disabled (FR-009/FR-010).
- **Rationale**: Matches FR-010 and the existing `JoinEventScreen` focus/announcement pattern. Native file input is the only accessible cross-browser picker; no custom dropzone.
- **Alternatives**: Drag-and-drop zone (rejected: not a mobile pattern, extra code).

## R8. Logging

- **Decision**: Log only non-`ApiError` failures (`logger.error('photo upload failed', error)`), never the file name when avoidable, never file bytes, token, headers, or response bodies. Validation rejections before sending are not logged.
- **Scope**: FR-012 covers app-written logs (app logger and browser console). Next.js dev-server request logging is outside the app and out of scope.
- **Rationale**: FR-012/SC-006, `logging.md`, same policy as `CreateEventScreen`/`JoinEventScreen`.

## R9. Tests

- **Decision**: Vitest + Testing Library with `renderWithClient`.
  - **Mock boundary**: screen tests mock only `@/lib/api/client` (`apiFetch`, routed by path) and keep the real `uploadPhoto` and hooks — same boundary as 008 R10 (mocking the exported API function while keeping the real hook would not replace the hook's internal binding).
  - Unit tests: `validation/photo.ts` (boundary sizes, empty, types, HEIC, extension fallback), `getPhotoUploadFailure` mapping, `parsePhoto` (valid/invalid/unreadable), `uploadPhoto` (URL, FormData part, event-scoped token via `eventId`, no manual `Content-Type`, response validation).
  - Screen tests: empty → preview → uploading → ready handoff; change/remove; each failure mapping; single in-flight and double-tap; stale-result ignore after change/remove; closed/no-access gating; no secrets in logs.
  - Layout at 360/430 px checked manually ([quickstart.md](quickstart.md)).
- **Rationale**: Constitution II–IV and `docs/rules/dev/frontend/testing.md` (user-perspective queries, `userEvent`, fresh `QueryClient` per test, no network).
