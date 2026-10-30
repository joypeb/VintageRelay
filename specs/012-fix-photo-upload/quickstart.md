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
