# Alternative Suggestions API

Finds two-/three-person cycles that would close if the caller offered **another of their available garments** for an existing intent, and lets the caller accept or reject. Regular code computes suggestions; AI is not involved. Acceptance changes the intent but is **not** final consent. Screens: P2 card, T1 (Active), A1. Common rules: [README](README.md).

Suggestions are computed on read and not stored (database design 6). Their IDs are opaque and derived deterministically by the server. Do not generate a suggestion when the caller already has another `active` intent with the same (suggested garment, wanted garment) pair.

## `AlternativeSuggestion` Schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Opaque, server-signed suggestion ID. Encodes the intent, wanted garment, offered garment at suggestion time, suggested garment, and cycle; clients must not parse it |
| `intentId` | string | Caller's intent to change |
| `wantedClothing` | `ClothingSummary` | Garment the caller wants (unchanged) |
| `currentOfferedClothing` | `ClothingSummary` | Garment currently offered |
| `suggestedOfferedClothing` | `ClothingSummary` | Caller's other garment that would complete the cycle |
| `cycleSize` | integer | `2` or `3` |
| `cycle` | array | Preview: `participant` (`participantId`, `displayName`, `isOrganizer`), `offeredClothing`, `receivedClothing` per participant, assuming acceptance |

## 1. `GET /api/v1/events/{event_id}/alternative-suggestions`

Returns suggestions for the caller.

### Headers

`Authorization: Bearer <participantToken>` (required), `X-Request-ID` (optional).

### Response — `200 OK`

```json
{
  "items": [
    {
      "id": "alt_6Jq2...",
      "intentId": "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e",
      "wantedClothing": { "id": "3f1c...", "owner": { "participantId": "7d8e...", "displayName": "B", "isOrganizer": false }, "photoUrl": "https://...", "description": "Green jacket.", "status": "available", "contentVersion": 1 },
      "currentOfferedClothing": { "id": "aa11...", "owner": { "participantId": "5b8f...", "displayName": "Me", "isOrganizer": false }, "photoUrl": "https://...", "description": "White pants.", "status": "available", "contentVersion": 1 },
      "suggestedOfferedClothing": { "id": "bb22...", "owner": { "participantId": "5b8f...", "displayName": "Me", "isOrganizer": false }, "photoUrl": "https://...", "description": "Black jacket.", "status": "available", "contentVersion": 2 },
      "cycleSize": 3,
      "cycle": [
        { "participant": { "participantId": "5b8f...", "displayName": "Me", "isOrganizer": false }, "offeredClothing": { "id": "bb22...", "...": "..." }, "receivedClothing": { "id": "3f1c...", "...": "..." } },
        { "participant": { "participantId": "7d8e...", "displayName": "B", "isOrganizer": false }, "offeredClothing": { "id": "3f1c...", "...": "..." }, "receivedClothing": { "id": "cc33...", "...": "..." } },
        { "participant": { "participantId": "9e0f...", "displayName": "C", "isOrganizer": false }, "offeredClothing": { "id": "cc33...", "...": "..." }, "receivedClothing": { "id": "bb22...", "...": "..." } }
      ]
    }
  ],
  "nextCursor": null
}
```

(`"...": "..."` abbreviates full `ClothingSummary` objects.)

### Calculation Rules

For each `active` intent of the caller (wants `W`, offers `O`) **that is not already part of a pending or confirmed proposal**, and each other `available` garment `A` the caller owns:

- **Two-person:** `W`'s owner has an active intent offering `W` and wanting `A`.
- **Three-person:** `W`'s owner has an active intent offering `W` and wanting a garment `G` of a third participant, who has an active intent offering `G` and wanting `A`.

All participants are distinct, all garments `available`, and all in the same event. Return an empty list when the event is closed. Ordering is undecided; this draft orders by `cycleSize` ascending, then by `intentId`.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Event does not exist, or the token belongs to another event |

## 2. `POST /api/v1/alternative-suggestions/{suggestion_id}/accept`

### Headers

`Authorization: Bearer <participantToken>` of the intent owner (required), `X-Request-ID` (optional). No body.

### Response — `200 OK`

| Field | Type | Description |
|---|---|---|
| `intent` | `Intent` | Updated intent with the suggested offered garment ([schema](09-intents.md#intent-schema)) |
| `proposal` | `Proposal` | Latest proposal for the completed cycle ([schema](11-proposals.md#proposal-schema)). Usually `pending` (every participant must still consent), but a replay may return any state; clients must use `status` and `canConsent` |

### Processing Rules

Decode the ID, then in **one transaction**, following the [shared check order](README.md#check-order):

1. Verify the intent exists in the caller's event and belongs to the caller (`404` otherwise; intents are private).
2. **Replay:** if the intent already offers the suggested garment and a proposal for the suggested cycle exists in any state, return `200` with the current intent and that cycle's latest proposal. This check runs before every state check below, so a double tap, or a retry after closure, returns the current result (the proposal may since have become `invalidated` or `confirmed`).
3. Verify the event is active.
4. Verify the intent is `active` and still offers the garment it offered when the suggestion was computed (otherwise the suggestion is outdated).
5. Verify the suggested garment is owned by the caller and `available`.
6. Verify the caller has no other `active` intent with the same (suggested garment, wanted garment) pair; otherwise `409 ALTERNATIVE_NO_LONGER_VALID`. This keeps the [one active intent per pair](09-intents.md) invariant.
7. Verify the other intents in the cycle are still `active` and their garments `available`.
8. Update the intent's `offeredClothingId` to the suggested garment and set `updatedAt = now` (lets the [suppression rule](11-proposals.md#proposal-generation) see the change).
9. Mark pending proposals that depended on the old offered garment for this intent as `invalidated` (`endReason = intent_changed`, `endedAt = now`; see [proposal state transitions](README.md#proposal-state-transitions)).
10. Recalculate cycles and create or reuse the pending proposal.

If any check fails, **change nothing** and return `409`. The frontend shows the explanation and reloads suggestions (T1).

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | ID cannot be decoded or its signature is invalid, or it references a missing/other-event intent or another participant's intent (existence hidden) |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `INTENT_NOT_ACTIVE` | Intent was withdrawn or invalidated |
| 409 | `CLOTHING_ALREADY_CONFIRMED` | Suggested garment was confirmed elsewhere |
| 409 | `CLOTHING_NOT_AVAILABLE` | Suggested garment was withdrawn |
| 409 | `ALTERNATIVE_NO_LONGER_VALID` | The intent's offered garment changed, the caller already has an active intent for the (suggested garment, wanted garment) pair, or the cycle no longer closes. Message: "This suggestion is no longer available because other choices changed." |

### Idempotency

See processing step 2: the replay check runs before the event-state and "still offers the old garment" checks.

## 3. `POST /api/v1/alternative-suggestions/{suggestion_id}/reject`

Declines the suggestion. Existing intents are never changed.

### Headers

`Authorization: Bearer <participantToken>` (required), `X-Request-ID` (optional). No body.

### Response — `204 No Content`

### Processing Rules

- v1 stores nothing because suggestions are not persisted. The frontend hides the rejected suggestion locally; it may reappear on another device or after reload.
- Suppressing repeated suggestions requires the optional `alternative_suggestions` table (database design 8).

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | ID cannot be decoded, or references another event |

## Open Decisions

- Persisting rejections and suppressing repeated suggestions.
- Suggestion ordering when several exist.
