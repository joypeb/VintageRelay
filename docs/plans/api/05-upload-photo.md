# Upload Photo API

Stores a clothing photo for the caller in the event. The returned `photoId` is then attached when registering or editing clothing ([06](06-register-read-clothing.md), [07](07-edit-withdraw-clothing.md)). Screen: C2. Common rules: [README](README.md).

Uploading separately lets the photo upload while the participant types the description.

## `POST /api/v1/events/{event_id}/photos`

### Headers

| Header | Required | Value |
|---|---|---|
| `Authorization` | Yes | `Bearer <participantToken>` |
| `Content-Type` | Yes | `multipart/form-data; boundary=...` (the only non-JSON request in the API) |
| `X-Request-ID` | No | Correlation ID |

### Path Parameters

| Name | Description |
|---|---|
| `event_id` | Event ID |

### Request Body (multipart)

| Part | Type | Required | Rule |
|---|---|---|---|
| `file` | binary | Yes | One image; `image/jpeg`, `image/png`, or `image/webp`; at most 10 MB (proposed) |

### Response — `201 Created`

Returns a `Photo`.

| Field | Type | Description |
|---|---|---|
| `id` | string | Photo ID used in `photoIds` when registering clothing |
| `url` | string | Externally accessible URL for display and AI analysis |
| `contentType` | string | Stored MIME type |
| `sizeBytes` | integer | Stored size |
| `createdAt` | string | Upload time |

```json
{
  "id": "e4f5a6b7-c8d9-4e0f-a1b2-c3d4e5f6a7b8",
  "url": "https://cdn.vintage-relay.example/photos/9a0d.../e4f5a6b7....jpg",
  "contentType": "image/jpeg",
  "sizeBytes": 1834221,
  "createdAt": "2026-10-27T05:42:10Z"
}
```

### Processing Rules

1. Verify the event is active and the caller belongs to it.
2. Reject by the `Content-Length` header and while streaming once the limit is exceeded; do not buffer oversized files fully.
3. Verify the type by file signature (magic bytes), not only the declared MIME type or extension.
4. Strip EXIF metadata, including location, before storing (proposed). Normalize orientation.
5. Store under an unguessable key (UUID) and insert a `photos` row with the uploader, event, and storage location ([database design 3.4](../database-design-v1.md#34-photos--uploaded-photos)). Attaching to clothing sets `clothes.photo_id`.
6. Never log photo bytes. Log `INFO` event `photo_uploaded` with `extra`: `photo_id`, `size_bytes`, `content_type`.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed multipart body |
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Event does not exist, or the token belongs to another event |
| 409 | `EVENT_CLOSED` | Event is closed |
| 413 | `FILE_TOO_LARGE` | File exceeds the size limit. `details`: `{ "maxBytes": 10485760 }` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | File type not allowed. `details`: `{ "allowedTypes": ["image/jpeg", "image/png", "image/webp"] }` |
| 422 | `VALIDATION_ERROR` | `file` part missing or empty |
| 500 | `INTERNAL_ERROR` | Storage failure |

### Idempotency

Not idempotent. Each request stores a new photo. Unattached photos are harmless but use storage.

## Open Decisions

- Storage location and URL access policy for deployment (public unguessable URLs vs. signed URLs).
- Retention/deletion of photos, including uploaded photos never attached to clothing.
- HEIC support. Mobile browsers usually convert to JPEG on upload; verify on target devices.
- Multiple photos per garment (`clothing_photos`).
