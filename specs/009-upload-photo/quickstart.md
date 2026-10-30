# Quickstart: Upload Photo (Backend)

Validation guide for `POST /api/v1/events/{event_id}/photos` and `GET /api/v1/photos/{photo_id}`.
Interface details live in [contracts/upload-photo.openapi.yaml](contracts/upload-photo.openapi.yaml);
storage and transitions live in [data-model.md](data-model.md).

## Prerequisites

- Backend dependencies installed: `cd backend && uv sync` (includes `pillow` after implementation).
- No external services; tests use a fresh tmp SQLite file plus a tmp photo directory.

## Run the checks

```bash
cd backend
uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

## Manual validation

Assume a running server with an active event and a participant token
(`POST /api/v1/events` then join give both; see features 001/007).

1. **Valid upload**: `curl -X POST localhost:8000/api/v1/events/{id}/photos
   -H "Authorization: Bearer <token>" -F "file=@jacket.jpg"` → `201` with
   `id`, public `url`, `contentType`, `sizeBytes`, `createdAt`.
2. **View bytes**: `curl <url>` (no `Authorization`) → `200` with the image;
   opening the stored file shows it upright with no EXIF/GPS tags.
3. **Attach later**: use the returned `id` as `photoId` when registering
   clothing (feature 006+) → garment links the photo.
4. **Repeat upload of the same bytes** → `201` with a different `id`.
5. **Rejections** (each leaves no photo row and no partial file):
   - `file` missing/empty → `422`; garbage multipart → `400`
   - 10 MiB + 1 byte → `413` with `details.maxBytes = 10485760`
   - renamed `.png` text file or `.heic` → `415` with `details.allowedTypes`
   - no/bad token → `401`; foreign token or bad event ID → identical `404`s
   - closed event → `409 EVENT_CLOSED`
6. **Logs**: one `photo_uploaded` entry carries `photo_id`, `size_bytes`,
   `content_type`; no image bytes or tokens appear anywhere.

## Expected outcomes

All scenarios above match the contract file; every check in Common Commands
passes; the migration creates `photos` on an empty database (`alembic upgrade head`).

## Implementation Evidence

### T001 baseline (branch `009-upload-photo`, pre-implementation)

```bash
cd backend
uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest -q
```

- `ruff format --check`: 69 files already formatted
- `ruff check`: All checks passed
- `mypy app`: Success, no issues in 30 source files
- `pytest -q`: 219 passed, 1 warning (pre-existing SAWarning on expression-index reflection in `test_migrations.py:33`)
