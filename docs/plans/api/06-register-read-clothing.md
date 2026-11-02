# Register/Read Clothing API

Registers a garment with 1–10 uploaded photos, a category, a title, a description, and optional measurements, and returns same-event clothing lists and details. Screens: P2, B3, C1, C2, C4. Common rules: [README](README.md).

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
| `category` | enum | Yes | `top` (shirts, tees, knits), `outer` (jackets, coats), `bottom` (pants, skirts), `other` (dresses, shoes, accessories) |
| `title` | string | Yes | 1–100 characters after trimming; control characters (including newlines) rejected |
| `description` | string | Yes | Owner's description, 1–1,000 characters after trimming |
| `measurements` | `Measurements` \| null | No | Optional inches, see [`Measurements` schema](#measurements-schema). Omitted, `null`, or `{}` means no measurements |

Unknown fields anywhere in the body, including inside `measurements`, are rejected.

```json
{
  "photoIds": ["e4f5a6b7-c8d9-4e0f-a1b2-c3d4e5f6a7b8", "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"],
  "category": "outer",
  "title": "Green denim jacket",
  "description": "Cropped green denim jacket, size M. Worn a few times.",
  "measurements": { "totalLength": 22.5, "chest": 21.0 }
}
```

### Response — `201 Created`

Returns the created `Clothing` with `status = available`, `contentVersion = 1`, and `analysis = null`. Once AI analysis ships, `analysis` is instead a `pending` analysis: the backend starts [clothing analysis](../ai-features-v1.md#3-clothing-analysis) asynchronously after the commit and the response does not wait for it. The C2 frontend returns to My items (C1) with a "Clothing registered." confirmation (014 returns to P2 until C1 exists).

### Processing Rules

1. Verify the event is active and the caller belongs to it.
2. Verify every photo belongs to the caller and event, and is unattached.
3. Insert the garment and attach all photos in order in one transaction (all or none).
4. Log `INFO` event `clothing_registered` with `extra`: `clothing_id`, `event_id`, `category`, `title_length`, `description_length` (never the title or description text).

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Event does not exist or the token belongs to another event; or any of `photoIds` does not exist, belongs to another event, or was uploaded by another participant (existence hidden; see [contract](../../rules/dev/common/api-contract.md#authentication-decided)) |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `PHOTO_ALREADY_ATTACHED` | Photo is attached to another garment |
| 422 | `VALIDATION_ERROR` | Missing field; 0 or more than 10 `photoIds` or a duplicate; invalid `category`; title or description empty/too long; title with control characters; measurement outside the category group, on `other`, or not in `(0, 120]` |

### Idempotency

Not idempotent across photos. A repeated request with any of the same `photoIds` fails with `PHOTO_ALREADY_ATTACHED` and attaches nothing, which prevents duplicate garments from double taps.

## 2. `GET /api/v1/events/{event_id}/clothing`

Lists clothing in the event.

### Headers

`Authorization: Bearer <participantToken>` (required), `X-Request-ID` (optional).

### Query Parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `ownership` | enum | `all` | `mine` (C1), `others` (P2 Home), `all` |
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
      "category": "outer",
      "title": "Green denim jacket",
      "description": "Cropped green denim jacket, size M. Worn a few times.",
      "measurements": { "totalLength": 22.5, "chest": 21.0, "shoulder": null, "sleeve": null, "waist": null, "hem": null, "inseam": null, "thigh": null },
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
| `category` | enum | `top`, `outer`, `bottom`, `other` (owner's choice) |
| `title` | string | Owner's trimmed title |
| `description` | string | Owner's description, stored separately from AI estimates |
| `measurements` | `Measurements` \| null | All 8 fields (number or `null`), or `null` when none were given (never zeros) |
| `status` | enum | `available`, `confirmed`, `withdrawn` |
| `contentVersion` | integer | Increments when photos, category, title, description, or measurements change |
| `analysis` | `ClothingAnalysis` \| null | Latest backend AI analysis (`pending`/`done`/`failed`/`stale`); schema in [AI features](../ai-features-v1.md#22-clothinganalysis). `null` if never started |
| `createdAt`, `updatedAt` | string | Registration/change times |

### `ClothingSummary` Schema

Compact form embedded in intents, proposals, and search results.

| Field | Type | Description |
|---|---|---|
| `id` | string | Clothing ID |
| `owner` | object | `participantId`, `displayName`, `isOrganizer` |
| `photoUrl` | string | Main (first) photo URL; all photos come from [`GET /clothing/{clothing_id}`](#3-get-apiv1clothingclothing_id) |
| `category` | enum | `top`, `outer`, `bottom`, `other` |
| `title` | string | Owner's title |
| `description` | string | Owner's description |
| `status` | enum | `available`, `confirmed`, `withdrawn` |
| `contentVersion` | integer | Current content version |

### `Measurements` Schema

Optional body measurements in inches. Each field is individually optional; each value is a number greater than 0 and at most 120.

| Category | Allowed fields |
|---|---|
| `top`, `outer` | `totalLength`, `chest`, `shoulder`, `sleeve` |
| `bottom` | `totalLength`, `waist`, `hem`, `inseam`, `thigh` |
| `other` | None (any field is rejected) |

A known field outside the category group returns `details.fields` `measurements.<name>` + `invalid`; any field on `other` returns `measurements` + `invalid`; an unknown key returns `measurements.<name>` + `unknown_field`. Unit conversion (cm) is out of scope in v1.

## Open Decisions

- Whether C4 shows which participants want the garment.
- Participant/garment limits per event.
