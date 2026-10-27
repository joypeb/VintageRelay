# Select/Withdraw Intent API

A participant selects a desired garment and, per the initial design, the owned garment they offer for it. Intents are not consent. Registering or withdrawing an intent recalculates affected proposals in the same transaction. Screens: B3, I1, T1 (My intents). Common rules: [README](README.md).

## `Intent` Schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Intent ID |
| `eventId` | string | Event ID |
| `participantId` | string | Selecting participant |
| `offeredClothing` | `ClothingSummary` | Garment offered ([schema](06-register-read-clothing.md#clothingsummary-schema)) |
| `wantedClothing` | `ClothingSummary` | Garment wanted |
| `status` | enum | `active`, `withdrawn` (by the participant), `invalidated` (a referenced garment was withdrawn) |
| `createdAt`, `updatedAt` | string | Selection/change times |

## 1. `POST /api/v1/events/{event_id}/intents`

### Headers

| Header | Required | Value |
|---|---|---|
| `Authorization` | Yes | `Bearer <participantToken>` |
| `Content-Type` | Yes | `application/json; charset=utf-8` |
| `X-Request-ID` | No | Correlation ID |

### Request Body

| Field | Type | Required | Rule |
|---|---|---|---|
| `offeredClothingId` | string | Yes | Caller's own garment in this event, `available` |
| `wantedClothingId` | string | Yes | Another participant's garment in this event, `available` |

```json
{
  "offeredClothingId": "aa11b2c3-...",
  "wantedClothingId": "3f1c2d4e-..."
}
```

### Response

- `201 Created`: new intent created; returns `Intent`.
- `200 OK`: an `active` intent with the same pair already exists; returns it without creating another.

```json
{
  "id": "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e",
  "eventId": "9a0d6c1e-2b7f-4f0a-9c8e-1d2f3a4b5c6d",
  "participantId": "5b8f0a2d-1c3e-4d5f-8a9b-0c1d2e3f4a5b",
  "offeredClothing": { "id": "aa11b2c3-...", "owner": { "participantId": "5b8f...", "displayName": "Joon", "isOrganizer": false }, "photoUrl": "https://...", "description": "White wide pants, size 28.", "status": "available", "contentVersion": 1 },
  "wantedClothing": { "id": "3f1c2d4e-...", "owner": { "participantId": "7d8e...", "displayName": "Sora", "isOrganizer": false }, "photoUrl": "https://...", "description": "Cropped green denim jacket, size M.", "status": "available", "contentVersion": 1 },
  "status": "active",
  "createdAt": "2026-10-27T06:01:00Z",
  "updatedAt": "2026-10-27T06:01:00Z"
}
```

The response does not include proposals. The frontend refreshes proposals ([11](11-proposals.md)) and alternative suggestions ([10](10-alternative-suggestions.md)) afterwards.

### Processing Rules

In **one transaction**, following the [shared check order](README.md#check-order):

1. Verify both garments exist in the caller's event (`404`).
2. Verify the offered garment is the caller's (`403 FORBIDDEN`) and the wanted garment is not (`422`, `reason: "own_clothing"`). `own_clothing` is an intentional exception to the shared order: it needs the garment lookup, so it runs after the `404` check but before replay and event state.
3. **Replay:** return the existing `active` intent for the same pair with `200`, if any. This runs before the event-state check, so a retry after closure returns the existing intent.
4. Verify the event is active.
5. Verify both garments are `available`.
6. Insert the intent. A participant may hold several intents, including different offered garments for the same wanted garment.
7. Find two-/three-person cycles that include the new intent and create `pending` proposals, reusing an existing pending proposal with the same `cycleKey` ([11](11-proposals.md#proposal-generation)).

AI recommendations never call this endpoint; only participant actions do.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 403 | `FORBIDDEN` | `offeredClothingId` is not owned by the caller |
| 404 | `NOT_FOUND` | Event or a garment does not exist, or belongs to another event |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `CLOTHING_ALREADY_CONFIRMED` | Either garment is confirmed in another exchange. `details`: `{ "clothingId": "..." }` |
| 409 | `CLOTHING_NOT_AVAILABLE` | Either garment is withdrawn. `details`: `{ "clothingId": "..." }` |
| 422 | `VALIDATION_ERROR` | Missing ID; `wantedClothingId` owned by caller (`reason: "own_clothing"`) |

### Idempotency

Idempotent per active pair, as defined in the API contract.

## 2. `GET /api/v1/events/{event_id}/intents`

Lists **the caller's** intents only. Other participants' intents are not exposed.

### Headers

`Authorization: Bearer <participantToken>` (required), `X-Request-ID` (optional).

### Query Parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `status` | enum, repeatable | `active` | `active`, `withdrawn`, `invalidated` |
| `wantedClothingId` | string | none | Filter for B3 to show [Withdraw intent] |

### Response — `200 OK`

`{ "items": [Intent], "nextCursor": null }`, ordered by `createdAt` descending.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Event does not exist, or the token belongs to another event |
| 422 | `VALIDATION_ERROR` | Invalid `status` |

## 3. `DELETE /api/v1/intents/{intent_id}`

Withdraws the caller's intent.

### Headers

`Authorization: Bearer <participantToken>` of the intent owner (required), `X-Request-ID` (optional). No body.

### Response — `204 No Content`

### Processing Rules

In **one transaction**:

1. Verify ownership.
2. **Replay:** if already `withdrawn` or `invalidated`, return `204` without changes, even after closure.
3. Verify the event is active.
4. Set `status = withdrawn` and `updatedAt = now`.
5. Mark `pending` proposals that depend on this intent as `invalidated` with `endReason = intent_changed` and `endedAt = now` ([proposal state transitions](README.md#proposal-state-transitions)).
6. Confirmed exchanges are **not** affected. Use [cancellation](13-cancel-exchange.md) to undo a confirmed exchange.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Intent does not exist, belongs to another event, or belongs to another participant (existence hidden) |
| 409 | `EVENT_CLOSED` | Event is closed |

### Idempotency

Idempotent.

## Open Decisions

- Whether the offered garment is chosen at intent time (this draft) or only during final proposal review.
