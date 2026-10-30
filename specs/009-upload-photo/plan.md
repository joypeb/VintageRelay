# Implementation Plan: Upload Photo (Backend)

**Branch**: `009-upload-photo` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-upload-photo/spec.md`

## Summary

Add `POST /api/v1/events/{event_id}/photos` (multipart `file`, JPEG/PNG/WebP verified by decoding, 10 MiB streamed limit, EXIF strip + orientation normalize via Pillow) and public `GET /api/v1/photos/{photo_id}` serving bytes at an unguessable URL. The service stores the processed file under a settings-configured directory, inserts one `photos` row in the same write transaction (best-effort file cleanup on row failure), and logs `photo_uploaded` after commit. Check order follows the API README: parse/validate → auth → event scope → closed → size/type. One migration creates `photos`; `pillow` is the only new dependency.

## Technical Context

**Language/Version**: Existing Python 3.14 baseline (`backend/pyproject.toml`); no version changes.

**Primary Dependencies**: Existing FastAPI, SQLAlchemy 2.x, Pydantic v2, Alembic, plus `pillow` (added via `uv add pillow` for decode-verify, `exif_transpose`, EXIF strip). `python-multipart` already present via `fastapi[standard]`. No other new dependencies.

**Storage**: Existing SQLite (`events`, `participants`; WAL, read `BEGIN`, write `BEGIN IMMEDIATE`) plus one new `photos` table and migration. Image bytes on local filesystem under new `photo_dir` setting; `url` derived from existing `app_base_url` plus `/api/v1/photos/{id}`.

**Testing**: pytest, FastAPI TestClient, real SQLite file per test under `tmp_path` plus tmp photo dir, injected clock, `monkeypatch` failure injection, `caplog`.

**Target Platform**: Existing single-server backend with one Uvicorn worker.

**Project Type**: Web service; backend-only increment.

**Performance Goals**: No new latency target. Oversized bodies abort mid-stream (never fully buffered by the app); the write transaction holds no network I/O.

**Constraints**: Check order parse (400/422) → 401 → 404 scope → 409 closed → 413/415 during/after streaming. Public byte serving with unguessable UUIDs; HEIC rejected; never-attached photos kept. Preserve create/read/close/join behavior.

**Scale/Scope**: Two endpoints, one migration, one new table, one new dependency, zero frontend changes. Participant/garment limits remain undecided.

## Constitution Check

*GATE: Checked before research and re-evaluated after Phase 1 design.*

| Principle | Pre-research assessment | Post-design assessment |
|---|---|---|
| I. Exchange Integrity First | PASS: Closed-event rejection and event-scoped auth are server responsibilities; attachment rules belong to the later clothing feature. | PASS: Membership, scope, and closure share the serialized write transaction, so an upload cannot commit after closure; no duplicate-confirmation surface is touched. |
| II. Test-First | PASS: No application code is written during planning. | PASS: Every behavior (including multipart mapping, streaming abort, EXIF strip, atomicity, and logging) is tested Red before its implementation task; no behavior is first tested after its commit. |
| III. Test Scope by Risk | PASS: Auth scope, disguised files, oversized bodies, and file/DB atomicity are the primary risks. | PASS: API, service, image-unit, migration, and logging tests target them; no numeric coverage goal. |
| IV. Isolated, Deterministic Tests | PASS: Existing fixtures provide isolated SQLite; photo dir joins them under `tmp_path`. | PASS: Tmp SQLite + tmp photo dir per test; Pillow is a local library, no external services. |
| V. Simplicity | PASS: Local disk + one library, no object storage or signed URLs. | PASS: No new tables beyond `photos`, no cleanup job, no rate limiter; undecided retention stays out. |

**Governance outcome**: PASS. All clarify decisions (public unguessable URL, indefinite retention of unattached photos, HEIC rejection) are recorded in the spec; no unresolved clarifications.

## Project Structure

### Documentation (this feature)

```text
specs/009-upload-photo/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/upload-photo.openapi.yaml
├── checklists/requirements.md
└── tasks.md                         # Created by /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── alembic/versions/<rev>_photos.py            # New photos table
├── app/
│   ├── api/
│   │   ├── errors.py                # Add 413/415 descriptions; MultiPartException → 400
│   │   └── routers/
│   │       ├── events.py            # Add POST /{event_id}/photos (201)
│   │       └── photos.py            # New public GET /photos/{photo_id}
│   ├── core/
│   │   ├── config.py                # Add photo_dir setting (+ test)
│   │   └── security.py              # Reuse token hashing (no changes expected)
│   ├── domain/
│   │   ├── errors.py                # PhotoTooLargeError, UnsupportedPhotoTypeError
│   │   └── photos.py                # MAX_PHOTO_BYTES, verify/normalize helpers
│   ├── models/photo.py              # New Photo model
│   ├── repositories/photo.py        # add/get helpers
│   ├── schemas/photo.py             # Photo response (ApiModel)
│   ├── services/photo.py            # upload + serve logic
│   └── main.py                      # Include photos router; multipart OpenAPI attention
└── tests/
    ├── api/
    │   ├── test_upload_photo.py         # Success, boundaries, every rejection, double-upload
    │   ├── test_view_photo.py           # Public bytes, unknown ID 404
    │   └── test_openapi_contract.py     # Extend for both operations
    ├── services/
    │   └── test_upload_photo.py         # Atomicity, cleanup, logging order
    ├── unit/
    │   ├── test_photo_image.py          # Verify/strip helpers, EXIF fixture
    │   └── test_config.py               # Extend for photo_dir
    └── test_migrations.py               # photos table present after upgrade
