# Quickstart: Clothing Category, Title, and Measurements (Backend)

Validation guide for the extended `POST /api/v1/events/{event_id}/clothing`,
`GET /api/v1/events/{event_id}/clothing`, and `GET /api/v1/clothing/{clothing_id}`.
Interface details live in [contracts/clothing-category-measure.md](contracts/clothing-category-measure.md)
(delta on top of 011's OpenAPI contract as amended by 012); storage and transitions live in
[data-model.md](data-model.md).

## Prerequisites

- 012-backend merged and this branch rebased onto it (`alembic upgrade head` creates both the
  `photos.clothing_id`/`position` change and the new `clothes` columns).
- `cd backend && uv sync`. No new dependencies; no external services.
- Tests use a fresh tmp SQLite file plus a tmp photo directory per test.

## Run the checks

```bash
cd backend
uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

## Manual validation

On a server migrated with `alembic upgrade head`: create an event (organizer token `A`), join it
(participant token `B`), and upload photos per token (features 001/007/009, photo rules per 012).

1. **Register with all fields**: `POST /events/{id}/clothing` with `A`,
   `{"photoIds": ["<A's photo>"], "category": "top", "title": "  Green denim jacket  ", "description": "Cropped, M", "measurements": {"chest": 21.0, "sleeve": 24.5}}`
   → `201`, `category=top`, title trimmed, measurements round-trip with unentered dimensions null.
2. **No measurements**: register with `category: bottom` and no `measurements` → `201`,
   `measurements` is `null`; `{}` behaves the same.
3. **Reads**: list (`mine`/`others`/`all`) and detail show `category`, `title`, `measurements`.
4. **Rejections** (each creates no garment, all `422` also with no token):
   - missing `category`/`title`; `category: dress`; whitespace-only or 101-char title; title with a newline/control character
   - `sleeve` on `bottom`; `waist` on `top`; any measurements on `other`; `0`, negative, `> 120`, or non-numeric values; unknown key inside `measurements`
5. **Unchanged behavior**: photo/event/closed-event rules per 012; reads allowed after close.
6. **Logs**: one `clothing_registered` record with `clothing_id`, `event_id`, `description_length`,
   `title_length`, `category`; title and description text appear nowhere.

## Expected outcomes

All scenarios match the contract; all checks pass; `alembic upgrade head` on an empty database
creates `clothes` with the new columns and the category CHECK, and downgrade removes them.

## Implementation Evidence

### T001 baseline (pre-implementation, post-012 rebase)

- Branch is `specs/013-clothing-category-measure` rebased onto `origin/main` at `5586cd7` (012 #17 merged); `.specify/feature.json` points to `specs/013-clothing-category-measure`.
- 012-backend confirmed present: `clothes.photo_id` gone, `photos.clothing_id`/`position` with unique constraint present; 012's backend revision is `c9f3e2a4b1d7` (new 013 migration's `down_revision`).
- `ruff format --check`: 97 files already formatted
- `ruff check --no-cache`: All checks passed
- `mypy app`: Success, no issues in 41 source files
- `pytest -q`: 356 passed, 22 warnings

### T016 final validation (post-implementation)

- Backend: `ruff format --check .` 98 files formatted; `ruff check --no-cache .` all passed; `mypy app` no issues in 41 source files; `pytest -q` **404 passed**, 28 warnings.
- Frontend (unchanged by this feature): `pnpm lint` exit 0 (0 errors, 13 warnings — all pre-existing in 012's `PhotoUploadScreen`/compression files, none from 013 which touches no frontend files); `pnpm typecheck` exit 0; `pnpm test` 31 files / 434 tests passed.
- Manual validation (script outside the repo, real Uvicorn server on a fresh SQLite file after `alembic upgrade head`, which ran `c9f3e2a4b1d7 → e4f1a2b3c5d6`): **15/15 scenarios passed** — register 201 with category `top`, trimmed title, measurements round-trip with unentered dimensions `null`, `available`/`contentVersion 1`; no-measurements and `{}` both → `measurements: null`; list (`others`) and detail show the new fields; 9 rejection cases → `422` with no garment created; after close, register → `409 EVENT_CLOSED` while detail stays 200; server log shows 6 `clothing_registered` records with `clothing_id`, `event_id`, `description_length`, `title_length`, `category`, and zero title/description text.
