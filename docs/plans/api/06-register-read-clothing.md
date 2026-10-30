# Register/Read Clothing API

Registers a garment with 1–10 uploaded photos and a description, and returns same-event clothing lists and details. Screens: C1, C2, C4, B2, B3. Common rules: [README](README.md).

## 1. `POST /api/v1/events/{event_id}/clothing`

### Headers

| Header | Required | Value |
|---|---|---|
| `Authorization` | Yes | `Bearer <participantToken>` |
| `Content-Type` | Yes | `application/json; charset=utf-8` |
| `X-Request-ID` | No | Correlation ID |

### Request Body

| Field | Type | Required | Rule |
|---|---|---|---|
| `photoIds` | string[] | Yes | 1–10 unique photos uploaded by the caller in this event ([05](05-upload-photo.md)) and not attached to another garment. Order is kept; the first is the main photo. |
| `description` | string | Yes | Owner's description, 1–1,000 characters |

```json
{
  "photoIds": ["e4f5a6b7-c8d9-4e0f-a1b2-c3d4e5f6a7b8", "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"],
  "description": "Cropped green denim jacket, size M. Worn a few times."
}
```

### Response — `201 Created`

Returns the created `Clothing` with `status = available`, `contentVersion = 1`, and `analysis = null`. The frontend then requests AI analysis ([AI features](../ai-features-v1.md#3-clothing-analysis)) and shows C3.

### Processing Rules

1. Verify the event is active and the caller belongs to it.
2. Verify every photo belongs to the caller and event, and is unattached.
3. Insert the garment and attach all photos in order in one transaction (all or none).
4. Log `INFO` event `clothing_registered` with `extra`: `clothing_id`, `event_id`, `description_length` (never the description itself).

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Event does not exist or the token belongs to another event; or any of `photoIds` does not exist, belongs to another event, or was uploaded by another participant (existence hidden; see [contract](../../rules/dev/common/api-contract.md#authentication-decided)) |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `PHOTO_ALREADY_ATTACHED` | Photo is attached to another garment |
| 422 | `VALIDATION_ERROR` | Missing field, or description empty/too long |

### Idempotency

Not idempotent across photos. A repeated request with any of the same `photoIds` fails with `PHOTO_ALREADY_ATTACHED` and attaches nothing, which prevents duplicate garments from double taps.

## 2. `GET /api/v1/events/{event_id}/clothing`

Lists clothing in the event.

### Headers

`Authorization: Bearer <participantToken>` (required), `X-Request-ID` (optional).

### Query Parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `ownership` | enum | `all` | `mine` (C1), `others` (B2), `all` |
| `status` | enum, repeatable | all visible | `available`, `confirmed`, `withdrawn`. Example: `?status=available` |

Visibility: other participants' `withdrawn` garments are never listed. The caller's own withdrawn garments appear with `ownership=mine`.

### Response — `200 OK`

```json
{
  "items": [
    {
      "id": "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
      "eventId": "9a0d6c1e-2b7f-4f0a-9c8e-1d2f3a4b5c6d",
      "owner": { "participantId": "7d8e...", "displayName": "Sora", "isOrganizer": false },
      "isMine": false,
      "photos": [{ "id": "e4f5...", "url": "https://cdn.vintage-relay.example/photos/..." }],
      "description": "Cropped green denim jacket, size M. Worn a few times.",
      "status": "available",
      "contentVersion": 1,
      "analysis": null,
      "createdAt": "2026-10-27T05:43:00Z",
      "updatedAt": "2026-10-27T05:43:00Z"
    }
  ],
  "nextCursor": null
}
```

Default order: `createdAt` descending. No pagination (`nextCursor` is always `null`).

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Event does not exist, or the token belongs to another event |
| 422 | `VALIDATION_ERROR` | Unknown `ownership` or `status` value |

## 3. `GET /api/v1/clothing/{clothing_id}`

Returns one garment (B3, C4).

### Headers

`Authorization: Bearer <participantToken>` (required), `X-Request-ID` (optional).

### Response — `200 OK`

Returns a `Clothing`. Withdrawn garments of other participants are returned with `status = withdrawn` so screens linked from intents or proposals can explain the state.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Garment does not exist or belongs to another event |

## `Clothing` Schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Clothing ID |
| `eventId` | string | Event ID |
| `owner` | object | `participantId`, `displayName`, `isOrganizer` (organizer badge) |
| `isMine` | boolean | Whether the caller owns it |
| `photos` | object[] | 1–10 `{id, url}` in order; the first is the main photo |
| `description` | string | Owner's description, stored separately from AI estimates |
| `status` | enum | `available`, `confirmed`, `withdrawn` |
| `contentVersion` | integer | Increments when the photo or description changes |
| `analysis` | `ClothingAnalysis` \| null | Latest AI analysis; schema in [AI features](../ai-features-v1.md#21-clothinganalysis). `null` if never analyzed |
| `createdAt`, `updatedAt` | string | Registration/change times |

### `ClothingSummary` Schema

Compact form embedded in intents, proposals, alternatives, and recommendations.

| Field | Type | Description |
|---|---|---|
| `id` | string | Clothing ID |
| `owner` | object | `participantId`, `displayName`, `isOrganizer` |
| `photoUrl` | string | Main (first) photo URL |
| `description` | string | Owner's description |
| `status` | enum | `available`, `confirmed`, `withdrawn` |
| `contentVersion` | integer | Current content version |

## Open Decisions

- Whether C4 shows which participants want the garment.
- Participant/garment limits per event.