```

**Structure Decision**: Follow `api → services → repositories → models`. Upload lives with event-scoped collections in `events.py`; serving gets its own `photos.py` router because its resource is top-level and unauthenticated, mirroring the `entry_codes.py` precedent. Image byte logic stays in `domain/photos.py` (pure, unit-testable); orchestration in `services/photo.py`.

## Phase 0: Research

Consolidated in [research.md](research.md), decisions R1–R10. Paseo's `explorer` investigated the same workspace read-only; the orchestrator verified its findings against the code. They agree on reuse points (auth dependency, `Db` transactions, error envelope, logging pattern), the missing pieces (photos table, storage setting, Pillow, multipart precedent), and the streaming/EXIF approach. No unresolved technical clarifications.

## Phase 1: Design

### Service seams

`PhotoService(db, settings, clock, photo_id_generator)` mirrors the `EventService` seams: the injected clock stamps `photos.created_at` and the injected UUID generator supplies both `photos.id` and the `<uuid>` storage key, keeping success paths deterministic under the existing `db`/`settings` fixtures.

### Upload flow

1. Router `POST /{event_id}/photos` accepts an optional `file` part (`File(None)`); absent/empty → `422 VALIDATION_ERROR` via the validation-error path. Unparseable multipart → `400 BAD_REQUEST` via a new `MultiPartException` mapping.
2. `CurrentParticipant` dependency (path param named `event_id`): missing/invalid token → 401; token from another event → 404, identical to a missing/malformed event.
3. `PhotoService.upload(event_id, participant, upload)` opens `Db.write()`:
   1. Load event; closed → `EventClosedError`.
   2. Early 413 if a declared `Content-Length` exceeds `MAX_PHOTO_BYTES`.
   3. Stream chunks; abort 413 (`PhotoTooLargeError`, `details={"maxBytes": 10485760}`) past the limit; partial chunks discarded.
   4. Open bytes with Pillow; unopenable or format outside `{JPEG, PNG, WEBP}` → `UnsupportedPhotoTypeError` (`details={"allowedTypes": [...]}`), covering disguised files and HEIC.
   5. `exif_transpose`, save without `exif` (extension from verified format), write to `photo_dir/<uuid>.<ext>`, insert the row.
   6. On row-insert failure, best-effort delete the file and return 500.
4. After commit: `logger.info("photo_uploaded", extra={"event_id", "participant_id", "photo_id", "size_bytes", "content_type"})`; return the `Photo` schema with the public URL.

### Serve flow

`GET /photos/{photo_id}` (no credential): row lookup → unknown UUID returns generic `NotFoundError`; known returns the stored bytes with the stored content type (200). No event or membership checks, per the public-URL decision.

### Interface and storage

[upload-photo.openapi.yaml](contracts/upload-photo.openapi.yaml) defines both operations. [data-model.md](data-model.md) defines the `photos` table and transitions.

### Acceptance allocation

| Requirements / outcomes | Evidence | Limitation |
|---|---|---|
| FR-001, FR-002, FR-011; SC-001, SC-002, SC-006 | Upload API tests: exact `Photo` shape per format, viewable upright bytes, attach-ready ID, distinct IDs for identical bytes | Attachment itself is proven by the later clothing feature |
| FR-003, FR-006 | Image unit + API tests: disguised/HEIC/truncated → 415; EXIF/GPS removed, orientation normalized | Non-EXIF PNG ancillary chunks out of scope |
| FR-004; SC-003 | Boundary tests: exactly 10 MiB accepted, +1 byte → 413 with `maxBytes`; no row/partial file | Declared-length early rejection only when header present |
| FR-005 | Missing/empty → 422, garbage multipart → 400 | Exact Starlette exception type pinned by failing test first |
| FR-008, FR-009; SC-004 | Auth matrix: 401s, identical 404 bodies for malformed/missing/foreign cases | None |
| FR-007, FR-010; SC-004, SC-005 | Closed → 409 before streaming; close-during-upload ordering (upload-first 201, close-first 409); unguessable public URL; no bytes/tokens in logs (caplog) | Link holders can view — decided, not a leak |
| FR-012 | One `photo_uploaded` with exact extras; failure injection → no row, file cleaned, no success log | Best-effort file deletion, not transactional |
| SC-001–SC-006 | quickstart.md walkthrough | None |

## Implementation Notes for `/speckit-tasks`

Dependency-ordered TDD cycles (test-author → implementer-be → commit-reviewer → commit; never commit Red alone):

1. **Domain + errors + settings**: `MAX_PHOTO_BYTES`, verify/strip helpers, `PhotoTooLargeError`/`UnsupportedPhotoTypeError`, 413/415 descriptions, multipart→400 mapping, `photo_dir` setting. Unit and config tests first.
2. **Migration and model**: migration test (`upgrade head` creates `photos`) and model tests first. Lands before any route so no API-created rows can block the upgrade.
3. **Serve endpoint**: public GET with 404 parity tests first (needs only the model + a row factory).
4. **Upload endpoint, complete**: API, service, image, logging, and OpenAPI tests for every success and rejection path first; then one implementation and one commit.
5. **Polish**: rerun all checks and record quickstart evidence.

```bash
cd backend
uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

Profiles come from fresh Paseo `list_profiles` in this feature's workspace; delegates must not delegate. Re-run checks before marking tasks done; resolve Critical/High review findings with re-review. PR work needs a separate `pr-reviewer` pass.

## Complexity Tracking

No constitution violations or additional architectural layers to justify.
