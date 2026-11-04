# Data Model: 021 Cancel and Confirmed Handover View

No schema change. Existing tables from 020.

## TradeProposal (`trade_proposals`)

| Field | Change on cancel |
|---|---|
| `status` | `confirmed` → `cancelled` |
| `end_reason` | `participant_cancelled` |
| `cancelled_at` | now |
| `ended_at` | now (same value) |
| `confirmed_at` | unchanged (kept for history) |
| `version` | unchanged |

State transition added by this feature: `confirmed → cancelled` (party, event active). `cancelled` is terminal.

## TradeParticipant (`trade_participants`)

| Field | Change on cancel |
|---|---|
| `is_confirmed` | `true` → `false` for every row |
| `response` | unchanged (keeps the consent history) |

## Clothing (`clothing`)

| Field | Change on cancel |
|---|---|
| `status` | `confirmed` → `available` for every offered garment in the proposal |
| `content_version` | unchanged (so the cancelled cycle stays suppressed) |

## ExchangeIntent

Unchanged. Intents stay `active`; the cancelled cycle is suppressed by `ended_at` vs intent `updated_at` and content versions (API 11 rule 5).

## Proposal response (read model, unchanged)

`canCancel = status == confirmed and event active`; `cancelledAt`, `endedAt`, `endReason` already serialized.
