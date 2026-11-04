# Contract: Cancel Confirmed Exchange

Source of truth: `docs/plans/api/13-cancel-exchange.md` and `docs/rules/dev/common/api-contract.md` (5-1, error codes). This file only pins what 021 implements.

## `POST /api/v1/proposals/{proposal_id}/cancel`

- Auth: `Authorization: Bearer <participantToken>`; no body. `operationId`: `cancelProposal`.
- `200 OK`: `Proposal` with `status="cancelled"`, `endReason="participant_cancelled"`, `cancelledAt`, `endedAt` set, `canCancel=false`.

| Order | Condition | Result |
|---|---|---|
| 1 | Missing/invalid token | 401 `UNAUTHENTICATED` |
| 2 | Proposal missing, other event, or caller not a party | 404 `NOT_FOUND` |
| 3 | Already `cancelled` | 200 current proposal (also after closure) |
| 4 | Event closed | 409 `EVENT_CLOSED`, message "This event is closed, so exchanges can no longer be cancelled." |
| 5 | Status `pending`/`rejected`/`invalidated` | 409 `PROPOSAL_NOT_CONFIRMED` |
| 6 | Transaction failure | 500 `INTERNAL_ERROR`; exchange stays confirmed |

Side effects (same transaction): participant rows `is_confirmed=false`; offered garments `confirmed → available`; cycles recalculated for those garments (cancelled cycle suppressed). Log `INFO proposal_cancelled` with `proposal_id`, `cancelled_by`.

## Frontend usage

- `cancelProposal(eventId, proposalId)` → `POST /proposals/{id}/cancel`.
- T3 reads: `GET /api/v1/proposals/{id}`; T1 confirmed `?status=confirmed`, history `?status=rejected&status=invalidated&status=cancelled`; C4 `?clothingId=`.
