# Tasks: Upload Photo (Backend)

**Input**: Design documents from `specs/009-upload-photo/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [operation contract](contracts/upload-photo.openapi.yaml), [quickstart.md](quickstart.md), and `.specify/memory/constitution.md`.

**Tests**: Required. Every production behavior change follows test-author Red → implementer-be Green → Refactor. Every test that covers a behavior is written and confirmed failing before the implementation task that introduces that behavior; no behavior is first tested after its commit. Never delete or skip failing tests; genuinely unimplemented cases use `xfail(reason=...)`.

**Organization**: No endpoint exists until its checks exist: domain helpers, error classes, and the photos table land before any route, and the first upload commit already enforces auth, scope, closure, size, and type rules with atomicity and logging tests. The public serve route lands first because it is safe (404 until rows exist) and the upload cycle needs it for its viewability assertions. US1, US2, and US3 share the upload cycle because shipping upload without rejections or logging would violate Constitution I or II.

## Format: `[ID] [P?] [Story] Description`

- Paths are relative to the repository root. `[P]` marks test-author work on disjoint files that may run together; it never permits parallel production implementers in one workspace.
- Do not add object storage, signed URLs, cleanup jobs, HEIC support, multiple photos per garment, participant/garment limits, or frontend changes.

## Execution Rules

The orchestrator writes Spec Kit artifacts only. Before each delegation, call Paseo `list_profiles`, read notes, and pass the selected profile's provider/model/modeId/thinkingOptionId/featureValues to `create_agent`. Required profiles: `test-author`, `implementer-be`, `commit-reviewer`; a missing profile stops that cycle. Use this feature's workspace, one implementer at a time; delegates must not delegate.

Each prompt includes the task IDs/text, allowed paths, this feature's artifacts, `AGENTS.md`, `docs/rules/dev/common/api-contract.md`, `docs/rules/dev/common/testing.md`, `docs/rules/dev/backend/` (all), and `docs/plans/api/05-upload-photo.md`. Test authors may edit `backend/tests/**` only (plus `uv add pillow` is the implementer's job, never the test author's); implementers may edit only the named paths under `backend/app/**` and `backend/alembic/**`, and may run `uv add pillow` once. Reviewers are read-only.

Each **review** task closes its cycle: run focused tests and the full backend checks, have the orchestrator rerun them, then obtain a fresh `commit-reviewer` OCR delegate review (`ocr delegate preview --format json`, `ocr delegate rule --format json <paths>`) of the exact commit content in the same workspace, with English findings (severity, file/line, trigger/impact, fix) and coverage. Resolve Critical/High findings, rerun checks, obtain re-review, then commit the green cycle. Never commit Red alone; do not create empty commits. PR work needs a separate `pr-reviewer` and is not authorized by this list.

**Log assertions**: tests that inspect logs filter `caplog.records` to application loggers (`record.name.startswith("app.")`). Format filtered records with both `JsonFormatter` and `TextFormatter` from `backend/app/core/logging.py` when checking for raw values.

Full backend checks:

```bash
cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

## Phase 1: Setup

- [X] T001 Verify branch `009-upload-photo` and `.specify/feature.json` pointing to `specs/009-upload-photo`; run the full backend checks and record the baseline results in `specs/009-upload-photo/quickstart.md` under a new "Implementation Evidence" section.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Image helpers, error classes, storage setting, and the photos table, all before any endpoint exists.

### Domain helpers, errors, and settings

- [X] T002 [P] Have `test-author` add unit tests in `backend/tests/unit/test_photo_image.py` for planned helpers in `backend/app/domain/photos.py`: `MAX_PHOTO_BYTES == 10485760`; `verify_image(raw: bytes)` returning `"image/jpeg"` / `"image/png"` / `"image/webp"` for real minimal images of each format and raising for text bytes, renamed-extension bytes, HEIC bytes (a `ftyp` box declaring the `heic` brand, e.g. size-prefixed `b"ftypheic"` payload), and truncated/corrupt bytes; `normalize_image(raw: bytes)` returning bytes that Pillow opens upright with an empty EXIF (input fixture: JPEG with orientation 6 and a GPS tag); `extension_for_format` mapping exactly `{"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}`. Run; confirm failure from the missing module.
- [X] T003 [P] Have `test-author` extend `backend/tests/unit/test_errors.py` for planned `PhotoTooLargeError` (413, `FILE_TOO_LARGE`, message naming the 10 MB limit, `details == {"maxBytes": 10485760}`) and `UnsupportedPhotoTypeError` (415, `UNSUPPORTED_MEDIA_TYPE`, `details == {"allowedTypes": ["image/jpeg", "image/png", "image/webp"]}`), both `AppError` subclasses; and extend `backend/tests/unit/test_config.py` for a planned `photo_dir` setting (default under `data/`, overridable, directory ensured at application startup before serving). Run; confirm failure.
- [X] T004 Have `implementer-be` satisfy T002–T003: run `uv add pillow`; create `backend/app/domain/photos.py` (`MAX_PHOTO_BYTES`, `verify_image`, `normalize_image`, `extension_for_format`); add both error classes to `backend/app/domain/errors.py`; add `413` and `415` entries to `_ERROR_DESCRIPTIONS` in `backend/app/api/errors.py`; map multipart parse failures to `400 BAD_REQUEST` through the existing error envelope in `backend/app/api/errors.py`; add `photo_dir` to `backend/app/core/config.py` (directory ensured at application startup before serving).
- [X] T005 Review and commit the T002–T004 cycle under Execution Rules.

### Photos table, repository, and schema

- [X] T006 [P] Have `test-author` extend `backend/tests/test_migrations.py`: after `upgrade head`, table `photos` exists with columns `id`, `event_id`, `uploader_id`, `storage_location` (unique), `content_type`, `size_bytes`, `created_at`; `downgrade` to its recorded `down_revision` removes it. Add `backend/tests/services/test_photo_repository.py` asserting round-trip `add`/`get` through the `db` fixture (`Base.metadata.create_all`) and that a duplicate `storage_location` raises `IntegrityError`. Run; confirm failure.
- [X] T007 Have `implementer-be` satisfy T006: add `Photo` to `backend/app/models/photo.py` (String(36) UUID PK, FKs to events/participants, unique `storage_location`, `content_type`, `size_bytes`, tz-aware `created_at`, index on `event_id`); add an Alembic revision under `backend/alembic/versions/` creating it in `upgrade()` and dropping it in `downgrade()`; add `add`/`get_by_id` to `backend/app/repositories/photo.py`; add the `Photo` response (`id`, `url`, `contentType`, `sizeBytes`, `createdAt`) as an `ApiModel` in `backend/app/schemas/photo.py`.
- [ ] T008 Review and commit the T006–T007 cycle under Execution Rules.

**Checkpoint**: Image verification, error vocabulary, settings, and storage exist; no endpoint behavior changed.

## Phase 3: User Story 1 - Participant uploads a clothing photo while describing the garment (Priority: P1)

**Goal**: Public `GET /api/v1/photos/{photo_id}` serving stored bytes, proven first so the upload cycle can assert viewability.

**Independent Test**: Seed a photo row and file, fetch the bytes without a credential, and fetch an unknown ID.

### Tests for the serve route (write first)

- [ ] T009 [P] [US1] Have `test-author` add `backend/tests/api/test_view_photo.py`: seeded JPEG row → `GET /api/v1/photos/{id}` returns 200 with the exact stored bytes and `content-type: image/jpeg`, no `Authorization` header sent; the same request with `Authorization: Bearer garbage` still returns 200; an unknown UUID returns 404 `NOT_FOUND` with message exactly "Resource not found." and an `X-Request-ID` header. Run; confirm failure (route missing).
- [ ] T010 [P] [US1] Have `test-author` extend `backend/tests/api/test_openapi_contract.py`: `viewPhoto` at `/api/v1/photos/{photo_id}` GET has no security requirement and documents 200/404/500. Run; confirm failure.

### Implementation for the serve route

- [ ] T012 [US1] Have `implementer-be` satisfy T009–T010: add router `backend/app/api/routers/photos.py` (prefix `/photos`, tag `photos`, `operation_id="viewPhoto"`, `error_responses(404, 500)`, no auth dependency) returning the stored file with its stored content type; include it in `backend/app/main.py`.
- [ ] T013 Review and commit the T009–T012 cycle under Execution Rules.

**Checkpoint**: Public byte serving works and hides unknown IDs; no upload path exists yet.

## Phase 4: User Stories 1, 2 & 3 - Upload, reject invalid uploads, stay private and traceable (Priority: P1/P2) 🎯 MVP

**Goal**: `POST /api/v1/events/{event_id}/photos` stores one verified photo per request (201 `Photo`) and, in the same commit path, rejects malformed, oversized, disguised, unauthorized, out-of-scope, and closed-event uploads without rows, partial files, or log leaks, recording exactly one `photo_uploaded` entry per success.

**Independent Test**: Upload valid JPEG/PNG/WebP and view each at its URL; attempt every rejection class; inspect stored rows, disk state, and application logs.

### Tests for User Stories 1, 2 & 3 (write first)

- [ ] T011 [P] [US1] Have `test-author` extend `backend/tests/api/test_openapi_contract.py`: `uploadPhoto` at `/api/v1/events/{event_id}/photos` POST documents a `multipart/form-data` body with a binary `file` part and responses 201/400/401/404/409/413/415/422/500. Run; confirm failure.
- [ ] T014 [P] [US1] Have `test-author` add `backend/tests/api/test_upload_photo.py`. Success: JPEG, PNG, and WebP uploads each return 201 with exactly keys `id`, `url`, `contentType`, `sizeBytes`, `createdAt`; `url` matches `app_base_url + /api/v1/photos/{id}` and fetching it without a credential returns the stored bytes; a JPEG fixture with orientation 6 and a GPS tag is stored upright with no EXIF; identical bytes uploaded twice yield different `id`s; the row carries the event, the uploader, a `<uuid>.<ext>` storage key (extension from verified format, never the client filename), verified type, and stored size; exactly-10 MiB input is accepted. Run; confirm failure from the missing route.
- [ ] T015 [P] [US2] Have `test-author` add `backend/tests/api/test_upload_photo_rejections.py`: `file` part missing and zero-byte file → 422 `VALIDATION_ERROR`; non-multipart garbage body → 400; 10 MiB + 1 byte → 413 `FILE_TOO_LARGE` with `details == {"maxBytes": 10485760}` even when the declared length understates it; renamed-extension text bytes and `.heic` bytes → 415 `UNSUPPORTED_MEDIA_TYPE` with the exact `allowedTypes` list; missing/invalid token → 401; nonexistent UUID, malformed `event_id`, and a token from another event → 404s with identical status, `code`, `message`, and `details` excluding `requestId`; after closing the event, correct token → 409 `EVENT_CLOSED` (wrong token still 404); photo row count and directory listing unchanged after every rejection. Run; confirm failure from the missing route.
- [ ] T016 [P] [US3] Have `test-author` add `backend/tests/services/test_upload_photo.py` with injected clock: success returns the `Photo` fields and one `photo_uploaded` record (filtered to application loggers) with exactly `event_id`, `participant_id`, `photo_id`, `size_bytes`, `content_type`; monkeypatch a failure after the file write flushes → 500 propagates, the file is deleted, zero rows, no `photo_uploaded`; storage failure → 500 with no row; no formatted record contains image bytes or the participant token. Ordering with two threads and handshake events (following `backend/tests/services/test_join_event_concurrency.py`, finite timeouts; pause inside the upload's write transaction by wrapping `photo_repo.add` with the handshake events): upload-first — the upload holds its write lock while the close waits on `BEGIN IMMEDIATE` → 201 and the close succeeds after; close-first — the close holds its write lock while the upload waits → the upload raises `EventClosedError` with zero new rows. Run; confirm failure.
### Implementation for User Stories 1, 2 & 3

- [ ] T017 [US1] Have `implementer-be` satisfy T011 and T014–T016: add `PhotoService.upload(event_id, participant, upload)` in `backend/app/services/photo.py`, constructed as `PhotoService(db, settings, clock, photo_id_generator)` mirroring the `EventService` seams (injected clock for `created_at`, injected UUID generator for `photos.id` and the storage key), using one `Db.write()`: closed event → existing `EventClosedError` → early 413 on declared over-limit length → chunked streaming with 413 past `MAX_PHOTO_BYTES` (partial chunks discarded) → `verify_image`/`normalize_image` (failures → `UnsupportedPhotoTypeError`) → write `<uuid>.<ext>` under `photo_dir` → `photo_repo.add` (on failure best-effort delete the file) → after commit `logger.info("photo_uploaded", extra={...})` → build the `Photo` schema with the public URL. Add the route in `backend/app/api/routers/events.py` (`status_code=201`, `operation_id="uploadPhoto"`, `error_responses(400, 401, 404, 409, 413, 415, 422, 500)`, `CurrentParticipant` with the path param named `event_id`); satisfy the multipart OpenAPI attention noted in `backend/app/main.py`.
- [ ] T018 Review and commit the T011/T014–T017 cycle under Execution Rules.

**Checkpoint**: Upload, rejection, privacy, and traceability all work from the first upload commit.

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T019 Run the full backend checks (reruns every test above, including streaming-abort, EXIF, atomicity, close-during-upload ordering, and logging); then run the [quickstart](quickstart.md) manual scenarios against a fresh SQLite file and record actual results in `specs/009-upload-photo/quickstart.md` "Implementation Evidence". Frontend is unchanged by this feature; run `cd frontend && pnpm lint && pnpm typecheck && pnpm test` once to confirm no regression and record results.
- [ ] T020 Update `specs/009-upload-photo/spec.md` Assumptions only if implementation revealed a deviation (e.g. the exact Starlette multipart exception type), then review and commit documentation changes under Execution Rules.

## Dependencies & Execution Order

- Setup (T001) → domain/errors/settings (T002–T005) → table/repo/schema (T006–T008) → serve (T009–T013) → upload with US1/US2/US3 (T011/T014–T018) → Polish (T019–T020).
- Helpers, errors, and the table precede any route so no committed state accepts unverified bytes. Serve precedes upload so viewability is proven before the upload assertions depend on it. T010 covers serve-only; T011 covers upload-only, so every commit is green.

## Parallel Opportunities

- T002 ‖ T003 (disjoint unit test files).
- T009 ‖ T010 (disjoint test files).
- T011 ‖ T014 ‖ T015 ‖ T016 (four disjoint test files).
- T006 runs alone. Implementation tasks are sequential (one implementer per workspace).

## Implementation Strategy

1. **Enabler**: Phases 1–3 deliver safe public byte serving (nothing to serve yet, nothing to leak).
2. Phase 4 delivers complete, safe uploading in one reviewed commit; US1 cannot be committed without US2/US3 checks.
3. Phase 5 reruns everything and records evidence.
4. Report the decided items (public unguessable URLs, indefinite unattached retention, HEIC rejection) and the remaining open decisions (post-closure retention, multiple photos per garment) in the PR description.
