# Implementation Plan: Fix Photo Upload and Support Multiple Photos (C2)

**Branch**: `012-fix-photo-upload` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/012-fix-photo-upload/spec.md`

## Summary

This feature fixes three 010 defects and adds multi-photo garments:

1. **Uploaded image not shown**: the photo URL points at the frontend origin, which never served `/api/v1/photos/*`. Fix with one Next rewrite to the backend (research R1).
2. **Photos over 10 MB**: compress them on the device with the browser's built-in image decoding and canvas encoding, using a quality-then-dimension ladder, before upload (R2).
3. **`image/jpg` and `.jpg`**: accept them locally and in the picker, and update the copy (R3).
4. **1–10 photos per garment**:
   - Backend: replace 011's single `photoId` with ordered `photoIds`, stored as `photos.clothing_id` + `position`, attached all or none (R4, R5).
   - Frontend: C2 becomes two steps. Step 1 is a sequential upload queue with per-photo lock, remove, and retry, and [Next] gated on all ready. Step 2 is a placeholder (R6, R7).

## Technical Context

**Language/Version**: Python 3.14 (backend); TypeScript 5 / React 19.3 / Next 16.4 (frontend)

**Primary Dependencies**: FastAPI, SQLAlchemy 2, Alembic, Pillow (backend); TanStack Query, Astryx 0.7 (frontend). No new dependencies.

**Storage**: SQLite; photo files on local disk (`photo_dir`)

**Testing**: pytest with a fresh SQLite file per test (backend); Vitest for pure logic, with screens checked manually at 360–430 px (frontend)

**Target Platform**: Mobile browsers (iOS Safari, Android Chrome)

**Project Type**: Web application (`backend/` + `frontend/`)

**Performance Goals**: Compression of a 12–20 MB photo takes under 5 s on a mid-range phone (SC-003)

**Constraints**: 10 MB per-photo server limit unchanged; at most 1 upload request in flight; `apiFetch` cannot be cancelled by the caller

**Scale/Scope**: At most 10 photos per garment; one screen (C2); one endpoint changed (`registerClothing`) plus the `Clothing` response shape

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Exchange integrity | Pass | Photo ownership, event, and attach-once rules stay server-enforced in one transaction (R4). |
| II. Test-first | Pass | Each change starts with a failing test. Bug fix US1 starts with a failing `next-config.test.ts` asserting the photo rewrite. The jpg fix starts with a failing `validatePhotoFile('image/jpg')` test. |
| III. Test scope by risk | Pass | Backend: register validation, rejection, and atomicity tests plus a migration test. Frontend: tests for the validation, compression ladder, and queue reducer only. |
| IV. Isolated tests | Pass | The compression ladder uses an injected encoder, so no canvas is needed. Backend tests use `tmp_path` SQLite. |
| V. Simplicity | Pass | No new dependency, no join table, and step 2 stays a placeholder. |

Post-design re-check: still passing, with no violations.

## Project Structure

### Documentation (this feature)

```text
specs/012-fix-photo-upload/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── register-clothing-photos.md   # delta to 011 OpenAPI
│   └── c2-photo-step.md              # C2 UI contract
└── tasks.md                          # /speckit-tasks
```

### Source Code (files touched)

```text
frontend/
├── next.config.ts                                  # US1 rewrite
├── src/next-config.test.ts                         # US1 reproducing test (new)
└── src/
    ├── lib/validation/photo.ts (+ .test.ts)        # US3 image/jpg, copy
    ├── lib/photo/compress.ts (+ .test.ts)          # US2 ladder + canvas adapter (new)
    ├── lib/photo/queue.ts (+ .test.ts)             # US4 reducer (new)
    └── components/clothing/PhotoUploadScreen.tsx   # US1 onError, US4 list/steps (+ test update)

backend/                                            # after 011 merges (R8)
├── alembic/versions/<new>_photos_attach_to_clothing.py
├── app/models/photo.py, app/models/clothing.py
├── app/repositories/clothing.py, app/repositories/photo.py
├── app/schemas/clothing.py                          # photo_ids, photos[]
├── app/services/clothing.py                         # multi attach
├── app/api/errors.py                                # list too_short/too_long reasons
└── tests/ (register, rejections, service, openapi, migrations, list/get shape)

docs/plans/api/06-register-read-clothing.md          # photoIds / photos
specs/011-register-read-clothing/contracts/register-read-clothing.openapi.yaml
postman/collections/Vintage Relay API/03 Clothing/Register clothing with attached photo.request.yaml
```

**Structure Decision**: Use the existing web-app layout. New frontend logic goes in two small pure modules under `frontend/src/lib/photo/`. The screen stays in `PhotoUploadScreen.tsx`.

## Delivery Order

1. **Frontend fixes**: US1 (rewrite + onError), US3 (jpg), US2 (compression). These are independent of 011 and can ship first.
2. **Frontend US4**: queue, two steps, and [Next]. Uses only the upload API, so it is also independent of 011.
3. **Backend US4**: rebase onto `main` after 011 merges. Then the migration, schema, and service changes, followed by docs, the 011 contract, and the Postman request.

## Complexity Tracking

No violations.
