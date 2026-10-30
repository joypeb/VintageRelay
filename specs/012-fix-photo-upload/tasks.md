---

description: "Task list for feature 012-fix-photo-upload"
---

# Tasks: Fix Photo Upload and Support Multiple Photos (C2)

**Input**: Design documents from `/specs/012-fix-photo-upload/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/register-clothing-photos.md](contracts/register-clothing-photos.md), [contracts/c2-photo-step.md](contracts/c2-photo-step.md), [quickstart.md](quickstart.md)

**Tests**: Required (Constitution II).
- Each test task comes before the implementation task it covers.
- Run the test and confirm it fails for the expected reason (Red) before implementing.
- An assertion over new behavior that passes on first run is a planning defect; report it.
- Assertions over unchanged 010 behavior are labelled `(regression guard)`.
- Layout at 360–430 px, the native picker, real canvas compression, and real image rendering through the rewrite are verified manually (quickstart).

**Delegates** (AGENTS.md, same rules as `specs/010-upload-photo-frontend/tasks.md` "Delegates"):
- Only `test-author` edits test files.
- `implementer-fe` edits `frontend/` and `implementer-be` edits `backend/`. The orchestrator edits neither.
- Every test → implementation cycle ends with a `commit-reviewer` review and a commit. Never commit a Red state alone.
- Before each delegation, call Paseo `list_profiles` and pass the selected profile's settings to `create_agent`.
- Frontend checks: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`.
- Backend checks: `cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`.
- Give frontend delegates plan.md, research.md, data-model.md, `contracts/c2-photo-step.md`, and `docs/rules/dev/frontend/`. They follow `frontend/AGENTS.md`: read `frontend/node_modules/next/dist/docs/` for `rewrites`, and run `pnpm exec astryx component <Name>` before using a component.
- Give backend delegates plan.md, research.md, data-model.md, `contracts/register-clothing-photos.md`, the 011 artifacts, and `docs/rules/dev/backend/`.
- Screen tests keep 010's mock boundary: mock only `@/lib/api/client` (`apiFetch`). The one exception is `compressPhoto` from `@/lib/photo/compress`. It is the canvas adapter, and jsdom has no canvas (Constitution IV). Its pure `compressToLimit` stays unmocked in its own test.

**Organization**: Grouped by user story (US1–US4 from spec.md).
- US1–US3 and the frontend half of US4 depend only on `main`.
- The backend half of US4 (Phase 7) requires 011 merged into `main` (research R8).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4

---

## Phase 1: Setup

- [X] T001 Run `cd frontend && pnpm install && pnpm lint && pnpm typecheck && pnpm test` and `cd backend && uv sync && uv run pytest` on the branch base, and record the baseline pass in `specs/012-fix-photo-upload/quickstart.md` "Implementation evidence" (no code change)

---

## Phase 2: Foundational

None. Each story touches separate modules, and the shared 010 modules (`apiFetch`, `useUploadPhotoMutation`, `getPhotoUploadFailure`, `parsePhoto`) are reused unchanged.

---

## Phase 3: User Story 1 — Uploaded photo is visible after success (Priority: P1) 🎯 MVP

**Goal**: The ready state renders the server image. A load failure shows a non-blocking message.

**Independent Test**: Quickstart scenario 1. Upload a 2 MB JPEG: the image renders, and `photo.url` opens directly.

**Note**: The root-cause fix is a Next config rewrite. Its reproducing test (Constitution II) asserts the rewrite entry. Real rendering through the rewrite is also checked manually with quickstart scenario 1, before the change (alt text only) and after it (image).

- [X] T002 [US1] Write the US1 tests — agent: `test-author`:
  - Create `frontend/src/next-config.test.ts` (inside the Vitest `include` `src/**/*.test.{ts,tsx}`). Import `nextConfig` from `../next.config` and assert that `await nextConfig.rewrites?.()` contains `{ source: '/api/v1/photos/:photoId', destination: 'http://api.test/api/v1/photos/:photoId' }`. `http://api.test` comes from the Vitest `env` in `frontend/vitest.config.mts`. This is the reproducing test for the bug.
  - Add a "US1 display fallback" `describe` to `frontend/src/components/clothing/PhotoUploadScreen.test.tsx`. After a successful upload, fire `error` on the `img` named "Uploaded clothing photo". Assert that "This photo could not be displayed." is visible and that [Remove] is still enabled. [Change photo] still exists until T015 replaces it.
  - Run both tests and confirm they fail.
