# Quickstart: Read Event Frontend (Mobile)

Validation guide. Behavior details live in [contracts/ui-screens.md](contracts/ui-screens.md) and [data-model.md](data-model.md).

## 1. Prerequisites

- Backend with read-event (`specs/003-read-event`) running: `cd backend && DATABASE_URL=sqlite:///./data/app.db APP_BASE_URL=http://localhost:3000 uv run fastapi dev app/main.py` (port 8000).
- Frontend env: `frontend/.env.local` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`.
- `cd frontend && pnpm install && pnpm dev` (port 3000).

## 2. Automated checks

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all pass. New tests cover `parseEvent`, `getEventScreenState`, `isOrganizer`, `formatDateTime`, `routes.manageEvent`, `getEvent`/retry rules, `apiFetch` timeout message, `EventShareCard`, and P2/M1 organizer gating and state rendering.

## 3. Manual scenarios (phone width 360 px and 430 px)

| # | Steps | Expected |
|---|---|---|
| 1 | Create an event (S0 → H1 → H2), tap [Go home] | P2 shows event name, "Active", "You: {name} (Organizer)", Manage card |
| 2 | Tap Manage card | M1 shows QR, entry code, counts 1 / 0 / 0; [Copy link] shows "Link copied" |
| 3 | In another browser profile, put a regular participant record for the event (via the join feature when available, or by seeding the DB and `localStorage`), open P2 | No Manage card; opening `/events/{id}/manage` shows "Only the organizer can manage this event." |
| 4 | Open `/events/{id}` in a private window | "You haven't joined this event on this device." with [Join with entry code] and [Go to start]; no request in the Network tab |
| 5 | Edit the stored token in DevTools → reload P2 | Same no-access guidance (401) |
| 6 | Open `/events/00000000-0000-0000-0000-000000000000` with any stored record for that ID | "This event could not be found." |
| 7 | Stop the backend, reload P2 | Error message + [Try again]; restart backend, tap [Try again] → P2 renders |
| 8 | Close the event in the DB (`status='closed'`, `closed_at` set), wait ≤ 30 s on P2 | "This event has ended." banner with local closure time, "Closed" badge, no [Register my clothes]; M1 still shows counts and no [Close event] |
| 9 | On M1 (active), tap [Close event] | "Closing the event is coming soon."; event stays active |
| 10 | Check browser console and server logs during 1–9 | No token, `Authorization` header, or entry code logged |
