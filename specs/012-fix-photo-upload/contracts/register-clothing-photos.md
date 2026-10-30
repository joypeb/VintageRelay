# Contract delta: clothing photos (amends 011 `register-read-clothing.openapi.yaml`)

Only the changes are listed. Everything else in 011 (auth order, error codes, status codes, list filters) is unchanged.

## `POST /api/v1/events/{eventId}/clothing` — `registerClothing`

Request (`additionalProperties: false`):

```json
{
  "photoIds": ["e4f5a6b7-...", "a1b2c3d4-..."],
  "description": "Green denim jacket, M"
}
```

| Field | Type | Rule |
|-------|------|------|
| `photoIds` | string[] | Required. `minItems: 1`, `maxItems: 10`, `uniqueItems: true`. Order is kept; the first is the main photo. Replaces `photoId`. |
| `description` | string | Unchanged (1–1000). |

New or changed errors:

| Status | Code | When |
|--------|------|------|
| 422 | `VALIDATION_ERROR` | Standard envelope (`api-contract.md` error body); `details.fields` entries: `photoIds` missing or empty → `{"field":"photoIds","reason":"required"}`; more than 10 → `{"field":"photoIds","reason":"too_long"}`; duplicate IDs → `{"field":"photoIds","reason":"invalid"}`; legacy `photoId` sent → `{"field":"photoId","reason":"unknown_field"}` |
| 404 | `NOT_FOUND` | Any ID unknown, malformed, from another event, or uploaded by another participant (one identical body) |
| 409 | `PHOTO_ALREADY_ATTACHED` | Any ID is already attached to a garment; nothing is attached |

## `Clothing` object (register, list, get responses)

```json
"photos": [
  { "id": "e4f5...", "url": "http://localhost:3000/api/v1/photos/e4f5..." },
  { "id": "a1b2...", "url": "http://localhost:3000/api/v1/photos/a1b2..." }
]
```

- `photos` (array of `{id, url}`, 1–10 items, ordered by position) **replaces** `photo`.
- List screens use `photos[0]` as the main photo.

## `GET /api/v1/photos/{photoId}` — unchanged

The URL host stays `APP_BASE_URL`. The frontend origin now forwards `/api/v1/photos/:photoId` to the backend (research R1).
