---

description: "Task list for 021 Cancel and Confirmed Handover View"
---

# Tasks: 021 Cancel and Confirmed Handover View

**Input**: Design documents from `specs/022-cancel-and-handover/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cancel-proposal.md, quickstart.md

**Tests**: REQUIRED (TDD). Each test task is written first by `test-author` and confirmed failing before its implementation task.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Verify branch `feature/021-cancel-and-handover` is based on `origin/main` and specs/022-cancel-and-handover/ contains spec.md, plan.md, research.md, data-model.md, contracts/cancel-proposal.md, quickstart.md, tasks.md

## Phase 2: Foundational

No schema change (data-model.md). The `ProposalNotConfirmedError` class is created inside US1 (T003) because only cancel uses it.

## Phase 3: User Story 1 - Cancel a confirmed exchange (P1) 🎯 MVP

**Goal**: A party cancels a confirmed exchange before closure; all garments become available and new cycles can form.

**Independent Test**: `uv run pytest tests/api/test_proposals_cancel.py`.

- [x] T002 [US1] Write failing API tests in backend/tests/api/test_proposals_cancel.py (reuse fixtures/helpers from backend/tests/api/test_proposals_consent_conflicts.py and conftest): (a) party cancels a confirmed 2-person exchange → 200, `status="cancelled"`, `endReason="participant_cancelled"`, `cancelledAt` and `endedAt` set and equal, `canCancel=false`, both garments `available`, every participant row `is_confirmed=false`; (b) 3-person confirmed exchange cancelled → all three garments `available`; (c) replay by the same and by the other party → 200 same proposal, no state change; (d) replay after closure → 200; (e) confirmed + closed → 409 `EVENT_CLOSED` with message "This event is closed, so exchanges can no longer be cancelled." and proposal stays `confirmed`, garments stay `confirmed`; (f) `pending`, `rejected`, `invalidated` → 409 `PROPOSAL_NOT_CONFIRMED`; (g) non-party participant, other-event proposal, unknown id → 404 `NOT_FOUND`; missing token → 401; (h) after cancel, no new pending proposal recreates the same cycle while intents are unchanged; (i) after cancel, a new intent using a freed garment forms a new pending proposal (reusable garments, common/testing §1); (j) log record `proposal_cancelled` with `proposal_id` and `cancelled_by`, emitted once (replay emits none); (l) serialization: two parties cancel concurrently (threads, as in backend/tests/api/test_close_consent_serialization.py) → exactly one state change, both 200 cancelled; close-then-cancel → `EVENT_CLOSED` and still confirmed; cancel-then-close → cancelled and close succeeds; (m) rollback: monkeypatch `_recalculate_cycles_for_clothing` to raise → 500 `INTERNAL_ERROR`, proposal still `confirmed`, garments still `confirmed`, `is_confirmed` still true; (n) suppression variants after cancel: an intent re-created/updated later → the cycle is proposed again on that change; a garment `contentVersion` bump → proposed again; (k) OpenAPI exposes `POST /api/v1/proposals/{proposal_id}/cancel` with `operationId` `cancelProposal` (update backend/tests/api/test_openapi_contract.py only if it enumerates operations)
- [x] T003 [US1] Implement to pass T002: add `ProposalNotConfirmedError(ConflictError)` (`code="PROPOSAL_NOT_CONFIRMED"`, message "Only confirmed exchanges can be cancelled.") in backend/app/domain/errors.py; add `cancel(db, settings, participant, proposal_id) -> Proposal` in backend/app/services/proposal.py mirroring `reject()` order inside one `db.write()`: 404 checks → replay if `cancelled` → `EventClosedError("This event is closed, so exchanges can no longer be cancelled.")` → `ProposalNotConfirmedError` if status != `confirmed` → set `status="cancelled"`, `end_reason="participant_cancelled"`, `cancelled_at=ended_at=now`, all `TradeParticipant.is_confirmed=False` → conditional `UPDATE clothing SET status='available' WHERE id=? AND status='confirmed'` per offered garment (rowcount != 1 → raise `InternalError`, rolling back) → flush → call `_recalculate_cycles_for_clothing(s, event_id, clothing_id, now)` from backend/app/services/clothing.py for each freed garment in sorted order → build response → log INFO `proposal_cancelled` (`proposal_id`, `cancelled_by`) after commit; add route `POST /proposals/{proposal_id}/cancel` (`operation_id="cancelProposal"`, no body) in backend/app/api/routers/proposals.py

**Checkpoint**: Backend checks green (`cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`).

## Phase 4: User Story 2 - Confirmed handover view T3 (P1)

**Goal**: `trades/[tradeId]` shows give/receive pairs, names, garment links, the handover notice, and a confirmed [Cancel exchange] while active; view-only when closed or cancelled.

**Independent Test**: `pnpm test` for helper + API client; manual check per quickstart.md steps 2, 3, 5, 7.

- [x] T004 [P] [US2] Write failing vitest tests: (a) in frontend/src/lib/trades.test.ts for a new pure `toHandoverRows(participants)` returning one row per participant `{ name, isMe, gives: offeredClothing, givesTo: <name of participant whose receivedClothing.id === offeredClothing.id>, receives: receivedClothing, receivesFrom: <name of participant whose offeredClothing.id === receivedClothing.id> }`, preserving server order (caller first), for 2- and 3-person proposals (the caller's row holds both their give and receive); (b) in frontend/src/lib/api/proposals.test.ts (create if missing, mirror existing api tests) that `cancelProposal(eventId, proposalId)` sends `POST /proposals/{proposalId}/cancel` with no body and returns the proposal, and that a 409 `PROPOSAL_NOT_CONFIRMED` / `EVENT_CLOSED` surfaces as `ApiError` with that code
- [x] T005 [US2] Implement to pass T004: `toHandoverRows` in frontend/src/lib/trades.ts; `cancelProposal` and `useCancelProposalMutation(eventId, proposalId)` (invalidate proposal list/detail and clothing queries on settle, following `useRejectProposalMutation`) in frontend/src/lib/api/proposals.ts
- [x] T006 [US2] Write failing component tests in frontend/src/components/trade/ProposalDetail.test.tsx (keep existing T2 tests; mirror their mocking): confirmed proposal with `canCancel=true` renders the handover notice and [Cancel exchange]; tapping it opens "Cancel this exchange?"; [Keep exchange] closes without calling the API; confirming calls `cancelProposal` once and navigates to `routes.trades(eventId)`; `canCancel=false` (closed event) shows no button; cancelled proposal shows "This exchange was cancelled." and no notice/button; a 409 `PROPOSAL_NOT_CONFIRMED` closes the dialog, shows the error message, and refetches
- [x] T007 [US2] Implement to pass T006 (visual layout verified manually at 360–430px): in frontend/src/components/trade/ProposalDetail.tsx, when `status` is `confirmed` or `cancelled` render the T3 view instead of the consent UI: rows from `toHandoverRows` (per participant: "gives {title} to {givesTo}" and "receives {title} from {receivesFrom}", caller row highlighted, each garment's title/category/main photo linking to `routes.itemDetail(eventId, garment.id)`), `confirmedAt`, the always-visible notice "Confirmed. Inspect the garments in person before handing them over." (confirmed only), a "This exchange was cancelled." banner with `cancelledAt` when cancelled; show [Cancel exchange] only when `canCancel` is true; Astryx `Dialog` titled "Cancel this exchange?" with body "The whole exchange is cancelled for every participant, and all its garments become available again." and actions [Cancel exchange] / [Keep exchange] (dismissal blocked while pending); on success `router.push(routes.trades(eventId))`; on `EVENT_CLOSED` or `PROPOSAL_NOT_CONFIRMED` close the dialog, refetch, and show the error message; closed event → no cancel button. Run `/impeccable critique` on the screen within Astryx rules

**Checkpoint**: Frontend checks green (`cd frontend && pnpm lint && pnpm typecheck && pnpm test`).

## Phase 5: User Story 3 - Trades and My item detail entries (P2)

**Goal**: Confirmed/history entries reachable from T1 and C4; confirmed items locked with guidance.

**Independent Test**: Manual check per quickstart.md steps 4–6 (T008). No new pure logic beyond 020's tested `groupProposals` (confirmed/history grouping already includes `cancelled`); UI-only changes are verified manually per frontend testing.md.

- [x] T008 [US3] UI (manual verification): in frontend/src/components/clothing/MyItemDetailScreen.tsx make each "Related exchanges" row a link to `routes.tradeDetail(eventId, proposal.id)`; keep the existing lock guidance ("This item is locked for an exchange. ...") and, when `clothing.status === 'confirmed'`, add a link to the confirmed related proposal next to it; edit/delete stay disabled (existing `locked`). In frontend/src/components/trade/TradesOnboardScreen.tsx verify confirmed rows open T3 and cancelled history rows show the cancelled status (change only if they do not)

## Phase 6: Polish & Cross-Cutting

- [x] T009 Update docs to match the implementation in the same PR: docs/plans/api/13-cancel-exchange.md (`PROPOSAL_NOT_CONFIRMED` message), docs/plans/features/README.md status row 021 → Done
- [ ] T010 Run full checks and record actual results: `cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`; `cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- [ ] T011 Manual phone run per quickstart.md (create → join → register → search → request → accept → consent → cancel → close), 360–430px screenshots for T3 and C4

## Dependencies

- T001 → T002 → T003 (backend Red → Green)
- T004 can be written in parallel with T002/T003 (different area); T005 after T004; T006 → T007 after T005 and T003 (calls the endpoint)
- T008 after T007 (links target T3)
- T009–T011 last

## Parallel Example

- Backend workspace: T002 → T003. Frontend workspace in parallel: T004 → T005.

## Implementation Strategy

MVP = US1 (backend cancel; works via API and T1/T2 already). Then US2 (T3 + cancel button), then US3 (navigation polish). One commit per Red→Green cycle: (T002+T003), (T004+T005), (T006+T007), T008, T009.
