---

description: "Task list for feature 010-upload-photo-frontend"
---

# Tasks: Upload Photo Frontend (Mobile)

**Input**: Design documents from `/specs/010-upload-photo-frontend/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-upload-photo.md](contracts/ui-upload-photo.md), [quickstart.md](quickstart.md)

**Tests**: Required (Constitution II).
- Every behavior's test task comes before the implementation task that covers it.
- Each state reset or guard is implemented in the same cycle as the test that first exercises it, never earlier.
- Run each test and confirm it fails for the expected reason (Red) before implementing.
- Every assertion about **new** behavior must be Red on first run. If one passes, report it as a planning defect.
- **Regression guards** are assertions over unchanged 002/004/006/008 behavior. They are labelled `(regression guard)` and may pass on first run.
- Layout at 360–430 px, touch target size, and the native file picker are verified manually (Constitution III, frontend `testing.md`).

**Organization**: Tasks are grouped by user story (US1–US3 from spec.md). `PhotoUploadScreen.test.tsx` grows across stories: each story adds a new `describe` block, and only `test-author` edits test files.

**Delegates** (AGENTS.md):
- Each task names its Paseo profile. The orchestrator never edits `frontend/`.
- Every test → implementation cycle ends with a `commit-reviewer` review and then a commit. Never commit a Red state alone.
- Checks for every cycle: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`.
- Before each delegation, call Paseo `list_profiles`, read notes, and pass the selected profile's provider/model/modeId/thinkingOptionId/featureValues to `create_agent`. If a required profile is unavailable, stop instead of doing the work inline. Delegates must not delegate.
- Implementers follow `frontend/AGENTS.md`:
  - Read `frontend/node_modules/next/dist/docs/` for page `params`.
  - Inspect Astryx components first (`pnpm exec astryx component TextInput`, `Button`, `Badge`), including prop names before use.
- Give every delegate:
  - plan.md, research.md, data-model.md, and contracts/ui-upload-photo.md
  - `docs/plans/api/05-upload-photo.md` and `specs/009-upload-photo/contracts/upload-photo.openapi.yaml`
  - `docs/rules/dev/common/api-contract.md` and `docs/rules/dev/frontend/`. Don't give them `docs/rules/dev/backend/`.
- **Screen-test mock boundary** (research R9, Constitution IV):
  - `PhotoUploadScreen.test.tsx` and `my-items/new/page.test.tsx` mock only `@/lib/api/client` and keep the real `uploadPhoto` and hooks from `@/lib/api/photos`:

    ```ts
    const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
    vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
    ```

  - Each test routes `mocks.apiFetch` by `path`:
    - `/events/e1` → the shared event (active or closed fixture)
    - `/events/e1/photos` → upload
  - They keep the real `uploadPhoto` and `useUploadPhotoMutation`. **Do not** mock `@/lib/api/photos`, because its hook calls the module-internal function.
  - "Upload called with file F" means `mocks.apiFetch` was called with path `/events/e1/photos` and `init.body` a `FormData` whose `get('file')` is F.
  - Render through `renderWithClient`, seed access with `saveEventSession`, and call `localStorage.clear()` in `beforeEach`. Never use real network.
  - Stub `URL.createObjectURL`/`URL.revokeObjectURL` in `beforeEach` (`createObjectURL` returns `'blob:preview'`), because jsdom has no such functions.