- [X] T003 [US1] Implement — agent: `implementer-fe`:
  - In `frontend/next.config.ts`, add `async rewrites() { return [{ source: '/api/v1/photos/:photoId', destination: \`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/photos/:photoId\` }]; }` (research R1).
  - In `frontend/src/components/clothing/PhotoUploadScreen.tsx`, add `onError` on the ready `<img>` that sets a `displayFailed` flag and renders "This photo could not be displayed.". Keep the held photo and its actions.
  - Before and after the change, record quickstart scenario 1 results in `specs/012-fix-photo-upload/quickstart.md`.
  - Both T002 tests must pass.
- [X] T004 [US1] Review and commit T002–T003 — agent: `commit-reviewer`

---

## Phase 4: User Story 3 — ".jpg" photos are accepted (Priority: P2)

This story is small and has no dependencies. It runs before US2 because US2 changes the same validation file.

**Goal**: `image/jpg` and `.jpg`/`.JPG` pass the local check and the picker. The copy names JPG.

**Independent Test**: Quickstart scenario 4.

- [X] T005 [P] [US3] In `frontend/src/lib/validation/photo.test.ts` — agent: `test-author`:
  - `{ type: 'image/jpg', name: 'a.jpg' }` → `ok: true`.
  - `{ type: '', name: 'B.JPG' }` → `ok: true`.
  - The reject message is exactly `'Use a JPG/JPEG, PNG, or WebP photo.'`; update the existing expectations at lines 32 and 51.
  - In `frontend/src/components/clothing/PhotoUploadScreen.test.tsx`, assert the interim help text `'Use a JPG/JPEG, PNG, or WebP photo of 10 MB or less.'` (lines 60, 125; T014 replaces it with the final copy) and the file input `accept` attribute `'image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp'`.
  - Leave the server-provided `UNSUPPORTED_MEDIA_TYPE` message at line 210 unchanged (regression guard).
  - Run and confirm the tests fail.
- [X] T006 [US3] Implement — agent: `implementer-fe`:
  - In `frontend/src/lib/validation/photo.ts`, accept `'image/jpg'` alongside `ALLOWED_PHOTO_TYPES`. Keep `ALLOWED_PHOTO_TYPES` as the server's types, because `Photo.contentType` relies on it; add a local `ACCEPTED_FILE_TYPES` instead.
  - Change the reject message to `'Use a JPG/JPEG, PNG, or WebP photo.'`.
  - In `PhotoUploadScreen.tsx`, set `FILE_ACCEPT` and `HELP_TEXT` to the values in T005.
  - T005 must pass.
- [X] T007 [US3] Review and commit T005–T006 — agent: `commit-reviewer`

---

## Phase 5: User Story 2 — Photos over 10 MB are compressed (Priority: P1)

**Goal**: A file over `MAX_PHOTO_BYTES` (10485760) is compressed on the device to 10 MB or less and then uploaded. A file of 10 MB or less is uploaded unchanged.

**Independent Test**: Quickstart scenarios 2–3.

- [X] T008 [P] [US2] Create `frontend/src/lib/photo/compress.test.ts` against the planned `compressToLimit(encode, { maxBytes, width, height })` (research R2) — agent: `test-author`. The injected `encode(width, height, quality) => Promise<Blob>` is a fake that returns blobs of chosen sizes.
  - Tries qualities `0.9, 0.8, 0.7, 0.6` at full size first and returns the first blob `<= maxBytes`.
  - Then scales the longest side by `0.8` per step, retrying qualities, until the longest side would drop below `1600` (or below the original longest side if it is already under 1600).
  - Returns `{ ok: false, message: 'This photo is too large. Choose a smaller photo.' }` when nothing fits.
  - A blob of exactly `maxBytes` is accepted.
  - Run and confirm the tests fail.
- [X] T009 [P] [US2] In `frontend/src/lib/validation/photo.test.ts` — agent: `test-author`. Replace the `10485761 → 'Choose a photo of 10 MB or less.'` case (line 19–20) with `10485761 → ok: true`, because oversize is now handled by compression. Keep the empty-file and type cases (regression guard). Run and confirm it fails.
- [X] T010 [US2] Add a "US2 compression" `describe` to `frontend/src/components/clothing/PhotoUploadScreen.test.tsx` — agent: `test-author`. Mock `@/lib/photo/compress`'s exported `compressPhoto(file)` (the canvas adapter), in addition to `apiFetch`.
  - An 11 MB `image/jpeg` shows "Preparing photo…" (`role="status"`), then uploads the mocked compressed `File` (assert the `FormData` `file` is that object).
  - A 10485760-byte file calls `compressPhoto` 0 times and uploads the original.
  - When `compressPhoto` resolves `{ ok: false, message }`, `apiFetch` is never called for photos, and the message is shown at the input with [Choose another photo].
  - While compressing, [Remove], [Try again], and the file input are disabled.
  - Replace the old `'Choose a photo of 10 MB or less.'` row at line 195.
  - Run and confirm the tests fail.
