# Quickstart: Upload Photo Frontend (Mobile)

## Prerequisites

- A backend with photo upload (`specs/009-upload-photo`) running: `cd backend && uv run alembic upgrade head && uv run fastapi dev app/main.py`.
- The frontend: `cd frontend && pnpm install && pnpm dev`, with `NEXT_PUBLIC_API_BASE_URL` pointing at the backend.
- Two browser profiles: A is the organizer/participant, B is a second participant. Use devtools device mode at 360 px and 430 px.

## Automated checks

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

Expected: everything passes, including the new tests listed in [research.md](research.md) R9.

Before PR work, also run `cd frontend && pnpm build` (common `git-workflow.md`).

## Manual scenarios

| # | Steps | Expected |
|---|---|---|
| 1 | In A, create an event, join it, open C1 → [Register my clothes] (C2). | C2 shows the photo step with [Choose photo] and the formats/10 MB help text; no Register action from this feature. |
| 2 | Choose a valid JPEG (with rotation/EXIF if available). | Local preview appears immediately, "Uploading photo…" shows, then "Photo ready" with the server-URL image displayed upright. One `POST /photos` in the Network tab with `multipart/form-data` and no manual `Content-Type`. |
| 3 | Repeat with a PNG and a WebP. | Same ready flow for each; each upload is a new photo. |
| 4 | With a ready photo, tap [Change photo] and choose another file. | Old preview/identity discarded; new file uploads as a new photo. |
| 5 | With a ready photo, tap [Remove]. | Preview and held identity cleared; C2 returns to empty; no request sent. |
| 6 | Choose a file over 10 MB; then a 0-byte file; then an HEIC file (or rename `.txt` → `.jpg`). | Each is rejected locally with the size/empty/type message and no request is sent (check Network). A disguised file passing locally is rejected by the server with the 415 message. |
| 7 | Throttle to "Slow 3G", choose a file, double-tap controls and choose another file mid-upload. | At most one POST in flight; the first result is ignored and only the latest file's result is shown. |
| 8 | Stop the backend and upload; restart and [Try again]. | Retryable photo-step error with values kept; retry succeeds. |
| 9 | In A, close the event (M1), then open C2 / retry an upload. | Closed banner with disabled photo step; an in-flight upload rejected as `EVENT_CLOSED` switches to the closed view. |
| 10 | Open C2 for the event in a profile with no access. | "Not joined on this device" guidance; no picker and no upload. |
| 11 | Upload to a nonexistent event (edit the URL event ID). | "This event could not be found." with [Go to start]. |
| 12 | Use 360 px and 430 px widths through all views. | No horizontal scroll; touch targets at least 44 px. |
| 13 | Inspect the browser console during all scenarios. | No credential, `Authorization` header, image bytes, or response body is logged. The `pnpm dev` terminal's own request lines are out of scope (research R8). |
| 14 | Time scenario 1 → 2 (SC-001). | Under 60 s of user time excluding the device picker. |
| 15 | Capture C2 (empty, uploading, ready, failed, closed) at 360 px and 430 px. | Attach the screenshots to the PR (common `testing.md`). |
