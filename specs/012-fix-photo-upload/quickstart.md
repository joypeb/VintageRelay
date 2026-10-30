# Quickstart: validate 012

## Prerequisites

- `backend/.env`: `APP_BASE_URL=http://localhost:3000`.
- `frontend/.env.local`: `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`.
- Backend US4 checks need 011 merged into `main` first (research R8).
- Run the backend: `cd backend && uv run alembic upgrade head && uv run fastapi dev app/main.py`.
- Run the frontend: `cd frontend && pnpm dev`.
- Create an event, join it, then open C2 (`/events/{id}/my-items/new`) on a 360–430 px viewport.

## Automated checks

- Backend: `uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`.
- Frontend: `pnpm lint && pnpm typecheck && pnpm test`. The tests cover photo validation (`image/jpg`), the compression ladder, and the C2 queue reducer.

## Manual scenarios

| # | Action | Expected |
|---|--------|----------|
| 1 | Upload a 2 MB JPEG | Item turns ready and the **server image renders** (no alt text). Opening `photo.url` in a new tab shows the image. (US1) |
| 2 | Upload a 15 MB JPEG and a 15 MB PNG | Each shows "Preparing photo…", then uploads. DevTools request size is 10 MB or less. Images are upright. (US2) |
| 3 | Upload a decoded-but-huge or non-image `.jpg` over 10 MB | No request is sent; "This photo is too large. Choose a smaller photo." (US2) |
| 4 | Upload `a.jpg`, `B.JPG`, and a file reported as `image/jpg` | All are accepted. (US3) |
| 5 | Pick 12 photos at once | 10 items are added, with "2 photos were not added…". They upload one at a time; Network shows at most 1 upload request in flight. (US4) |
| 6 | Remove a waiting item and a ready item during uploads | Only those items go away. The active item cannot be removed. (FR-018) |
| 7 | Go offline mid-queue, then back online | The failed item shows [Try again]; [Next] is disabled with the failure message. Retry turns it ready. |
| 8 | All ready → [Next] → [Back] | Step 2 shows the photos in order; Back keeps them. |
| 9 | API: register with 3 `photoIds` | `201`, `photos` in the same order. Repeating the request gives `409 PHOTO_ALREADY_ATTACHED`. 11 IDs or a duplicate gives `422`. (US4, backend) |

## Implementation evidence

### Baseline (T001, 2026-10-30, base `9a6bef9`)

- Frontend: `pnpm lint` 0 errors (4 pre-existing warnings), `pnpm typecheck` passed, `pnpm test` 28 files / 406 tests passed.
- Backend: `uv run pytest` 270 passed.

### US1 (T003)

- Automated: `next-config.test.ts` and "US1 display fallback" Red before T003 and Green after; frontend 29 files / 408 tests passed, lint 0 errors, typecheck passed.
- HTTP check (scenario 1, API level): backend on :8123 with `APP_BASE_URL=http://localhost:3123`, `next dev` on :3123. Uploaded a PNG; the returned `url` `http://localhost:3123/api/v1/photos/<id>` answered `200 image/png` through the app origin. Before the fix the app origin had no route for this path. The in-browser render on a phone width was not checked here.

### US3 (T005–T006)

- Red: 7 expected failures (copy, `accept`, `image/jpg`). The `B.JPG` with empty type case passed on first run because the existing extension check already lowercases; it is kept as a regression guard (planning defect reported per tasks.md rules).
- Green: frontend 29 files / 411 tests passed, lint 0 errors, typecheck passed. Server-side type is detected from bytes (`backend/app/domain/photos.py`), so an `image/jpg` declared type uploads fine.

### US2 (T008–T011)

- Red: 3 files failed as expected (missing module, oversize still rejected, no preparing state). The 10485760-byte boundary case passed on first run (unchanged behavior, regression guard).
- Green: frontend 30 files / 417 tests passed, typecheck passed, lint 0 errors (11 warnings: 5 `<img>`, 6 unused fake-encoder params in tests).
- Manual scenarios 2–3 and SC-003 timing on a real phone: **not run** in this session (no device). Known risk: iOS Safari limits canvas area (about 16.7M px), so a full-size encode of a 48MP photo may fail and fall back to the "too large" message. Fixed after the T012 review: an encode failure at one size now moves on to the next smaller size (unit-tested); frontend 30 files / 419 tests passed.

### US4 frontend (T013–T015)

- Red: queue module missing; 29 screen tests failing on the new list UI. Follow-up Red: [Add photo] enabled while one photo uploads (FR-018) after removing a global single-`status` assertion.
- Green: frontend 31 files / 427 tests passed, typecheck passed, lint 0 errors (13 warnings).
- `CreateEventScreen.test.tsx` failed once under full-suite load and passed 3/3 alone (pre-existing flake, unrelated).
- T016 review fixes (Red → Green): the queue stops on event-level failure or a shared-event close, URLs for skipped files are revoked, the input error is linked by `aria-describedby`, and a per-key in-flight guard is in place. Frontend 31 files / 434 tests passed.
- Manual scenarios 5–8 at 360/430 px: **not run** in this session.

### Phase 7 backend + T024 (2026-10-30, HEAD `94dfe8a`, fresh `alembic upgrade head` DB at /tmp/vr012-t024)
- Backend: `ruff format --check` 97 files formatted, `ruff check` pass, `mypy app` no issues (41 files), `pytest` 356 passed, 22 warnings.
- Frontend: `pnpm lint` 0 errors (13 warnings), `pnpm typecheck` pass, `pnpm test` 31 files / 434 passed.
- Scenario 9 (fresh migrated DB, organizer token): register with 3 `photoIds` → 201, `photos` in request order, `photos[0].url` equals upload response `url`. Repeat → 409 `PHOTO_ALREADY_ATTACHED`. 12 IDs → 422 `photoIds/too_long`. Duplicate → 422 `photoIds/invalid`. Legacy `photoId` → 422 `photoIds/required` + `photoId/unknown_field`. All asserted in-script (SCENARIO9-OK).
- Backend logs during scenario 9: `photo_uploaded` (ids, size_bytes, content_type), `clothing_registered` (clothing_id, event_id, description_length only). No tokens, no image bytes, no description text — 010 SC-006/FR-012 holds (T025 backend side).
- Manual scenarios 1–8 on a real phone / browser render through the rewrite at 360–430 px: **not run** in this session (no device). US1 app-origin rendering was verified at HTTP level earlier (`200 image/png` through frontend origin).

### T026 pr-reviewer (2026-10-30, `origin/main..1887d22`, 43 files, 100% coverage)
- Verdict: no Critical/High; cleared for PR.
- 1 Low (not fixed, follow-up): `ClothingService.register` raises 409 for an already-attached photo before finishing 404 checks on later IDs, while the OpenAPI/data-model documents 404-then-409 order. No disclosure (early 409 depends only on caller's own photo) and no partial state (rollback). Fix: drop the early `clothing_id is not None` check and let `photo_repo.attach` raise; needs a mixed `[attached, unknown] → 404` test first.
