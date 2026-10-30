# Quickstart: Join Event Frontend (Mobile)

## Prerequisites

- A backend with join-event (`specs/007-join-event`) running: `cd backend && uv run alembic upgrade head && uv run fastapi dev app/main.py`.
- The frontend: `cd frontend && pnpm install && pnpm dev`, with `NEXT_PUBLIC_API_BASE_URL` pointing at the backend and the backend `app_base_url` pointing at the frontend, so join links open P1.
- Two browser profiles: A is the organizer, B is the visitor, for example a regular and a private window with storage allowed, or two profiles. Use devtools device mode at 360 px and 430 px.

## Automated checks

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

Expected: everything passes, including the new tests listed in [research.md](research.md) R10.

Before PR work, also run `cd frontend && pnpm build` (common `git-workflow.md`).

## Manual scenarios

| # | Steps | Expected |
|---|---|---|
| 1 | In A, create an event and copy the join link from H2. Open it in B. | P1 shows the code prefilled, a brief busy state, then the event name with "Active". Focus is on "My display name". One GET in the Network tab, with no `Authorization` header. |
| 2 | In B, enter "Joon" and tap [Join]. | Busy [Join] and one POST. P2 opens as a participant with no manage card. Back does not return to the P1 form. |
| 3 | In B, reload P2 and reopen the join link. | P2 loads without joining again. P1 shows "You've already joined this event on this device." with [Go to event home], which opens P2. |
| 4 | In a fresh profile C, go S0 → [Join with entry code], type the code in lowercase with spaces, and tap [Find event]. | The preview appears. |
| 5 | In C, edit the code after the preview. | The preview and the display name step disappear until [Find event]. |
| 6 | In C, enter an unknown code; then submit with an empty code. | The server message "We couldn't find an event with this code. Check the code and try again." appears on the field. With an empty code, "Enter the entry code." appears and no request is sent. |
| 7 | In C, look up the event and join with "joon " (the name taken in scenario 2, in another letter case). | The server's taken message appears on "My display name", the name is kept, and [Join] works again. |
| 8 | In C, try an empty name, then 31 characters. | "Enter a display name of 1–30 characters." appears and no request is sent. |
| 9 | In C, after the preview, close the event in A (M1), then tap [Join] in C. | The closed view appears: "This event has ended. You can no longer join." with [Go to start]. |
| 10 | Open the join link for a closed event in a fresh profile. | The closed view appears with no display name field. |
| 11 | Stop the backend and tap [Find event] or [Join]. | A form error appears and the values are kept. Restart the backend and retry: it succeeds. |
| 12 | Throttle to "Slow 3G" and double-tap [Join]. | One POST is sent and the code field is read-only while it is pending. |
| 13 | In a window that blocks storage, tap [Join] after the preview. | The storage message appears and no POST is sent. |
| 14 | Use 360 px and 430 px widths. | There is no horizontal scroll and buttons are at least 44 px tall. |
| 15 | Inspect the browser console during all scenarios. | No token, `Authorization` header, entry code, or response body is logged. The `pnpm dev` terminal's own request-URL lines are out of scope (research R9). |
| 16 | Time scenario 1 → 2 (SC-001) and scenario 4 → join (SC-002). | 3 taps or fewer and under 30 s for the QR path; under 60 s for the typed path. |
| 17 | In C, show an active preview. In another tab of C, join the same event. Back in the first tab, tap [Join]. | No POST is sent; the screen shows "You've already joined this event on this device." |
| 18 | Throttle to "Slow 3G", tap [Find event], edit the code, and tap [Find event] again before the first lookup returns. | [Find event] stays busy until the first lookup settles, and at most one GET is pending at a time. |
| 19 | Capture P1 (code entry, active, closed, already joined) at 360 px and 430 px. | Attach the screenshots to the PR (common `testing.md`). |