- [X] T011 [US2] Implement — agent: `implementer-fe`:
  - Create `frontend/src/lib/photo/compress.ts` exporting:
    - `compressToLimit`: pure, satisfies T008.
    - `compressPhoto(file: File): Promise<{ ok: true; file: File } | { ok: false; message: string }>`: decodes with `createImageBitmap(file, { imageOrientation: 'from-image' })`, draws to a canvas, and encodes with `canvas.toBlob(..., 'image/jpeg', q)`. It returns `new File([blob], '<base>.jpg', { type: 'image/jpeg' })`, and returns `ok: false` with the same message on any decode error.
  - Remove the size branch from `validatePhotoFile` in `frontend/src/lib/validation/photo.ts`.
  - In `PhotoUploadScreen.tsx`, call `compressPhoto` when `file.size > MAX_PHOTO_BYTES` and show a `preparing` view before uploading.
  - T008–T010 must pass.
- [ ] T012 [US2] (Review and commit done; on-device manual run pending) Manually run quickstart scenarios 2–3 on a phone or emulator: request size ≤ 10 MB, the image stays upright, and SC-003 timing is under 5 s for a 12–20 MB photo. Record the results in `specs/012-fix-photo-upload/quickstart.md`. Then review and commit T008–T012 — agent: `commit-reviewer`

---

## Phase 6: User Story 4 (frontend) — Up to 10 photos, two-step C2 (Priority: P1)

**Goal**: Step 1 holds 1–10 photos in a sequential queue with per-item lock, remove, and retry. [Next] is gated on all photos being ready. Step 2 is a placeholder with [Back] (`contracts/c2-photo-step.md`).

**Independent Test**: Quickstart scenarios 5–8.

- [ ] T013 [P] [US4] Create `frontend/src/lib/photo/queue.test.ts` against the planned pure reducer `photoQueueReducer(state, action)` and helpers in `frontend/src/lib/photo/queue.ts`, with the state shape exactly as in data-model.md (`PhotoItem.status: 'waiting' | 'preparing' | 'uploading' | 'ready' | 'failed'`, `items.length <= 10`, `step: 1 | 2`) — agent: `test-author`:
  - `add` with 12 files to an empty state keeps the first 10 as `waiting` in order and returns `skipped: 2`. `add` at 10 items adds none.
  - `nextToStart(state)` returns the first `waiting` item only when no item is `preparing` or `uploading`. Otherwise it returns `null`.
  - The transitions `start`, `prepared`, `uploaded(photo)`, and `failed(message)` apply only to the matching key.
  - `remove` is a no-op on a `preparing` or `uploading` item and removes any other item.
  - `retry` moves a `failed` item to the end of the queue as `waiting`.
  - `canProceed` is `items.length >= 1 && every item ready`.
  - `next` sets `step: 2` only when `canProceed`. `back` sets `step: 1` and keeps the items.
  - Run and confirm the tests fail.
- [ ] T014 [US4] Rework `frontend/src/components/clothing/PhotoUploadScreen.test.tsx` for the list UI (`contracts/c2-photo-step.md`) — agent: `test-author`.
  - New "US4 multiple photos" `describe`:
    - Choose 3 files at once (`userEvent.upload(input, [f1, f2, f3])`, input has `multiple`). Assert that `apiFetch` photo calls happen one at a time in order: the second starts only after the first promise resolves (use deferred promises). Assert the counter "3 / 10 photos".
    - 12 files → 10 items and "2 photos were not added because the limit is 10.".
    - At 10, the add control is disabled.
    - [Remove] on the uploading item is disabled, while [Remove] on a waiting or ready item works.
    - When one upload is rejected with `NETWORK_ERROR`, only that item shows the error with [Try again], later items still upload, [Next] is disabled, and "Some photos failed to upload. Try again or remove them." is shown. Retry turns it ready and enables [Next].
    - [Next] shows "Step 2 of 2: Details" with the photos in order, the first labeled "Main photo". [Back] returns with the items kept.
  - Help text is exactly `'Add up to 10 JPG/JPEG, PNG, or WebP photos. Photos over 10 MB are compressed.'`, and the input label is "Clothing photos".
  - There is no [Change photo] button; adding uses the file input or [Add photo].
  - Update the existing US1–US3 single-photo assertions to the per-item equivalents. Keep the closed, no-access, and not-found screen replacements as `(regression guard)`.
  - Run and confirm the tests fail.
