# Quickstart / Validation: Trades Status Fixes (023)

## Checks

- Backend: `cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`
- Frontend: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`

## Run

1. `docker compose up --build -d` (backend on :8000, SQLite `/data/app.db`).
2. `cd frontend && NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 pnpm dev` (:3000).
3. Open one browser profile/incognito window per participant (A organizer, B, C).
4. DB: `docker compose exec backend sqlite3 /data/app.db "select id,status,end_reason from trade_proposals;"`.

## Scenarios (expected)

1. **Accept hides buttons**: B requests A's garment; A accepts → Received row "Accepted", no Accept/Decline. B's Sent shows "Accepted" within 5 s without reload — measure 10 trials, including after switching tab away and back (focus refetch).
2. **Request stage in Exchanges**: right after B sends, Exchanges shows a "Requests" group for both A ("Waiting for your answer") and B ("Waiting for A to answer"). After A accepts, the request leaves "Requests" (shown once, via the proposal).
3. **Waiting for others**: in 1:1, A accepted (consented) → A's Exchanges lists it under "Waiting for others", not History. Same for 3-person after own consent.
4. **1:1 confirm**: B consents → both see Confirmed; DB: proposal `confirmed`, both garments `confirmed`, two `trade_participants.is_confirmed = 1`.
5. **3-person end paths (run each separately)**: build an A→B→C cycle, two participants consent, then (a) the third rejects → `rejected/participant_rejected`, "Rejected"; (b) an owner declines a leg → `invalidated/intent_changed`, `endDetail=intent_declined`, "Declined" for all three; (c) a sender withdraws a leg → `intent_withdrawn`, "Request withdrawn". Then re-form the cycle (re-send the request) → new proposal with a higher `version` and every `trade_participants.response = pending` (consent not reused).
6. **Shared garment**: two pending proposals share a garment; confirm one → the other `invalidated/clothing_confirmed_elsewhere`, labeled "Item exchanged elsewhere"; requests whose offered or wanted garment is now confirmed stay `active` in DB (intended), show "Item already exchanged", and offer no Accept/Decline; Withdraw still works and leaves the confirmed exchange intact.
7. **Near-simultaneous (each pair separately, parallel API calls)**: (a) two competing final consents on proposals sharing a garment → exactly one confirmed, the other gets `CLOTHING_ALREADY_CONFIRMED` or version mismatch; (b) final consent vs cancel of another confirmed exchange freeing a garment → any serial order is acceptable, garment confirmed at most once; (c) two parties cancel the same exchange → both 200, one state change; (d) cancel vs close → either cancelled-then-closed (both succeed) or closed-then-`EVENT_CLOSED` (still confirmed). DB: never more than one `is_confirmed = 1` row per `offered_clothing_id`.
8. **Cancel & close**: cancel a confirmed exchange → "Cancelled" for all, `status=cancelled/participant_cancelled`, garments `available`, `is_confirmed = 0`, historical `response` values kept; the same cycle is not re-proposed while its requests are unchanged; freed garments can form new proposals. Close event → every **new** transition (new request, accept, decline, withdraw, consent, reject, cancel) returns `EVENT_CLOSED`; **replays** of already-done actions (re-cancel a cancelled exchange, re-decline, re-accept an accepted pending/confirmed request) return 200 and re-withdraw returns 204, all with unchanged state; pending proposals become `invalidated/event_closed` ("Event closed"); Trades is read-only.
9. No raw `invalidated`, `intent_changed`, `pending`, `consented` strings visible in Trades, proposal detail, or the version-conflict dialog.
