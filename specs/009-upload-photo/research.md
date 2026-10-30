# Research: Upload Photo (Backend)

**Date**: 2026-10-30
**Scope**: Existing backend and repository rules; no dependency upgrades or application changes during planning. Paseo `explorer` investigated the same workspace read-only; the orchestrator verified its findings against the code cited below.

## R1. Store bytes on local disk, serve via a public GET route

**Decision**: Add a `photo_dir` setting (default under `data/`, overridden with `tmp_path` in tests). The service writes the processed image to `photo_dir/<uuid>.<ext>` where `<ext>` derives from the verified format, inserts the `photos` row with that key as `storage_location`, and returns `url` built from the existing `app_base_url` setting plus `/api/v1/photos/{photo_id}`. A new public `GET /api/v1/photos/{photo_id}` (no credential, like the entry-code lookup precedent) returns the bytes with the stored content type; unknown IDs produce the generic not-found error.

**Rationale**: No object-storage dependency or new infrastructure for the prototype. Serving through a router keeps bytes inside the API layer (middleware request logging, `X-Request-ID`, error envelope) instead of bypassing it as a static-files mount would. A top-level individual resource with an unguessable UUID matches the shared contract's resource conventions and the clarify decision that anyone holding the link can view without a credential.

**Alternatives considered**: A `StaticFiles` mount would bypass request logging and error handling and needs the directory to exist at import time. Signed URLs add an auth/proxy mechanism the clarify session explicitly rejected for this version.

## R2. Add Pillow; verify type by opening the image

**Decision**: Add `pillow` with `uv add pillow` (only new dependency; `python-multipart` already arrives via `fastapi[standard]`). Type verification is `Pillow` opening the received bytes and checking `format` against `{"JPEG", "PNG", "WEBP"}` — never the client-declared content type or filename. Orientation and metadata handling is `ImageOps.exif_transpose` followed by saving without `exif`, which removes EXIF (including GPS) and normalizes orientation.

**Rationale**: Opening the file with a real decoder is the content inspection FR-003 requires; header sniffing alone would still accept truncated or mismatched payloads. Transpose-then-save-without-exif is the standard minimal recipe for both orientation and EXIF removal. PNG/WebP carry no EXIF through this path.

**Alternatives considered**: Manual magic-byte tables duplicate decoder knowledge and cannot confirm the file is a complete, openable image. A dedicated upload-validation library adds a dependency for three formats.

## R3. Enforce the 10 MB limit while streaming

**Decision**: Fix `MAX_PHOTO_BYTES = 10 * 1024 * 1024` as a domain constant (decided by the spec, not configurable). The service reads the `UploadFile` in chunks (e.g., 1 MiB) and aborts with 413 as soon as the count exceeds the limit, so oversized bodies are never fully buffered into the response path. If a `Content-Length` header is present and exceeds the limit, reject 413 before consuming the body.

**Rationale**: The source requires rejecting by the header and while streaming without buffering oversized files fully. Starlette already spools large parts to disk, but chunk counting bounds application memory regardless. A constant keeps the limit and the `maxBytes` error detail in one place.

**Alternatives considered**: Reading the whole file then checking length is the simplest code but violates the source rule. A configurable setting implies the limit is undecided; the spec fixes it at 10 MB.

## R4. Deterministic check and error order

**Decision**: Follow the API README check order, with file checks in two places: (1) before auth — multipart body unparseable → `400 BAD_REQUEST`; `file` part missing or zero bytes → `422 VALIDATION_ERROR`; (2) after auth/scope/closure — stream with 413 on size overflow, then open with Pillow with 415 (`details.allowedTypes`) for anything not openable as JPEG/PNG/WebP. Auth (401), event existence/scope (404, identical for malformed IDs, missing events, and foreign tokens via `get_current_participant`), and closed events (409 `EVENT_CLOSED` inside the write transaction) run between the two file stages. An oversized file of the wrong type reports 413 (size is hit during streaming); a complete file of the wrong type reports 415. A connection truncated mid-stream surfaces as 400.

**Rationale**: Cheap structural validation (parseable body, part present) belongs with request validation before auth, per the shared check order; consuming and decoding the body is feature work that runs after the caller is authorized for the event and the event is known active. Checking closure before streaming avoids decoding work for closed events and keeps the closed-vs-not-found disclosure order (code/scope verified first).

**Alternatives considered**: Fully validating the file before auth would do expensive work for unauthorized callers and leak nothing useful. Checking size after Pillow decoding would require holding the full file.

## R5. Multipart failure mapping

**Decision**: Register handling so Starlette `MultiPartException` during form parsing becomes `400 BAD_REQUEST` through the existing error envelope; declare the file parameter optional (`File(None)`) and raise `422 VALIDATION_ERROR` with `details.fields` when it is absent or empty, reusing the existing `RequestValidationError` path where possible. Confirm the exact exception type with a failing test first (TDD), since no multipart route exists yet and `main.py`'s OpenAPI helper assumes JSON bodies.