- [ ] T015 [US4] Implement — agent: `implementer-fe`:
  - Create `frontend/src/lib/photo/queue.ts` satisfying T013.
  - Rewrite `frontend/src/components/clothing/PhotoUploadScreen.tsx` around `useReducer(photoQueueReducer)`:
    - One effect starts `nextToStart`. It compresses with `compressPhoto` when over 10 MB, then calls `uploadMutation.mutateAsync`.
    - Event-level failures (`closed` / `no-access` / `not-found` from `getPhotoUploadFailure`) keep replacing the screen as in 010. Per-photo failures set `failed(message)`.
    - Revoke each `previewUrl` on remove and on unmount.
    - Ignore results after unmount.
    - Use one `role="status"` live region, and move focus to a newly failed item's error.
    - Keep the per-item `onError` fallback from T003 and render ready photos through one shared fragment, so the closed-event view also shows "This photo could not be displayed." (T004 review finding: the closed branch lacked it).
  - T013–T014 must pass.
- [ ] T016 [US4] Manually run quickstart scenarios 5–8 at 360 px and 430 px widths, including no horizontal scrolling and 44×44 px touch targets. Record the results, then review and commit T013–T016 — agent: `commit-reviewer`

---

## Phase 7: User Story 4 (backend) — `photoIds` registration and `photos[]` responses (Priority: P1)

**Blocked until** 011 (`speckit-specify-register-read-clothing`) is merged into `main` and this branch is rebased onto it (research R8).

**Goal**: Registration attaches 1–10 ordered photos all or none. Every `Clothing` response returns `photos[]` (`contracts/register-clothing-photos.md`).

**Independent Test**: Quickstart scenario 9, plus the backend suite.

- [ ] T017 [P] [US4] Extend `backend/tests/test_migrations.py` — agent: `test-author`:
  - After `upgrade head`, `photos` has nullable `clothing_id` (FK `clothes.id`) and nullable `position`, with a unique constraint on `(clothing_id, position)` (inserting a duplicate pair raises `IntegrityError`).
  - `clothes` has no `photo_id` column.
  - Backfill: a `clothes` row created at 011's revision with `photo_id = P` becomes, after upgrade, a `photos` row `P` with `clothing_id` = that garment and `position = 0`.
  - `downgrade` restores `clothes.photo_id` from the `position = 0` rows.
  - Run and confirm the tests fail.
- [ ] T018 [P] [US4] Rewrite `backend/tests/api/test_register_clothing.py` for `{"photoIds": [...], "description"}` — agent: `test-author`:
  - 1 photo and 10 photos → `201`.
  - `photos` equals `[{id, url}]` in request order, and `photos[i].url` equals each upload response `url`.
  - The `Clothing` keys are exactly 011's with `photos` replacing `photo`.
  - Each photo row has `clothing_id` and `position == index`.
  - Run and confirm the tests fail.
- [ ] T019 [P] [US4] Rewrite `backend/tests/api/test_register_clothing_rejections.py` — agent: `test-author`. Assert that the `clothes` row count and every photo's `clothing_id` are unchanged after each case:
  - `photoIds` missing or `[]` → `422 VALIDATION_ERROR` with `details.fields == [{"field":"photoIds","reason":"required"}]`.
  - 11 IDs → `reason: "too_long"`.
  - A duplicate ID → `reason: "invalid"`.
  - Legacy `photoId` → a `details.fields` entry `{"field":"photoId","reason":"unknown_field"}`.
  - One unknown, malformed, foreign-event, or other-participant ID among valid ones → identical `404`s.
  - One already-attached ID among unattached ones → `409 PHOTO_ALREADY_ATTACHED`, and the unattached ones stay unattached (all or none).
  - Keep 011's validation-before-auth and closed-before-photo-check cases (regression guard).
  - Run and confirm the tests fail.
- [ ] T020 [P] [US4] Update `backend/tests/services/test_register_clothing.py` and `backend/tests/api/test_openapi_contract.py` — agent: `test-author`:
  - Race test: after validation, another transaction attaches one of the photos, so the conditional `UPDATE` affects 0 rows. Assert it raises `PhotoAlreadyAttachedError` and that no garment row or attachment remains.
  - OpenAPI: the `registerClothing` request requires `photoIds` (`type: array`, `minItems: 1`, `maxItems: 10`, items `string`), has no `photoId`, and has `additionalProperties: false`. The `Clothing` schema has `photos` (array of `ClothingPhoto`) and no `photo`.
  - Update the list and get tests (`test_list_clothing.py`, `test_get_clothing.py`) to read `photos[0]`.
  - Run and confirm the tests fail.
