# Consent/Reject Proposal API

Each participant gives final consent to, or rejects, a specific proposal version. When every participant consents to the same version, the server confirms the exchange in one transaction. Screen: T2. Common rules: [README](README.md).

## 1. `POST /api/v1/proposals/{proposal_id}/consents`

### Headers

| Header | Required | Value |
|---|---|---|
| `Authorization` | Yes | `Bearer <participantToken>` of a proposal participant |
| `Content-Type` | Yes | `application/json; charset=utf-8` |
| `X-Request-ID` | No | Correlation ID |

### Request Body

| Field | Type | Required | Rule |
|---|---|---|---|
| `version` | integer | Yes | The proposal version the participant reviewed |

```json
{ "version": 2 }
```

### Response — `200 OK`

Returns the current `Proposal` ([schema](11-proposals.md#proposal-schema)): `pending` with the caller's response `consented`, or `confirmed` if this consent completed unanimity.

### Processing Rules

All steps run in **one write transaction** serialized with event closure (SQLite `BEGIN IMMEDIATE`):

1. Verify the caller is a participant of the proposal.
2. **Replay:** if the caller already consented to this version **and** the proposal is still `pending` or `confirmed`, return `200` with the current proposal. For `rejected`/`invalidated`/`cancelled` proposals, the recorded consent is kept for history but the request falls through to step 3: if the event is closed it returns `EVENT_CLOSED`; otherwise step 4 returns `PROPOSAL_VERSION_MISMATCH`.
3. Verify the event is active.
4. Verify `status = pending` and `version` matches. Otherwise `409 PROPOSAL_VERSION_MISMATCH`.
5. Record `response = consented` and `respondedAt`.
6. If every participant has consented to this version, confirm:
   - Recheck that all intents in the cycle are `active`, ownership is unchanged, and every offered garment is `available`.
   - Update each garment `available → confirmed` with a conditional update; if any update affects zero rows, treat it as a recheck failure (below).
   - Set `is_confirmed = true` on all participant rows (partial unique index on `offered_clothing_id` where true prevents duplicates) and `status = confirmed`, `confirmedAt`.
   - Mark other `pending` proposals containing these garments as `invalidated` with `endReason = clothing_confirmed_elsewhere` and `endedAt = now` ([proposal state transitions](README.md#proposal-state-transitions)).
7. Log `INFO` event `proposal_consented` or `proposal_confirmed` with `extra`: `proposal_id`, `event_id`.

If the confirmation recheck fails, roll back to a savepoint taken before step 5 **in the same transaction**, mark the proposal `invalidated` with the matching `endReason` and `endedAt = now` using a conditional update (`WHERE status = 'pending'`), commit, and return `409` with the code for the first failing cause. The write lock is held throughout, so a concurrent rejection or closure cannot interleave; if the conditional update affects zero rows, return the current state's error (`PROPOSAL_VERSION_MISMATCH` or `EVENT_CLOSED`) without changing `endReason`/`endedAt`:

| Recheck failure | Code | `endReason` | `details` |
|---|---|---|---|
| An intent in the cycle is no longer `active`, or a garment's owner changed | `INTENT_NOT_ACTIVE` | `intent_changed` | `{ "intentId": "..." }` |
| An offered garment is confirmed in another exchange | `CLOTHING_ALREADY_CONFIRMED` | `clothing_confirmed_elsewhere` | `{ "clothingId": "..." }` |
| An offered garment is withdrawn | `CLOTHING_NOT_AVAILABLE` | `clothing_withdrawn` | `{ "clothingId": "..." }` |

The frontend treats all three like `PROPOSAL_VERSION_MISMATCH`: show the proposal-changed modal and reload.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Proposal does not exist, belongs to another event, or the caller is not a participant (existence hidden; see [contract](../../rules/dev/common/api-contract.md#authentication-decided)) |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `PROPOSAL_VERSION_MISMATCH` | Proposal is `rejected`/`invalidated`/`cancelled`, `version` differs, or it was confirmed without the caller's consent to this version. `details`: `{ "currentStatus": "invalidated", "latestProposalId": "..." \| null }` (latest pending proposal for the same cycle, if any) |
| 409 | `CLOTHING_ALREADY_CONFIRMED` | Recheck, unique index, or conditional update detected a garment confirmed elsewhere during confirmation; all three follow the recheck-failure path above (proposal invalidated). `details`: `{ "clothingId": "..." }` |
| 409 | `CLOTHING_NOT_AVAILABLE` | Recheck found a withdrawn garment. `details`: `{ "clothingId": "..." }` |
| 409 | `INTENT_NOT_ACTIVE` | Recheck found an inactive intent or changed ownership. `details`: `{ "intentId": "..." }` |
| 422 | `VALIDATION_ERROR` | `version` missing or not a positive integer |

On `PROPOSAL_VERSION_MISMATCH`, the frontend shows the proposal-changed modal and reloads (T2 or `latestProposalId`).

## 2. `POST /api/v1/proposals/{proposal_id}/reject`

### Headers

Same as consent.

### Request Body

```json
{ "version": 2 }
```

### Response — `200 OK`

Returns the current `Proposal` with `status = rejected` and `endReason = participant_rejected`.

### Processing Rules

In **one transaction**:

1. Verify the caller is a participant.
2. **Replay:** if the proposal is already `rejected`, return `200` with it.
3. Verify the event is active.
4. Verify `status = pending` and `version` matches.
5. Record the caller's `response = rejected` and `respondedAt`, set the proposal to `rejected` with `endReason = participant_rejected` and `endedAt = now` ([proposal state transitions](README.md#proposal-state-transitions)). Other participants' consents no longer apply.
6. Intents are **not** changed. The suppression rule ([11](11-proposals.md#proposal-generation)) prevents the same cycle from being re-proposed until something changes. The participant may withdraw the intent separately.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Proposal does not exist, belongs to another event, or the caller is not a participant (existence hidden; see [contract](../../rules/dev/common/api-contract.md#authentication-decided)) |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `PROPOSAL_VERSION_MISMATCH` | Proposal is `confirmed`/`invalidated`/`cancelled`, or `version` differs |
| 422 | `VALIDATION_ERROR` | `version` missing or invalid |

## Idempotency

Both actions follow the contract's duplicate state transition table: repeating a completed action returns `200` with the current proposal and creates no duplicate rows or logs.

## Open Decisions

- Whether participants can withdraw consent before confirmation (not supported in this draft).
