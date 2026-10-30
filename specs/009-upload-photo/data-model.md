# Data Model: Upload Photo

## Storage changes

One Alembic revision creates the `photos` table. No existing tables change (`clothes` arrives in a later feature and will reference `photos.id`).

### Photo (`photos`)

| Field | Type | Rule |
|---|---|---|
| `id` | String(36) primary key | New UUID v4 per upload; unguessable; never reused |
| `event_id` | FK to `events.id`, non-null | Upload target event; lookup scoped by caller membership |
| `uploader_id` | FK to `participants.id`, non-null | Uploading participant; attachment (later feature) is restricted to this participant |
| `storage_location` | String, non-null, unique | Relative key `<uuid>.<ext>` under `photo_dir`; `<ext>` derives from the verified format, never the client filename |
| `content_type` | String, non-null | Verified stored MIME type: `image/jpeg`, `image/png`, or `image/webp` |
| `size_bytes` | Integer, non-null | Stored (processed) size in bytes; `<= 10485760` |
| `created_at` | `UtcDateTime`, non-null | Injected clock at upload |

**Indexes**: primary key on `id`; index on `event_id` for per-event inspection. No uniqueness beyond `id` and `storage_location` — duplicate bytes intentionally produce distinct rows.

## Read models

### Upload result (`Photo`)

| Field | Source |
|---|---|
| `id` | `photos.id` |
| `url` | `app_base_url + /api/v1/photos/{photos.id}` |
| `contentType` | `photos.content_type` |
| `sizeBytes` | `photos.size_bytes` |
| `createdAt` | `photos.created_at` (UTC ISO 8601, `Z`) |

The schema is an `ApiModel` (camelCase aliases). `url` is absolute and public: no credential is checked when viewing.

### Served bytes

`GET /api/v1/photos/{photo_id}` returns the stored file with its `content_type`, status 200. Unknown IDs return the generic `404 NOT_FOUND` error (unguessable IDs hide existence structurally).

## Upload transitions

| Precondition | Result | Effects |
|---|---|---|
| Body unparseable as multipart | `400 BAD_REQUEST` | None |
| `file` part missing or zero bytes | `422 VALIDATION_ERROR` | None |
| Missing/invalid credential | `401 UNAUTHENTICATED` | None |
| Event missing/malformed, or credential from another event | `404 NOT_FOUND` (one shared path) | None |
| Event closed | `409 EVENT_CLOSED` | None |
| Stream exceeds 10 MiB | `413 FILE_TOO_LARGE`, `details.maxBytes = 10485760` | Partial chunks discarded, no row |
| Bytes not openable as JPEG/PNG/WebP (includes disguised files and HEIC) | `415 UNSUPPORTED_MEDIA_TYPE`, `details.allowedTypes` | No row, no file |
| Valid image within limit | `201 Photo` + `photo_uploaded` log after commit | Processed file on disk + one row |
| File write fails | `500 INTERNAL_ERROR` | No row, no log |
| Row insert fails after file write | `500 INTERNAL_ERROR` | Best-effort file deletion, no success log |

Upload never changes the event, participants, or other photos. Each success creates a distinct photo even for identical bytes.
