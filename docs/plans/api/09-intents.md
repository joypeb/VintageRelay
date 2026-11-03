# Exchange Request (Intent) API

A participant requests another participant's garment and picks the owned garment they offer for it. In the UI an intent is an **exchange request**. The wanted garment's owner sees requests for their garments and can accept or decline them ([2026-11-02 redesign](../../superpowers/specs/2026-11-02-app-flow-redesign-design.md#42-exchange-requests-option-a)). Intents are not consent. Registering, accepting, declining, or withdrawing an intent recalculates affected proposals in the same transaction. Screens: B3, I1, C4, T1 (Received/Sent). Common rules: [README](README.md).

Visibility: an intent is visible to its sender and to the owner of the wanted garment. Everyone else gets `404` (existence hidden).

## `Intent` Schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Intent ID |
| `eventId` | string | Event ID |
| `participantId` | string | Sending participant |
| `offeredClothing` | `ClothingSummary` | Garment offered ([schema](06-register-read-clothing.md#clothingsummary-schema)) |
| `wantedClothing` | `ClothingSummary` | Garment wanted |
| `status` | enum | `active`, `withdrawn` (by the sender), `declined` (by the wanted garment's owner), `invalidated` (a referenced garment was withdrawn) |
| `acceptedProposalId` | string \| null | Proposal created when the owner accepted ([accept](#4-post-apiv1intentsintent_idaccept)); `null` until accepted |
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
  "offeredClothing": { "id": "aa11b2c3-...", "owner": { "participantId": "5b8f...", "displayName": "Joon", "isOrganizer": false }, "photoUrl": "https://...", "category": "bottom", "title": "White wide pants", "description": "White wide pants, size 28.", "status": "available", "contentVersion": 1 },
  "wantedClothing": { "id": "3f1c2d4e-...", "owner": { "participantId": "7d8e...", "displayName": "Sora", "isOrganizer": false }, "photoUrl": "https://...", "category": "outer", "title": "Green denim jacket", "description": "Cropped green denim jacket, size M.", "status": "available", "contentVersion": 1 },
  "status": "active",
  "acceptedProposalId": null,
  "createdAt": "2026-10-27T06:01:00Z",
  "updatedAt": "2026-10-27T06:01:00Z"
}
```

The response does not include proposals. The frontend refreshes proposals ([11](11-proposals.md)) afterwards.

### Processing Rules

In **one transaction**, following the [shared check order](README.md#check-order):

1. Verify both garments exist in the caller's event (`404`).
2. Verify the offered garment is the caller's (`403 FORBIDDEN`) and the wanted garment is not (`422`, `reason: "own_clothing"`). `own_clothing` is an intentional exception to the shared order: it needs the garment lookup, so it runs after the `404` check but before replay and event state.
3. **Replay:** return the existing `active` intent for the same pair with `200`, if any. This runs before the event-state check, so a retry after closure returns the existing intent. A `declined` or `withdrawn` intent for the same pair does not count; a new request creates a new intent.
4. Verify the event is active.
5. Verify both garments are `available`.
6. Insert the intent. A participant may hold several intents, including different offered garments for the same wanted garment.
7. Find two-/three-person cycles that include the new intent and create `pending` proposals, reusing an existing pending proposal with the same `cycleKey` ([11](11-proposals.md#proposal-generation)).

AI features never call this endpoint; only participant actions do.

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

Lists the caller's sent requests, or the requests received for the caller's garments. No other intents are exposed.

### Headers

`Authorization: Bearer <participantToken>` (required), `X-Request-ID` (optional).

### Query Parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `direction` | enum | `sent` | `sent`: intents the caller created (T1 Sent). `received`: intents whose wanted garment the caller owns (T1 Received, C4) |
| `status` | enum, repeatable | `active` | `active`, `withdrawn`, `declined`, `invalidated` |
| `wantedClothingId` | string | none | Filter by wanted garment: B3 (`sent`, shows [Withdraw request]) and C4 (`received`, requests for one item) |

### Response — `200 OK`

`{ "items": [Intent], "nextCursor": null }`, ordered by `createdAt` descending.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Event does not exist, or the token belongs to another event |
| 422 | `VALIDATION_ERROR` | Invalid `direction` or `status` |

## 3. `DELETE /api/v1/intents/{intent_id}`

Withdraws the caller's sent request.

### Headers

`Authorization: Bearer <participantToken>` of the sender (required), `X-Request-ID` (optional). No body.

### Response — `204 No Content`

### Processing Rules

In **one transaction**:

1. Verify the caller sent or received the intent (`404`), and that the caller is the sender (`403`).
2. **Replay:** if already `withdrawn`, `declined`, or `invalidated`, return `204` without changes, even after closure.
3. Verify the event is active.
4. Set `status = withdrawn` and `updatedAt = now`.
5. Mark `pending` proposals that depend on this intent as `invalidated` with `endReason = intent_changed` and `endedAt = now` ([proposal state transitions](README.md#proposal-state-transitions)).
6. Confirmed exchanges are **not** affected. Use [cancellation](13-cancel-exchange.md) to undo a confirmed exchange.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Caller owns the wanted garment instead of having sent the intent (use [decline](#5-post-apiv1intentsintent_iddecline)) |
| 404 | `NOT_FOUND` | Intent does not exist, belongs to another event, or the caller neither sent nor received it (existence hidden) |
| 409 | `EVENT_CLOSED` | Event is closed |

### Idempotency

Idempotent.

## 4. `POST /api/v1/intents/{intent_id}/accept`

The wanted garment's owner accepts a request. This creates the two-person exchange and records the owner's consent, so the sender only has to consent to confirm.

### Headers

`Authorization: Bearer <participantToken>` of the wanted garment's owner (required), `X-Request-ID` (optional). No body.

### Response — `200 OK`

Returns the resulting `Proposal` ([schema](11-proposals.md#proposal-schema)): `pending` with the caller's consent recorded, or `confirmed` when the pair's proposal already existed (the owner had an active reverse request) and the sender had already consented to that version.

### Processing Rules

In **one transaction**, following the [shared check order](README.md#check-order):

1. Verify the intent exists in the caller's event and the caller sent or received it (`404`).
2. Verify the caller owns the wanted garment (`403 FORBIDDEN` for the sender).
3. **Replay:** if `acceptedProposalId` is set and that proposal is `pending` or `confirmed`, return it with `200`, even after closure.
4. Verify the event is active.
5. Verify the intent is `active` (`409 INTENT_NOT_ACTIVE`) and both garments are `available` (`CLOTHING_ALREADY_CONFIRMED` / `CLOTHING_NOT_AVAILABLE`).
6. Create the reverse intent (caller offers the wanted garment and wants the offered garment) with the [registration](#1-post-apiv1eventsevent_idintents) rules, reusing an existing active reverse intent. Set `updatedAt = now` on both the accepted and the reverse intent: an explicit accept is a new decision, so it lifts the [suppression rule](11-proposals.md#proposal-generation) for a pair whose earlier proposal was rejected or cancelled.
7. Generate proposals as for registration ([11](11-proposals.md#proposal-generation)). This yields the two-person proposal for the pair (reused if already pending) and may also complete three-person cycles.
8. Record the caller's consent to the current version of the two-person proposal with the [consent](12-consent-reject-proposal.md) rules, which confirm it once every participant has consented.
9. Set `acceptedProposalId` on the accepted intent.

Log `INFO` event `intent_accepted` with `extra`: `intent_id`, `proposal_id`.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Caller sent the intent instead of owning the wanted garment |
| 404 | `NOT_FOUND` | Intent does not exist, belongs to another event, or the caller neither sent nor received it |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `INTENT_NOT_ACTIVE` | Intent is withdrawn, declined, or invalidated |
| 409 | `CLOTHING_ALREADY_CONFIRMED` | Either garment is confirmed in another exchange. `details`: `{ "clothingId": "..." }` |
| 409 | `CLOTHING_NOT_AVAILABLE` | Either garment is withdrawn. `details`: `{ "clothingId": "..." }` |

## 5. `POST /api/v1/intents/{intent_id}/decline`

The wanted garment's owner declines a request.

### Headers

`Authorization: Bearer <participantToken>` of the wanted garment's owner (required), `X-Request-ID` (optional). No body.

### Response — `200 OK`

Returns the current `Intent` with `status = declined`.

### Processing Rules

In **one transaction**:

1. Verify the intent exists and the caller sent or received it (`404`), and that the caller owns the wanted garment (`403`).
2. **Replay:** if already `declined`, return it with `200`, even after closure.
3. Verify the event is active, then that the intent is `active` (`409 INTENT_NOT_ACTIVE`).
4. Set `status = declined` and `updatedAt = now`.
5. Mark `pending` proposals that depend on this intent as `invalidated` with `endReason = intent_changed` and `endedAt = now`. Confirmed exchanges are not affected.

Log `INFO` event `intent_declined` with `extra`: `intent_id`, `invalidated_proposal_count`.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Caller sent the intent instead of owning the wanted garment |
| 404 | `NOT_FOUND` | Intent does not exist, belongs to another event, or the caller neither sent nor received it |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `INTENT_NOT_ACTIVE` | Intent is withdrawn or invalidated |

## Open Decisions

- None for v1: when a garment is confirmed elsewhere, only pending proposals are invalidated; other active requests stay active (decided 2026-11-03).
