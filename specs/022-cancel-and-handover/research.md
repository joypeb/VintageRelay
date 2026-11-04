# Research: 021 Cancel and Confirmed Handover View

## R1. Recalculation after cancellation

- **Decision**: After releasing garments, call the existing `_recalculate_cycles_for_clothing(s, event_id, clothing_id, now)` (`backend/app/services/clothing.py`) for each freed garment, in sorted order, inside the same `Db.write()` transaction. Flush the cancelled proposal (`ended_at` set) first.
- **Rationale**: It already builds cycles from active intents over available garments and skips cycles whose latest proposal is `rejected`/`cancelled` and suppressed (`domain/matching.is_suppressed`). Because the cancelled proposal's `ended_at` is not earlier than any unchanged intent's `updated_at` (`is_suppressed` uses strict `>`, so equality stays suppressed) and content versions are unchanged, the same cycle is suppressed while other cycles touching the freed garments can form.
- **Alternatives**: Intent-scoped `IntentService._recalculate_cycles` (needs a "new intent"; wrong shape). A new event-wide recalculation (more code, same result).

## R2. Serialization and replay order

- **Decision**: Mirror `proposal.reject()`: inside `db.write()` → load proposal (404 if missing or other event) → caller must be a party (404) → if `cancelled` return it (replay, even after closure) → event closed → `EventClosedError("This event is closed, so exchanges can no longer be cancelled.")` → status != `confirmed` → `ProposalNotConfirmedError` → mutate.
- **Rationale**: `BEGIN IMMEDIATE` already serializes with close and consent; order matches API 13 processing rules and contract 5-1.
- **Alternatives**: Version-checked cancel (API 13 has no body; proposal ID identifies the version).

## R3. Garment release

- **Decision**: Conditional `UPDATE clothing SET status='available' WHERE id=? AND status='confirmed'` per offered garment; any rowcount != 1 aborts the transaction (`InternalError`), leaving the exchange confirmed.
- **Rationale**: Confirmed garments cannot be edited or withdrawn, so a mismatch indicates corruption; failing closed satisfies FR-009.

## R4. Error class

- **Decision**: Add `ProposalNotConfirmedError(ConflictError)` with code `PROPOSAL_NOT_CONFIRMED` (already listed in api-contract.md and `frontend/src/lib/api/error-codes.ts`) and message "Only confirmed exchanges can be cancelled."
- **Alternatives**: Reuse `PROPOSAL_VERSION_MISMATCH` (contradicts API 13).

## R5. Frontend T3 placement

- **Decision**: Branch inside `ProposalDetail` on `status in ('confirmed','cancelled')` to render the handover view; keep the route `trades/[tradeId]`. A pure helper in `lib/trades.ts` turns `participants` into give/receive rows (giver, garment, receiver) with `isMe` highlight; it is unit-tested.
- **Rationale**: Route and data already exist; one component branch is the smallest change.

## R6. Cancel UX and errors

- **Decision**: `useCancelProposalMutation` → on success invalidate proposal list/detail and clothing queries, then `router.push(routes.trades(eventId))`. `EVENT_CLOSED` → refetch and show the closed state; `PROPOSAL_NOT_CONFIRMED` → refetch proposal (it changed). Dialog copy per spec clarification.

## R7. C4 links

- **Decision**: "Related exchanges" rows become links to `routes.tradeDetail(eventId, proposal.id)`; the existing lock guidance in C4 stays; when the garment is confirmed, add a link to its confirmed proposal.

## R8. Refresh cadence

- **Decision**: T3 detail polls every 10s while `confirmed` and the event is active (revised after design critique), alongside the existing 5s `pending` poll. The Trades list keeps 020's 15s poll because one query serves pending and confirmed/history together; splitting it is not justified for v1.
- **Alternatives**: Separate non-polling query for confirmed/history (more code, two requests, no user-visible gain).