- [ ] T021 [US4] Implement — agent: `implementer-be`:
  - Add a new Alembic revision in `backend/alembic/versions/` with `down_revision` = 011's create-clothes revision, following data-model.md "Migration" (`batch_alter_table` for SQLite).
  - `backend/app/models/photo.py`: add `clothing_id` and `position` plus `UniqueConstraint("clothing_id", "position")`.
  - `backend/app/models/clothing.py`: remove `photo_id`.
  - `backend/app/repositories/photo.py`: add `attach(s, photo_id, clothing_id, position) -> bool`, a conditional `UPDATE … WHERE clothing_id IS NULL` that returns whether exactly 1 row changed. Remove `clothing_repo.photo_is_attached`. Add `photos_for(s, clothing_ids)`, ordered by `position`.
  - `backend/app/schemas/clothing.py`: `photo_ids: list[str] = Field(min_length=1, max_length=10)` with a duplicate-rejecting validator; `photos: list[ClothingPhoto]` replaces `photo`.
  - `backend/app/services/clothing.py`, in the existing single `Db.write()`, in this order: event → active → every photo exists with `event_id == event.id` and `uploader_id == participant.id` (else `NotFoundError`) → insert the garment → `attach` each photo in order, raising `PhotoAlreadyAttachedError` if any returns `False` so the transaction rolls back. The list and get responses build `photos` with one batched query (no N+1).
  - `backend/app/api/errors.py`: map list `too_short` → `required` and list `too_long` → `too_long`. Report the field `photoIds`, not the item index.
  - T017–T020 must pass.
- [ ] T022 [US4] Update the docs to the new contract (no tests) — agent: `implementer-be`:
  - `docs/plans/api/06-register-read-clothing.md`: `photoId` → `photoIds`, `photo` → `photos`, plus the rules from `contracts/register-clothing-photos.md`.
  - `specs/011-register-read-clothing/contracts/register-read-clothing.openapi.yaml`: same changes.
  - `postman/collections/Vintage Relay API/03 Clothing/Register clothing with attached photo.request.yaml`: body `photoIds: [...]`.
- [ ] T023 [US4] Review and commit T017–T022 — agent: `commit-reviewer`

---

## Phase 8: Polish & Cross-Cutting

- [ ] T024 Run the full suites, `cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest` and `cd frontend && pnpm lint && pnpm typecheck && pnpm test`, then run all quickstart scenarios 1–9 against a fresh `alembic upgrade head` database. Record the actual results in `specs/012-fix-photo-upload/quickstart.md` "Implementation evidence".
- [ ] T025 Confirm 010 SC-006 / 010 FR-012 (credential and image bytes absent from app logs) still holds during scenario 5 by inspecting the browser console and backend logs, and record the result in `specs/012-fix-photo-upload/quickstart.md`
- [ ] T026 Run `pr-reviewer` on `main..HEAD` before creating the PR (AGENTS.md "Code Review") — agent: `pr-reviewer`

---

## Dependencies & Execution Order

- T001 → Phase 3 (US1) → Phase 4 (US3) → Phase 5 (US2) → Phase 6 (US4 frontend). Sequential, because all four touch `PhotoUploadScreen.tsx` and its test file.
- Phase 7 (US4 backend) is independent of Phases 3–6 but is **blocked on 011 merging**. It can run in parallel with the frontend phases once unblocked.
- Phase 8 runs after everything else.
- Within a phase: test tasks → implementation → review/commit.

### Parallel opportunities

- US2: T008 ∥ T009 (different test files). T010 follows, because it edits the shared screen test file.
- US3: T005 is a single task. It is parallel only with Phase 7 tasks.
- US4 frontend: T013 can be written while T014 is drafted, because they are different files.
- US4 backend: T017 ∥ T018 ∥ T019 ∥ T020 (different test files).
- Frontend (Phases 3–6) ∥ backend (Phase 7), with different agents and directories.

## Implementation Strategy

1. **MVP = US1** (T002–T004). The broken image is the visible defect; it ships alone.
2. Then US3 (tiny), then US2 (unblocks large phone photos), each one a commit.
3. Then US4 frontend. It is usable for uploading up to 10 photos even before the backend change, because step 2 is a placeholder.
4. Then US4 backend once 011 lands, and the PR after Phase 8.
