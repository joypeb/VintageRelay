# Quickstart: Close Event Frontend (Mobile)

## Prerequisites

- Backend with close-event (`specs/005-close-event`) running: `cd backend && uv run alembic upgrade head && uv run fastapi dev app/main.py` (see `specs/005-close-event/quickstart.md`).
- Frontend: `cd frontend && pnpm install && pnpm dev`, `NEXT_PUBLIC_API_BASE_URL` pointing at the backend.
- Browser devtools device mode at 360 px and 430 px.

## Automated checks

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all pass, including new tests listed in [research.md](research.md) R8.

## Manual scenarios

| # | Steps | Expected |
|---|---|---|
| 1 | Create an event (H1 → H2 → [Go home]) → Manage card → M1 → [Close event] | H3 opens with title "Close this event?", the settled-effects description (no mention of proposals), [Close event] above [Cancel]; focus on the title; no network request yet |
| 2 | In H3 tap [Cancel]; reopen and press Esc; reopen and tap the backdrop; reopen and use the phone's back gesture | Each closes the dialog; no POST; M1 still active; focus returns to [Close event] |
| 3 | Reopen H3 → [Close event] | Button spinner, one POST; H3 closes as soon as the POST returns; "Event closed"; banner "This event has ended." with local time; state label changes from "Active" to "Closed"; counts shown; no [Close event]; focus on "Manage event" heading |
| 4 | Go to P2 | Shows "Closed" immediately; [Register my clothes] hidden |
| 5 | New event; stop backend; confirm H3 | Error inside H3; M1 still active; restart backend; confirm again → closed |
| 5a | New event; throttle to "Slow 3G", confirm H3, tap back to P2 and reopen M1 before the response | [Close event] disabled until the first request settles; Network tab shows one POST |
| 5b | New event; open H3 in tab B; close the event in tab A; wait for tab B's next refresh (or switch focus to it) | Tab B's H3 closes by itself and the closed state appears |
| 6 | New event, open M1 in two tabs; close in tab A; confirm H3 in tab B | Tab B shows closed state with tab A's closure time, no error |
| 7 | Organizer device: replace stored token with a regular participant's token (devtools → localStorage) and confirm H3 on a fresh M1 | "Only the organizer can manage this event." (or the read already shows it) |
| 8 | Clear localStorage token to a random value, confirm H3 | "You haven't joined this event on this device." |
| 9 | Throttle network to "Slow 3G", confirm H3, tap backdrop/Esc while pending | Dialog stays open; button stays disabled |
| 10 | 360 px and 430 px widths | H3 and M1 fit without horizontal scroll; buttons ≥ 44 px tall |
| 11 | Inspect console during scenarios | No token, `Authorization` header, or entry code logged |
| 12 | From M1 (active), count taps and time to the closed state (SC-001) | ≤ 3 taps ([Close event], [Close event]); record seconds — target < 10 s |
