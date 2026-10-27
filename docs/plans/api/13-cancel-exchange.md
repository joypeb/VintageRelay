# Cancel Confirmed Exchange API

Before the event closes, any party cancels the **entire** confirmed exchange. Related garments that have not been physically handed over become available again. Screen: T3. Common rules: [README](README.md).

## `POST /api/v1/proposals/{proposal_id}/cancel`

### Headers

| Header | Required | Value |
|---|---|---|
| `Authorization` | Yes | `Bearer <participantToken>` of a proposal participant |
| `Content-Type` | No | No request body |
| `X-Request-ID` | No | Correlation ID |

### Request Body

None. The proposal ID identifies the exact confirmed version.

### Response — `200 OK`

Returns the current `Proposal` ([schema](11-proposals.md#proposal-schema)) with `status = cancelled`, `endReason = participant_cancelled`, and `cancelledAt` set.

### Processing Rules

In **one write transaction** serialized with closure and final consent:

1. Verify the caller is a participant.
2. **Replay:** if already `cancelled` (by anyone), return `200` with it, even after closure.
3. Verify the event is active.
4. Verify `status = confirmed`.
5. Set `status = cancelled`, `cancelledAt`, `endedAt = now` ([proposal state transitions](README.md#proposal-state-transitions)); set `is_confirmed = false` on all participant rows.
6. Set each garment `confirmed → available`. Since handover records do not exist yet, all garments are treated as not handed over.
7. Recalculate cycles for those garments. The cancelled cycle itself is suppressed until an intent or garment changes ([11](11-proposals.md#proposal-generation)), but other cycles may now form.
8. Log `INFO` event `proposal_cancelled` with `extra`: `proposal_id`, `cancelled_by`.

The frontend asks for confirmation first and explains that the whole exchange is cancelled for every participant.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Proposal does not exist, belongs to another event, or the caller is not a participant (existence hidden; see [contract](../../rules/dev/common/api-contract.md#authentication-decided)) |
| 409 | `EVENT_CLOSED` | Event is closed. Message: "This event is closed, so exchanges can no longer be cancelled." |
| 409 | `PROPOSAL_NOT_CONFIRMED` | Proposal is `pending`, `rejected`, or `invalidated`. Use [reject](12-consent-reject-proposal.md) for pending proposals |
| 500 | `INTERNAL_ERROR` | Transaction failed; the exchange stays confirmed |

### Idempotency

Idempotent, as defined in the API contract.

## Open Decisions

- Cancellation after partial physical handover, and whether to block cancellation once handover is recorded.
- Whether a cancellation reason is collected.
