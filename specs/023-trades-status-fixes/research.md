# Research: Trades Status Fixes (023)

Source: explorer report (2026-11-04) plus direct reads of `frontend/src/lib/trades.ts`, `TradesOnboardScreen.tsx`, `docs/plans/api/09-intents.md`, `11-proposals.md`.

## R1. Requests stay `active` after confirmation

- **Decision**: Keep the data model. Hide actions in the UI based on live garment status.
- **Rationale**: Decided 2026-11-03 (`09-intents.md` Open items: "only pending proposals are invalidated; other active requests stay active"). AGENTS.md: never change an intent without the participant's action. The server already blocks reprocessing: `accept()` returns `CLOTHING_ALREADY_CONFIRMED` (`backend/app/services/intent.py:219-224`), recalculation skips non-available garments (`intent.py:384-388`), `_invalidate_dependents` touches only pending proposals (`intent.py:330`), and `uq_confirmed_offered_clothing` prevents double confirmation (`models/trade_participant.py:24-29`). Intent responses already carry live `offeredClothing.status`/`wantedClothing.status` (`intent.py:552`).
- **Alternatives**: Auto-invalidate requests on confirmation — rejected (changes intents without participant action; contradicts a recorded decision).

## R2. Accept/Decline still shown after accept

- **Decision**: Received row is actionable only when `status = active`, the request is not a leg of a live (pending/confirmed) proposal in the caller's proposal list, both garments `available`, and the event is active. `acceptedProposalId` alone is not used: it survives rejection/invalidation/cancellation and the server allows re-acceptance then (09-intents step 3 replays only pending/confirmed). Sent Withdraw: `status = active && event active` (server-supported cleanup; never affects confirmed exchanges).
- **Leg match**: intent ↔ proposal participant where `participant.participantId = intent.participantId`, `offeredClothing.id = intent.offeredClothing.id`, `receivedClothing.id = intent.wantedClothing.id`.
- **Rationale**: `TradesOnboardScreen.tsx` `ReceivedRow` checks only `status === 'active'`. Accept replay already returns the same proposal, so this is display-only.

## R3. Refresh latency

- **Decision**: Lower `refetchInterval` of `useIntentsQuery` and `useProposalsQuery` from 15 s to 4 s (headroom for request/render within the 5 s bound) while the event is active; keep `refetchIntervalInBackground: false`, `refetchOnWindowFocus: true`, `staleTime: 0`.
- **Rationale**: Meets FR-004 / SC-001 (≤ 5 s) with existing polling; event-scale load is small. Mutations already invalidate the `['events', eventId]` prefix, covering intents and proposals.
- **Alternatives**: SSE/WebSocket — rejected (out of scope, Simplicity).

## R4. Exchanges grouping

- **Decision**: Replace `threePersonFound` with `waitingForOthers` (pending, my response consented, any cycle size). Add a pure helper that builds request-stage items from sent + received intents and proposals (active, both garments available, not a leg of a live proposal — covers reverse intents created by accept and 3-person legs). Exchanges renders groups: Requests, Awaiting my consent, Waiting for others, Confirmed, History.
- **Rationale**: `groupProposals` puts 2-person consented proposals in History (`lib/trades.ts`; `trades.test.ts:29` asserts the bug). Badge (`countTradesBadge`, `BottomTabBar.tsx:43-65`) stays unchanged (actionable only).

## R5. Human-readable end reasons

- **Decision**: Add an additive, read-only, nullable `endDetail` field to the `Proposal` response: for `invalidated` + `intent_changed` proposals, `intent_declined` | `intent_withdrawn` | `intent_invalidated` from the status of the cycle's intents (computed at read time, no migration); `null` otherwise. Frontend maps `(status, endReason, endDetail)` to plain labels.
- **Rationale**: There is no stored proposal→intent link (`trade_proposal.py`, `trade_participant.py`), but each leg maps to its intent by `(event, participant, offered, wanted=received)` (`proposal.py:422-431`). In 3-person cycles the ended leg can be between two other participants, whose request is invisible to the caller, so the frontend cannot derive it alone. `declined`/`withdrawn`/`invalidated` are terminal intent states, so the derived value is stable. Causality: decline/withdraw set `intent.updated_at` and `proposal.ended_at` to the same timestamp (`_invalidate_dependents`, `intent.py:321-349`), so match only leg intents with a terminal status and `updated_at == proposal.ended_at`. Older terminal records on recreated legs never match. The consent-recheck path (ended_at ≠ intent change time) yields `null` → "Request ended" (conservative).
- **Precedence** when several legs ended: `intent_declined` > `intent_withdrawn` > `intent_invalidated`.
- **Contract**: `api-contract.md` rule 10 requires documenting new response fields → update `docs/plans/api/11-proposals.md` in the same change; field always present (null when absent).
- **Alternatives**: Split the stored `end_reason` enum — rejected (user asked to keep internal states; would need migration and touches consent recheck paths). Frontend-only cross-reference — rejected (cannot see third-party legs).

## R6. Labels

| Condition | Label |
|---|---|
| pending | "Waiting for consent" |
| confirmed | "Confirmed" |
| rejected / `participant_rejected` | "Rejected" |
| invalidated / `intent_changed` + `intent_declined` | "Declined" |
| invalidated / `intent_changed` + `intent_withdrawn` | "Request withdrawn" |
| invalidated / `intent_changed` + `intent_invalidated` or null | "Request ended" |
| invalidated / `clothing_changed` | "Item changed" |
| invalidated / `clothing_withdrawn` | "Item withdrawn" |
| invalidated / `clothing_confirmed_elsewhere` | "Item exchanged elsewhere" |
| invalidated / `event_closed` | "Event closed" |
| cancelled | "Cancelled" |
| unknown | "Ended" |

Version-conflict dialog uses the same status labels (no raw `currentStatus`). Responses: pending → "Waiting", consented → "Consented", rejected → "Rejected". Request rows: "Waiting", "Accepted", "Declined", "Withdrawn", "Item withdrawn" (intent invalidated), "Item already exchanged" (active, a garment confirmed).

## R7. Concurrency (verify only)

All writes use `Db.write()` with SQLite `BEGIN IMMEDIATE` (`core/db.py:24-39`, busy_timeout 5000), conditional `available → confirmed` updates (`proposal.py:396-401`), and savepoint rollback on recheck failure. No change planned; QA verifies under near-simultaneous actions.

## R8. QA environment

Backend: `docker compose up --build -d` (SQLite at `/data/app.db` on volume `backend-data`, port 8000) or local `uv run fastapi dev app/main.py`. Frontend: `cd frontend && pnpm dev` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`. DB inspection: `docker compose exec backend sqlite3 /data/app.db` (or `python -c` with `sqlite3` if the CLI is missing in the image).
