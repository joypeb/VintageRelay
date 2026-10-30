# Quickstart: Register/Read Clothing (Backend)

Validation guide for `POST /api/v1/events/{event_id}/clothing`, `GET /api/v1/events/{event_id}/clothing`, and `GET /api/v1/clothing/{clothing_id}`.
Interface details live in [contracts/register-read-clothing.openapi.yaml](contracts/register-read-clothing.openapi.yaml); storage, visibility, and transitions live in [data-model.md](data-model.md).

## Prerequisites

- `cd backend && uv sync`. No new dependencies; no external services.
- Tests use a fresh tmp SQLite file plus a tmp photo directory per test.

## Run the checks

```bash
cd backend
uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

## Manual validation

On a server migrated with `alembic upgrade head`: create an event (organizer token `A`), join it (participant token `B`), and upload one photo per token (features 001/007/009).

1. **Register**: `POST /events/{id}/clothing` with `A`, `{"photoId": "<A's photo>", "description": "  Green denim jacket, M  "}` → `201`, `status=available`, `contentVersion=1`, `analysis=null`, `isMine=true`, description trimmed, `photo.url` equals the upload URL.
2. **Stats**: `GET /events/{id}` with `A` → `stats.availableClothingCount = 1`.
3. **Repeat** step 1 → `409 PHOTO_ALREADY_ATTACHED`; still one garment.
4. **Rejections** (each creates no garment):
   - `{}` or space-only/1,001-char description → `422` (also `422` with no token: validation runs first)
   - no/bad token → `401`; foreign token or bad event ID → `404`
   - `B` registering `A`'s photo, a photo from another event, or an unknown `photoId` → identical `404`s
   - after closing the event → `409 EVENT_CLOSED`
5. **List** with `B`: `?ownership=others` shows `A`'s garment; `?ownership=mine` is empty; `?status=bogus` → `422`. Lists still work after the event is closed.
6. **Withdrawn visibility** (set a row's `status` to `withdrawn` in SQLite until feature 07 exists): `B`'s lists hide it, `A`'s `?ownership=mine` shows it, and `GET /clothing/{id}` with `B` returns it with `status=withdrawn`.
7. **Detail scope**: `GET /clothing/{id}` with a token from another event, or with an unknown ID → identical `404`s.
8. **Logs**: one `clothing_registered` record with `clothing_id`, `event_id`, `description_length`; the description text appears nowhere.

## Expected outcomes

All scenarios match the contract; all checks pass; `alembic upgrade head` creates `clothes` with a unique `photo_id` on an empty database.

## Implementation Evidence

### T001 baseline (pre-implementation)

- Git branch is `speckit-specify-register-read-clothing`; `.specify/feature.json` points to `specs/011-register-read-clothing` (the Spec Kit scripts report `011-register-read-clothing` from that file).
- `ruff format --check`: 82 files already formatted
- `ruff check --no-cache`: All checks passed
- `mypy app`: Success, no issues in 36 source files
- `pytest -q`: 270 passed, 1 warning (pre-existing SAWarning in `test_migrations.py`)
