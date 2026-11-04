# Read Proposals API

Proposals are two-/three-person exchange cycles calculated from active intents. The server **creates** them internally; clients only read them. Screens: Trades tab badge, T1 (Exchanges), T2, C4. Common rules: [README](README.md).

## Proposal Generation

There is no client endpoint for creating proposals. The server recalculates affected cycles inside the **same transaction** as:

- intent registration, acceptance, decline, and withdrawal ([09](09-intents.md)),
- clothing edit/withdrawal ([07](07-edit-withdraw-clothing.md)),
- exchange cancellation ([13](13-cancel-exchange.md)).

Rules:

1. A cycle is a closed loop of two or three distinct participants, each giving one `available` garment via an `active` intent and receiving the next participant's garment, all in the same event.
2. `cycleKey` is the list of (participant, offered garment, received garment) entries sorted by participant ID, so a three-person cycle has one key regardless of starting point.
3. If a `pending` proposal with the same `cycleKey` exists, reuse it (partial unique index on `(event_id, cycle_key)` while pending).
4. Otherwise insert a proposal with `version = previous version for this cycleKey + 1` (first is `1`) and one `trade_participants` row per participant with `response = pending` and the offered garment's current `offered_content_version`.
5. **Suppression:** do not recreate a cycle whose latest proposal was `rejected` or `cancelled` until one of its intents is re-created or changed, or one of its garments gets a new `contentVersion`. Without this, a rejected cycle would be re-proposed immediately because the intents are still active. The check uses `trade_proposals.ended_at`, intent `created_at`/`updated_at`, and `trade_participants.offered_content_version` ([database design 7](../database-design-v1.md#7-integrity-and-concurrency)).
6. Unconfirmed proposals may share garments. Only confirmation is exclusive.

## `Proposal` Schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Proposal ID (one version) |
| `eventId` | string | Event ID |
| `version` | integer | Version shown to participants; consent requests must send it |
| `status` | enum | `pending`, `confirmed`, `rejected`, `invalidated`, `cancelled` |
| `endReason` | enum \| null | Why it left `pending` or `confirmed` (below); `null` for `pending`/`confirmed` |
| `endDetail` | enum \| null | Which request change ended an `intent_changed` proposal: `intent_declined`, `intent_withdrawn`, `intent_invalidated`; `null` otherwise or when the cause cannot be determined (below) |
| `cycleSize` | integer | `2` or `3` |
| `participants` | array | `ProposalParticipant` per participant, in cycle order starting with the caller |
| `myResponse` | enum | Caller's response: `pending`, `consented`, `rejected` |
| `canConsent` | boolean | `status = pending`, caller's response `pending`, event active |
| `canReject` | boolean | `status = pending`, caller has not rejected, event active |
| `canCancel` | boolean | `status = confirmed`, event active |
| `createdAt` | string | Creation time |
| `confirmedAt` | string \| null | Confirmation time |
| `cancelledAt` | string \| null | Cancellation time |
| `endedAt` | string \| null | Time it became `rejected`, `invalidated`, or `cancelled`; `null` while `pending` or `confirmed` (confirmation does not set it). See [state transitions](README.md#proposal-state-transitions) |

`ProposalParticipant`:

| Field | Type | Description |
|---|---|---|
| `participant` | object | `participantId`, `displayName`, `isOrganizer` |
| `isMe` | boolean | Whether this is the caller |
| `offeredClothing` | `ClothingSummary` | Garment this participant gives ([schema](06-register-read-clothing.md#clothingsummary-schema)) |
| `receivedClothing` | `ClothingSummary` | Garment this participant receives |
| `response` | enum | `pending`, `consented`, `rejected` |
| `respondedAt` | string \| null | Response time |

`endReason` values (stored in `trade_proposals.end_reason`):

| Value | Status | Cause |
|---|---|---|
| `participant_rejected` | `rejected` | A participant rejected |
| `intent_changed` | `invalidated` | An intent was withdrawn, declined, or invalidated |
| `clothing_changed` | `invalidated` | A garment's photos, category, title, description, or measurements changed |
| `clothing_withdrawn` | `invalidated` | A garment was withdrawn |
| `clothing_confirmed_elsewhere` | `invalidated` | A garment was confirmed in another proposal |
| `event_closed` | `invalidated` | Event closed while pending |
| `participant_cancelled` | `cancelled` | A participant cancelled the confirmed exchange |

`endDetail` is derived at read time (not stored): for an `invalidated` proposal with `endReason = intent_changed`, the server finds the cycle's intents (matching each participant's offered and received garment) that became `declined`, `withdrawn`, or `invalidated` at exactly the proposal's `endedAt` (decline and withdrawal write both timestamps in the same transaction). Precedence when several match: `intent_declined` > `intent_withdrawn` > `intent_invalidated`. If none match (for example a consent recheck found an intent that had changed earlier), it is `null`. It lets clients show "Declined" even when the declined request was between two other participants of a three-person cycle.

## 1. `GET /api/v1/events/{event_id}/proposals`

Lists proposals **in which the caller participates**.

### Headers

`Authorization: Bearer <participantToken>` (required), `X-Request-ID` (optional).

### Query Parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `status` | enum, repeatable | all | T1 Exchanges: awaiting consent and 3-person found `?status=pending`, confirmed `?status=confirmed`, history `?status=rejected&status=invalidated&status=cancelled` |
| `clothingId` | string | none | Only proposals containing this garment (C4) |

### Response — `200 OK`

`{ "items": [Proposal], "nextCursor": null }`. Ordering is `createdAt` descending (decided for v1, 2026-11-03).

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Event does not exist, or the token belongs to another event |
| 422 | `VALIDATION_ERROR` | Invalid `status` |

## 2. `GET /api/v1/proposals/{proposal_id}`

Returns one proposal (T2, T3).

### Headers

`Authorization: Bearer <participantToken>` (required), `X-Request-ID` (optional).

### Response — `200 OK`

```json
{
  "id": "4c5d6e7f-8a9b-4c0d-9e1f-2a3b4c5d6e7f",
  "eventId": "9a0d6c1e-2b7f-4f0a-9c8e-1d2f3a4b5c6d",
  "version": 2,
  "status": "pending",
  "endReason": null,
  "endDetail": null,
  "cycleSize": 3,
  "participants": [
    {
      "participant": { "participantId": "5b8f...", "displayName": "Joon", "isOrganizer": false },
      "isMe": true,
      "offeredClothing": { "id": "bb22...", "owner": { "participantId": "5b8f...", "displayName": "Joon", "isOrganizer": false }, "photoUrl": "https://...", "category": "outer", "title": "Black jacket", "description": "Black jacket.", "status": "available", "contentVersion": 2 },
      "receivedClothing": { "id": "3f1c...", "owner": { "participantId": "7d8e...", "displayName": "Sora", "isOrganizer": false }, "photoUrl": "https://...", "category": "outer", "title": "Green jacket", "description": "Green jacket.", "status": "available", "contentVersion": 1 },
      "response": "pending",
      "respondedAt": null
    }
  ],
  "myResponse": "pending",
  "canConsent": true,
  "canReject": true,
  "canCancel": false,
  "createdAt": "2026-10-27T06:10:00Z",
  "confirmedAt": null,
  "cancelledAt": null,
  "endedAt": null
}
```

(Only the first participant is shown; a three-person proposal has three entries.)

`cycleKey` is internal and never returned. Non-pending proposals remain readable after closure.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Proposal does not exist, belongs to another event, or the caller is not a participant (existence hidden; see [contract](../../rules/dev/common/api-contract.md#authentication-decided)) |

## Open Decisions

- Preserving the clothing content shown at confirmation (`ClothingSummary` currently reflects live data).
- Retention of non-pending proposal history.
