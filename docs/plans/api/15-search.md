# Ranked Search API

Returns other participants' available garments ranked by how well they match search conditions (S1). Conditions come from [AI interpretation](../ai-features-v1.md#4-search-interpretation) or from manual filters (S2); this endpoint uses no AI, so it also serves as the fallback when interpretation fails. Screens: S1, S2. Common rules: [README](README.md).

## `GET /api/v1/events/{event_id}/clothing/search`

### Headers

`Authorization: Bearer <participantToken>` (required), `X-Request-ID` (optional).

### Query Parameters

All optional. Allowed after the event closes (reading only).

| Name | Type | Description |
|---|---|---|
| `category` | enum | `top`, `outer`, `bottom`, `other`. **Hard filter** |
| `color` | enum, repeatable | Color from the [vocabulary](../ai-features-v1.md#21-color-vocabulary). Example: `?color=green&color=navy` |
| `<name>Min`, `<name>Max` | number | Inclusive range in inches for a [`Measurements`](06-register-read-clothing.md#measurements-schema) field, e.g. `chestMin=20&chestMax=22`. One side may be omitted |

### Response — `200 OK`

```json
{
  "items": [
    {
      "clothing": { "id": "3f1c...", "owner": { "participantId": "7d8e...", "displayName": "Sora", "isOrganizer": false }, "photoUrl": "https://...", "category": "outer", "title": "Green denim jacket", "description": "Cropped green denim jacket, size M.", "status": "available", "contentVersion": 1 },
      "matchCount": 2,
      "missingMeasurements": false
    }
  ],
  "conditionCount": 2,
  "nextCursor": null
}
```

| Field | Description |
|---|---|
| `items[].clothing` | `ClothingSummary` ([schema](06-register-read-clothing.md#clothingsummary-schema)) |
| `items[].matchCount` | Number of matched non-category conditions |
| `items[].missingMeasurements` | `true` when measurement conditions exist and the garment has none of the requested measurements |
| `conditionCount` | Number of non-category conditions (each color and each measurement range counts as 1), for "2/2 match" labels |

### Ranking (regular code)

1. **Candidates:** same event, `status = available`, not owned by the caller (same set as Home).
2. **Category filter:** if `category` is given, drop every garment of another category.
3. **Points:** +1 per `color` found in the garment's analysis `features.colors`, counted only when the analysis is `done` for the current `contentVersion`; +1 per measurement range containing the garment's value. A missing value never matches.
4. **Order:** `matchCount` descending; ties put garments with any requested measurement before `missingMeasurements` garments; then `createdAt` descending.
5. Garments with 0 points stay in the list after the matches. With no conditions at all, the result equals Home order.

No pagination (`nextCursor` is always `null`). Results are computed per request and never stored.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Event does not exist, or the token belongs to another event |
| 422 | `VALIDATION_ERROR` | Unknown `category` or `color`; a range value that is not a number or outside `(0, 120]`; `min` greater than `max` |