- Work on branch `feature/frontend-upload-photo` (created from `main`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US3 from spec.md
- **Paths**: all under `frontend/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch and baseline. Dependencies (TanStack Query, Astryx, Zod), `apiFetch` (with `FormData` handling and unreadable-2xx normalization), `useEventQuery`, `getEventScreenState`, `session.ts`, `routes.newItem()`, and `renderWithClient` already exist from features 002/004/006/008. No test infrastructure is needed.

- [X] T001 Create branch `feature/frontend-upload-photo` from `main` and confirm the baseline passes: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`. Then run `commit-reviewer` on the `specs/010-upload-photo-frontend/` documents and commit them (`.specify/feature.json` is gitignored) — agent: orchestrator → `commit-reviewer`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: File validation, photo response parsing and type, failure mapping, and the upload API function/hook that every story uses (R2, R3, R4, R6). There are four TDD cycles, F0–F3.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Cycle F0 — local file checks (`lib/validation/photo.ts`, R3)

- [X] T002 [P] Create `frontend/src/lib/validation/photo.test.ts` — agent: `test-author`:
  - `validatePhotoFile(null)` and `validatePhotoFile(undefined)` → `{ ok: false, message: 'Choose a photo to upload.' }`
  - A zero-byte JPEG object (`{ size: 0, type: 'image/jpeg', name: 'a.jpg' } as File`) → `{ ok: false, message: 'The chosen file is empty. Choose another photo.' }`
  - `{ size: 10485761, type: 'image/jpeg', name: 'a.jpg' }` → `{ ok: false, message: 'Choose a photo of 10 MB or less.' }`, and `apiFetch` is never involved (pure function, no request concept at this layer)
  - `{ size: 10485760, type: 'image/jpeg', name: 'a.jpg' }` (exactly 10 MiB) → `{ ok: true }` with the same file
  - `{ size: 100, type: 'image/heic', name: 'a.heic' }` → `{ ok: false, message: 'Use a JPEG, PNG, or WebP photo.' }`
  - Each of `image/jpeg`, `image/png`, `image/webp` with a matching name → `{ ok: true }`
  - `{ size: 100, type: '', name: 'a.jpg' }` (device hid the type) → `{ ok: true }`; `{ size: 100, type: '', name: 'a.txt' }` → the allowed-types message
  - `{ size: 100, type: 'application/octet-stream', name: 'a.png' }` → `{ ok: true }`
- [X] T003 Implement `frontend/src/lib/validation/photo.ts` with `MAX_PHOTO_BYTES = 10485760`, `ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const`, and `validatePhotoFile` per research R3 and the messages above. This makes T002 pass — agent: `implementer-fe`

### Cycle F1 — response parsing and type (`lib/validation/photo-response.ts`, `types/photo.ts`, R2)

- [X] T004 [P] Create `frontend/src/lib/validation/photo-response.test.ts` — agent: `test-author`:
  - "parsePhoto" block:
    - `{ id: 'ph1', url: 'https://cdn.example/photos/ph1', contentType: 'image/jpeg', sizeBytes: 1834221, createdAt: '2026-10-27T05:42:10Z' }` parses; `contentType: 'image/webp'` parses too
    - Each of these throws `ApiError` with code `UNKNOWN_ERROR` and status 200: missing `id`, `id: ''`, a non-URL `url`, `contentType: 'image/heic'`, `sizeBytes: 0`, `sizeBytes: 10485761`, an unparseable `createdAt`, and `null`
- [X] T005 Implement `parsePhoto` in `frontend/src/lib/validation/photo-response.ts` (Zod schema per data-model.md "Photo"; never log the payload) and add the `Photo` type to `frontend/src/types/photo.ts`. This makes T004 pass — agent: `implementer-fe`

### Cycle F2 — failure mapping (`lib/event.ts`, R6)

- [X] T006 [P] Add to `frontend/src/lib/event.test.ts` — agent: `test-author`:
  - "getPhotoUploadFailure" block:
    - `ApiError(413, 'FILE_TOO_LARGE', 'Photo exceeds the 10 MB limit.')` → `{ kind: 'photoField', message: 'Photo exceeds the 10 MB limit.' }`
    - `ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use a JPEG, PNG, or WebP photo.')` → `{ kind: 'photoField', message: <that message> }`
    - `ApiError(422, 'VALIDATION_ERROR', 'No file.')` and `ApiError(400, 'BAD_REQUEST', 'Bad body.')` → `photoField` with the server message
    - `ApiError(409, 'EVENT_CLOSED', …)` → `{ kind: 'closed' }`
    - `ApiError(401, 'UNAUTHENTICATED', …)` → `{ kind: 'no-access' }`
    - `ApiError(404, 'NOT_FOUND', 'Not here.')` → `{ kind: 'not-found', message: 'Not here.' }`
    - `ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.')`, `ApiError(500, 'INTERNAL_ERROR', 'Server says no.')`, `ApiError(201, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')` (unreadable 201 body via `apiFetch`), and `new Error('x')` → `{ kind: 'form', message: <server or generic message> }`
- [X] T007 Implement `getPhotoUploadFailure` (type exactly as in data-model.md "Failure mapping") in `frontend/src/lib/event.ts`, using `getFormErrorMessage`. This makes T006 pass — agent: `implementer-fe`

### Cycle F3 — upload API function and hook (`lib/api/*`, R2, R4)

- [X] T008 [P] Create `frontend/src/lib/api/photos.test.ts` — agent: `test-author`, mocking `@/lib/api/client`:
  - "uploadPhoto" block:
    - `uploadPhoto('e1', file)` calls `apiFetch('e1', '/events/e1/photos', { method: 'POST', body: <FormData> }, { timeoutMs: 15000 })` (first argument `'e1'`, so the device-held token for that event is attached)
    - `init.body` is a `FormData` whose `get('file')` is the passed file, and `init` sets no `Content-Type` header
    - It URL-encodes the event ID (`'a/b'` → `/events/a%2Fb/photos`)
    - It returns the parsed `Photo`; a malformed body rejects with `UNKNOWN_ERROR` (status 200); `ApiError`s from `apiFetch` propagate unchanged
  - "useUploadPhotoMutation" block, using `renderHook` with `renderWithClient`'s client: a 500 rejection calls `apiFetch` once (`retry: 0`)
- [X] T009 Implement in `frontend/src/lib/api/query-keys.ts` and `frontend/src/lib/api/photos.ts` — agent: `implementer-fe`:
  - `mutationKeys.uploadPhoto = (eventId: string) => ['events', eventId, 'photos', 'upload'] as const`
  - `uploadPhoto(eventId, file)` (builds `FormData` with the single `file` part, `parsePhoto` on the result) and `useUploadPhotoMutation(eventId)` (`mutationFn: (file: File) => uploadPhoto(eventId, file)`, `retry: 0`)
  - Never log the file, token, or body
  - This makes T008 pass

**Checkpoint**: Upload validation, response parsing, failure mapping, and the API seam are tested in isolation.

---

## Phase 3: User Story 1 — Participant uploads a clothing photo in C2 (Priority: P1) 🎯 MVP

**Goal**: C2 shows the photo step; choosing a file shows a local preview and uploads; success shows the server-URL image as ready with [Change photo] and [Remove]; change uploads anew; remove clears without a request.

**Independent Test**: Open C2 in a fresh participant session, upload valid JPEG/PNG/WebP files, verify preview → uploading → ready with a viewable server image, then change and remove (quickstart rows 1–5, 13, 14).

### Tests for User Story 1 (REQUIRED - write first) ⚠️

- [X] T010 [US1] Create `frontend/src/components/clothing/PhotoUploadScreen.test.tsx` using the screen-test mock boundary above, with a "US1 happy path" `describe` — agent: `test-author`. Seed access with `saveEventSession('e1', { participantToken: 't', participantId: 'p2' })`, route `/events/e1` to an active non-organizer event, and `/events/e1/photos` to `{ id: 'ph1', url: 'https://cdn.example/photos/ph1', contentType: 'image/jpeg', sizeBytes: 100, createdAt: '2026-10-27T05:42:10Z' }`:
  - C2 shows a file input labelled "Clothing photo", the help text "Use a JPEG, PNG, or WebP photo of 10 MB or less.", a [Choose photo] control, and no upload call yet. The text "coming soon" is absent.
  - Uploading `new File(['bytes'], 'jacket.jpg', { type: 'image/jpeg' })` through the input shows a local preview image (`src === 'blob:preview'`), the text "Uploading photo…", and exactly one upload call whose `FormData` holds that file. While pending, the file control is busy/disabled.
  - On resolution: "Photo ready" is shown with an image whose `src` is the server URL, plus [Change photo] and [Remove]. The participant token never appears in the rendered output.
  - [Change photo] with a new file discards the old preview and sends a second upload for the new file (two upload calls total, no other request).
  - [Remove] clears the preview and the ready state, returns to the empty step, and sends no further request (still two upload calls total).
  - (regression guard) Unchanged: an event query returning 401 shows the existing "not joined on this device" guidance with no picker.
  - Picker cancellation (change event with no files) sends no upload and leaves C2 unchanged.
  - An event query returning 404 shows "This event could not be found." with [Go to start] and no picker; an event query failing with 500 shows a retryable form error and no picker.
- [X] T011 [P] [US1] Create `frontend/src/app/events/[eventId]/(tabs)/my-items/new/page.test.tsx` — agent: `test-author`:
  - Await `MyItemsNewPage({ params: Promise.resolve({ eventId: 'e1' }) })` and render the result with `renderWithClient`. The "Clothing photo" step is shown and the text "coming soon" is absent.

### Implementation for User Story 1

- [X] T012 [US1] Implement `frontend/src/components/clothing/PhotoUploadScreen.tsx` (`'use client'`, props `{ eventId: string }`) for the `empty`, `previewing`, `uploading`, and `ready` views, and wire `frontend/src/app/events/[eventId]/(tabs)/my-items/new/page.tsx` to it — agent: `implementer-fe`:
  - The page is a server component: `params: Promise<{ eventId: string }>` → `<PhotoUploadScreen eventId={eventId} />`. Remove the `ComingSoonScreen` import from this page only. Then grep production usages of `ComingSoonScreen`; if `my-items/new/page.tsx` was its last usage, delete `frontend/src/components/ui/ComingSoonScreen.tsx` (and its test file if one exists); otherwise record in the commit message why it is kept.
  - The screen gates on `hasEventSession(eventId)` (no session → existing "not joined on this device" guidance, no upload) and reads the shared event via `useEventQuery` + `getEventScreenState` with `isClosed(data)` for the closed check (reuse `lib/event.ts` helpers; the event layout banner already polls closure, so no new polling here). 404 → "This event could not be found." with [Go to start]; a shared closed event → closed view per data-model.md precedence.
  - File input: native `<input type="file" accept="image/jpeg,image/png,image/webp">` labelled "Clothing photo". On selection, run `validatePhotoFile` (local rejection → photo-step message, no request), show the object-URL preview, and call the upload mutation. At most one upload in flight: disable the file control and [Try again] while pending.
  - On success (`parsePhoto` already applied in `uploadPhoto`): revoke the object URL, hold the `Photo`, show the server-`url` image with "Photo ready", [Change photo] (discards the held identity, uploads the new file as a new photo), and [Remove] (clears preview + held identity, sends nothing). Show the future-step note per contracts/ui-upload-photo.md.
  - Announce uploading/ready via a `role="status"` region. Log nothing about the file (validation rejections are not logged).
  - Do **not** implement failure mapping yet beyond the local checks; server failures belong to the next cycle.
  - This makes T010 and T011 pass.

**Checkpoint**: The MVP is demoable: C2 → preview → uploading → ready → change/remove.

---

## Phase 4: User Story 2 — Upload problems are explained and recoverable (Priority: P1)

**Goal**: Every upload failure shows a message with a next action; closed/unauthenticated/not-found switch the whole step; retrying works and keeps file context.

**Independent Test**: Attempt each failure class (local and server) and verify the message, the remaining C2 state, and retry (quickstart rows 6, 8–11, 13).

### Tests for User Story 2 (REQUIRED - write first) ⚠️

- [X] T013 [US2] Add a "US2 failures" `describe` to `frontend/src/components/clothing/PhotoUploadScreen.test.tsx` — agent: `test-author`:
  - Choosing an oversized file shows "Choose a photo of 10 MB or less." and sends no upload; choosing an HEIC file shows "Use a JPEG, PNG, or WebP photo." and sends no upload.
  - Upload rejected `413 FILE_TOO_LARGE` ('Photo exceeds the 10 MB limit.') → the message is shown at the photo step with [Try again] and [Choose another photo]; the file context is kept; [Try again] sends a second upload with the same file.
  - Upload rejected `415 UNSUPPORTED_MEDIA_TYPE` → the server message is shown at the photo step with the same retry actions.
  - Upload rejected `401 UNAUTHENTICATED` → the "not joined on this device" guidance with [Join with entry code] and [Go to start]; the photo step is disabled.
  - Upload rejected `404 NOT_FOUND` ('Not here.') → "This event could not be found." with [Go to start].
  - Upload rejected `409 EVENT_CLOSED` → the closed view (shared "This event has ended." banner, step disabled).
  - Upload rejected `NETWORK_ERROR` and `500 INTERNAL_ERROR` → the message is in `role="alert"`, the file context is kept, and [Try again] retries; the failing error region receives focus; screen shows no navigation links other than the documented ones and no location change occurs.
  - An upload resolving with an unreadable/invalid body, or rejected with `ApiError(201, 'UNKNOWN_ERROR', …)` (unreadable 201 body) → treated as an unexpected response: not shown as ready, retry offered, and the error region receives focus.
  - No secrets in logs: spy on `console.error`/`console.warn` with token `'SECRET-TOKEN'`, a file marker (`'jacket.jpg'`), an `'Authorization'`/`'Bearer'` marker, and a `'/photos/'` URL marker; run the success flow, a 500 failure, and a rejection with `new Error('boom')`; none of these strings appears in any logged argument (stringify each argument).

### Implementation for User Story 2

- [X] T014 [US2] In `frontend/src/components/clothing/PhotoUploadScreen.tsx` — agent: `implementer-fe`:
  - Map upload errors with `getPhotoUploadFailure`: `photoField` → photo-step error (server message preferred); `closed` → closed view; `no-access` → not-joined guidance; `not-found` → not-found view; `form` → `role="alert"` error with [Try again].
  - A failed upload keeps the chosen file context (same `File` for [Try again]); [Choose another photo] reopens the picker. Failures never show the ready state and never navigate.
  - When the failure arrives, move focus to the error region. Log only non-`ApiError` failures (`'photo upload failed'`).
  - This makes T013 pass.

**Checkpoint**: All FR-007 mappings, focus handling, and log secrecy are verified.

---

## Phase 5: User Story 3 — Photo stays ready while the participant prepares registration (Priority: P2)

**Goal**: The ready photo persists without extra uploads; repeated taps never queue duplicates; attempted change/remove mid-upload stays locked; a newly closed event disables the step.

**Independent Test**: Keep C2 open on a ready photo, double-tap controls under throttling (no second upload is sent), attempt change/remove mid-upload (controls stay locked), and close the event elsewhere (quickstart rows 4, 7, 9).

### Tests for User Story 3 (REQUIRED - write first) ⚠️

- [X] T015 [US3] Add a "US3 stability" `describe` to `frontend/src/components/clothing/PhotoUploadScreen.test.tsx` — agent: `test-author`:
  - With a ready photo, rerendering C2 (same `QueryClient`) sends no further upload and the ready image and [Change photo]/[Remove] persist.
  - Under a pending upload, double-clicking [Try again] (after a first failure) or resubmitting the same file sends exactly one upload; the controls are busy while pending.
  - Locked during upload: with an upload pending, the file input and [Try again] are disabled/busy and [Remove] is absent; attempting to choose another file, resubmit, or remove sends no additional upload (still exactly one upload call); resolving then shows the uploaded file as ready.
  - Local rejection after a failure clears retry context: fail an upload with file A (failed view with [Try again]), then choose an oversized file B → the size message is shown, the stale file-A context is cleared so [Try again] is no longer offered (only [Choose another photo]), and no upload is sent.
  - The shared event turning closed (reroute `/events/e1` to a closed event and refetch) disables the photo step and shows the closed banner while keeping no upload in flight; a ready held photo is left as-is with the step disabled.

### Implementation for User Story 3

- [X] T016 [US3] In `frontend/src/components/clothing/PhotoUploadScreen.tsx` — agent: `implementer-fe`:
  - Keep the `mutation.isPending` gating of [Choose photo]/[Change photo]/[Try again]/[Remove] (already in place from T012; verify) so at most one upload request is in flight; a second submit while pending returns early.

  - On local validation rejection, clear `chosenFile` and revoke the local preview so a stale failed-file context never lingers behind the new message; [Try again] is only offered when a valid file context exists.
  - Derive the `closed` view from the shared event query first, so a server-confirmed closed state takes precedence over an upload failure (data-model.md precedence; verify the T012/T014 wiring).
  - This makes T015 pass.

**Checkpoint**: All stories are complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T017 Run `cd frontend && pnpm exec astryx doctor --built` and fix any findings in `PhotoUploadScreen.tsx` — agent: `implementer-fe`
- [X] T018 Run the full suites and the production build, and record the actual results — agent: orchestrator:
  - `cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  - `cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest` (the backend is unchanged; this confirms nothing regressed)
  - **Results (2026-10-30, after T017)**: Frontend: lint 0 errors (4 `no-img-element` warnings on intentional native `img`), typecheck pass, 28 files / 402 tests pass, `pnpm build` success (route `/events/[eventId]/my-items/new` present). Backend: ruff format (82 files) + ruff check pass, mypy pass (36 files), pytest 270 passed.
- [ ] T019 Manual verification per quickstart.md rows 1–15 at 360 px and 430 px, recording the results in the PR description — agent: orchestrator with the user. Check:
  - no horizontal scroll, touch targets ≥ 44×44 px, and English copy
  - focus moves to the upload error, and uploading/ready transitions are announced
  - local preview appears before the server image; exactly-10 MB accepted locally
  - one POST per attempt, and at most one pending upload, under throttling
  - C2 → ready in under 60 s of user time excluding the device picker (SC-001)
  - no credential, image bytes, or response body in the browser console
  - Attach screenshots of C2 (empty, uploading, ready, failed, closed) at both widths.
- [X] T020 Run `pr-reviewer` on `main..HEAD` before creating the PR (AGENTS.md "Code Review") — agent: `pr-reviewer`

---

## Dependencies & Execution Order

- **Setup**: T001 comes first.
- **Foundational**:
  - F0 (T002–T003), F1 (T004–T005), and F2 (T006–T007) are independent of each other (different files).
  - F3 (T008–T009) needs F1 (`parsePhoto`).
- **US1 (T010–T012)** needs all of Phase 2.
- **US2 (T013–T014)** and **US3 (T015–T016)** each need US1, because they share `PhotoUploadScreen.*`. Run them in order US2 → US3: US2 adds the error mapping and focus handling that US3's stability tests build on.
- **Polish** comes after all stories.

## Parallel Opportunities

- The `[P]` test tasks T002, T004, T006, and T008 touch different test files and can be drafted in parallel. Their implementation cycles still run one implementer at a time per workspace (AGENTS.md).
- T011 (page test) can be written alongside T010.
- With a second Paseo workspace, F0 → F2 can run in workspace A while F1 → F3 run in workspace B, merging before US1. Run `commit-reviewer` separately in each workspace.

### Parallel example: second workspace

```text
workspace A: T002 → T003 → commit;  T006 → T007 → commit
workspace B: T004 → T005 → commit;  T008 → T009 → commit
then (merged): T010–T012 → T013–T014 → T015–T016 → T017–T020
```

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1. A participant can pick a photo in C2 and reach a ready uploaded image, and this is demoable on its own.
2. **+ US2**: recoverable failures for every local and server error class, closed/no-access/not-found switching, focus handling, and log secrecy. This completes the P1 scope.
3. **+ US3**: ready-state persistence, single in-flight via locked controls, and closed-event precedence. This completes the C2 photo step.
4. Polish, full checks and build, manual verification with screenshots, and PR review.
