# Data Model: 020 Exchange Requests and Proposals

**Spec**: specs/021-exchange-requests/spec.md · **DB design**: docs/plans/database-design-v1.md §§3.7–3.9, §7

## Entities

### exchange_intents

| Field | Type | Rule |
|---|---|---|
| `id` | string (UUID) | PK |
| `event_id` | FK events | Same-event enforcement |
| `participant_id` | FK participants | Sender |
| `offered_clothing_id` | FK clothes | Sender-owned, `available` at register |
| `wanted_clothing_id` | FK clothes | Other-owned, `available` at register |
| `status` | enum | `active`, `withdrawn`, `declined`, `invalidated` |
| `accepted_proposal_id` | FK trade_proposals, null | Set on accept |
| `created_at`, `updated_at` | UTC ISO8601 Z | `updatedAt` touch on accept lifts suppression |

### trade_proposals

| Field | Type | Rule |
|---|---|---|
| `id` | string (UUID) | One row per version |
| `event_id` | FK events | Scope |
| `version` | int | Per cycleKey, first 1, +1 on recreate |
| `status` | enum | `pending`, `confirmed`, `rejected`, `invalidated`, `cancelled` |
| `end_reason` | enum/null | `participant_rejected`, `intent_changed`, `clothing_changed`, `clothing_withdrawn`, `clothing_confirmed_elsewhere`, `event_closed`, `participant_cancelled` |
| `cycle_key` | string | Sorted (participant, offered, received) entries |
| `created_at`, `confirmed_at`, `cancelled_at`, `ended_at` | timestamps | `endedAt` set on rejected/invalidated/cancelled, never on confirm |

Indexes: partial unique `(event_id, cycle_key)` while `pending`.

### trade_participants

| Field | Type | Rule |
|---|---|---|
| `proposal_id` | FK trade_proposals | One version |
| `participant_id` | FK participants | 2 or 3 distinct per proposal |
| `offered_clothing_id` | FK clothes | Given by this participant |
| `offered_content_version` | int | Garment content version at proposal creation (suppression input) |
| `received_clothing_id` | FK clothes | Received from next in cycle |
| `response` | enum | `pending`, `consented`, `rejected` |
| `responded_at` | timestamp/null | Response time |
| `is_confirmed` | bool | True only for currently valid confirmed exchange |

Index: partial unique `offered_clothing_id` where `is_confirmed` true.

## State transitions (same transaction)

- Intent register/accept/decline/withdraw, clothing edit/withdraw, cancellation → recalculate affected cycles; reuse pending `cycleKey` else insert next version; mark dependents `invalidated` with matching `endReason` + `endedAt`.
- Event close is invalidate-only: mark all `pending` proposals `invalidated`/`event_closed` + `endedAt`; never recalculate or create versions.
- Consent unanimous on same version → conditional `clothes available→confirmed`, `is_confirmed=true`, `status=confirmed` + `confirmedAt`; other pending proposals sharing garments → `invalidated/cloth­ing_confirmed_elsewhere`.
- Suppression: skip recreate when latest proposal for `cycleKey` is `rejected`/`cancelled` unless after its `ended_at` an intent was created/updated or a garment `content_version` differs from `offered_content_version`.
