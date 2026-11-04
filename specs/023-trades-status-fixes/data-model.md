# Data Model: Trades Status Fixes (023)

No schema or migration changes.

## Proposal (response only)

| Field | Type | Change |
|---|---|---|
| `endDetail` | `"intent_declined" \| "intent_withdrawn" \| "intent_invalidated" \| null` | **New, read-only, derived.** Non-null only when `status = invalidated` and `endReason = intent_changed`. |

Derivation per proposal: for each participant leg, find intents with `(event_id, participant_id, offered_clothing_id = leg.offered, wanted_clothing_id = leg.received)` and status in (`declined`, `withdrawn`, `invalidated`) and `updated_at == proposal.ended_at` (causal change); map `declined → intent_declined`, `withdrawn → intent_withdrawn`, `invalidated → intent_invalidated`; take the highest precedence (`declined` > `withdrawn` > `invalidated`); `null` if none found.

## Frontend derived views (pure helpers in `lib/trades.ts`)

- `groupProposals` → `{ awaitingMyConsent, waitingForOthers, confirmed, history }`; `waitingForOthers` = pending and `myResponse = consented` (any cycle size); `history` = rejected/invalidated/cancelled (and any unknown non-pending, non-confirmed status).
- `isLiveLeg(intent, proposals)` → intent is a leg of a pending/confirmed proposal.
- `requestStageItems(sent, received, proposals)` → active, both garments `available`, not a live leg; each item `{ intent, direction, nextActor: 'owner' | 'me' }`, newest first.
- `intentStatusLabel(intent, proposals)`, `isReceivedActionable(intent, proposals, closed)`, `isSentActionable(intent, closed)`.
- `proposalStatusLabel(proposal)`, `responseLabel(response)` per research R6.