**Rationale**: No precedent exists in the codebase; the mapping must be proven by tests rather than assumed. Keeping the shared envelope (`code`, user-safe English `message`, `details`, `requestId`) is contract-mandated.

**Alternatives considered**: Letting multipart exceptions fall through to 500 misclassifies client errors and contradicts the source's 400 row.

## R6. Photos table, migration, and file/DB atomicity

**Decision**: New `photos` table (`id` UUID PK, `event_id` FK, `uploader_id` FK, `storage_location` unique key, `content_type`, `size_bytes`, `created_at` tz-aware) declared in `app/models/photo.py`, plus one Alembic revision. The service writes the processed file, then inserts the row inside `Db.write()`; if the insert fails, it best-effort deletes the file before returning 500, so no row points at missing bytes and no orphan success log exists. A file-write failure produces 500 with no row. Replaced-photo cleanup is out of scope (no clothing feature yet); never-attached rows are kept per the clarify decision.

**Rationale**: Mirrors the participant/token atomicity precedent (row and secret succeed or fail together). File deletion on DB failure is compensation, not a distributed transaction — acceptable because the file is content-addressed by an unguessable key and invisible until the row exists.

**Alternatives considered**: Inserting the row first leaves retrievable rows pointing at missing files on disk failure. Two-phase commit across disk and SQLite is disproportionate for the prototype.

## R7. Central error definitions

**Decision**: Add `PhotoTooLargeError` (`413 FILE_TOO_LARGE`, `details={"maxBytes": 10485760}`) and `UnsupportedPhotoTypeError` (`415 UNSUPPORTED_MEDIA_TYPE`, `details={"allowedTypes": ["image/jpeg", "image/png", "webp"]}` — exact values `image/jpeg`, `image/png`, `image/webp`) as `AppError` subclasses in `backend/app/domain/errors.py`, and add 413/415 entries to `_ERROR_DESCRIPTIONS` in `backend/app/api/errors.py`. Reuse existing `UnauthenticatedError`, `NotFoundError`, `EventClosedError`, and the validation-error path. All messages are new English user-facing sentences; codes come from the shared contract.

**Rationale**: The contract requires feature error codes defined centrally and user-safe messages; `FILE_TOO_LARGE` and `UNSATED_MEDIA_TYPE` are already reserved codes there.

**Alternatives considered**: Raising `HTTPException` directly would bypass central codes and the envelope.

## R8. Logging

**Decision**: After commit, the service emits `logger.info("photo_uploaded", extra={"event_id": ..., "participant_id": ..., "photo_id": ..., "size_bytes": ..., "content_type": ...})`. No other domain log for upload; rejections emit nothing beyond the existing request log. Never log bytes, tokens, filenames, or declared content types beyond the verified stored format.

**Rationale**: Matches the `participant_joined`/`event_closed` post-commit pattern and the source's exact `extra` fields. `core/logging.py` already masks `image`/`token` keys; the request path for this route contains no secrets (unlike entry codes), so no path masking is needed.

**Alternatives considered**: Logging before commit risks success records for rolled-back uploads.

## R9. Tests

**Decision**: API tests (TestClient, real tmp SQLite + tmp photo dir): success for JPEG/PNG/WebP with exact `Photo` shape; boundary sizes (exactly 10 MiB accepted, 10 MiB + 1 byte rejected with `maxBytes` detail); missing/empty part 422; disguised content and HEIC 415 with `allowedTypes`; malformed body 400; auth matrix (missing/invalid/foreign token, malformed event ID — identical 404 bodies); closed event 409; double upload of identical bytes yields two IDs; stored image has no EXIF and correct orientation; file on disk byte-equals served bytes. Service tests: DB failure after file write deletes the file and logs nothing; storage failure yields 500 with no row. Unit tests: format verification helper, EXIF-strip helper, limit constant. Migration test: `upgrade head` creates `photos`. Logging test: one `photo_uploaded` with exact extras, no bytes. OpenAPI test: `/openapi.json` contains both operations.

**Rationale**: Follows `docs/rules/dev/backend/testing.md` and the join-event test precedents (auth matrix, atomicity via failure injection, migration via `sqlite_master`/upgrade, caplog assertions). The EXIF test crafts a JPEG with orientation + GPS tags via Pillow and asserts the stored file is upright and tag-free.

## R10. No new deferrals

**Decision**: Nothing in the spec remains technically unresolved. Retention (keep indefinitely), URL policy (public unguessable), HEIC (reject), and the 10 MB limit were all decided in the spec and clarify sessions. Multiple photos per garment belong to the future clothing feature.

**Rationale**: Constitution V — do not harden open decisions, but do not re-open decided ones either.
