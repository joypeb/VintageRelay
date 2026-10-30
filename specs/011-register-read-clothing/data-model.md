# Data Model: Register/Read Clothing

## Storage changes

One Alembic revision (after `d04c8b6d5381`, photos) creates `clothes`. No existing table changes.

### Clothing (`clothes`)

| Field | Type | Rule |
|---|---|---|
| `id` | String(36) primary key | New UUID v4 per registration |
| `event_id` | FK `events.id`, non-null | Registration event |
| `owner_id` | FK `participants.id`, non-null | Registering participant |
| `photo_id` | FK `photos.id`, non-null, **unique** | One photo per garment; a photo attaches to at most one garment |
| `description` | String(1000), non-null | Trimmed owner text, 1–1,000 characters |
| `status` | String(16), non-null, check `available|confirmed|withdrawn` | `available` on creation |
| `content_version` | Integer, non-null | `1` on creation; later features increment it on photo/description change |
| `created_at` | `UtcDateTime`, non-null | Injected clock |
| `updated_at` | `UtcDateTime`, non-null | Equal to `created_at` on creation |

**Indexes**: PK `id`; unique `photo_id`; `(event_id, created_at)` for the list.

`ClothingStatus` (`available`, `confirmed`, `withdrawn`) is added to `app/domain/enums.py`. This feature only writes `available`; features 07 and 12 make the other transitions.

## Read model: `Clothing`

| Field | Source |
|---|---|
| `id` | `clothes.id` |
| `eventId` | `clothes.event_id` |
| `owner.participantId` | `clothes.owner_id` |
| `owner.displayName` | `participants.display_name` |
| `owner.isOrganizer` | `owner_id == events.organizer_participant_id` |
| `isMine` | `owner_id == caller.id` |
| `photo.id` | `clothes.photo_id` |
| `photo.url` | `photo_url(settings.app_base_url, photo_id)` (same URL as the upload response) |
| `description` | `clothes.description` |
| `status` | `clothes.status` |
| `contentVersion` | `clothes.content_version` |
| `analysis` | Always `null` until the AI analysis feature |
| `createdAt`, `updatedAt` | `clothes.created_at`, `clothes.updated_at` (UTC ISO 8601 `Z`) |

List response: `{ "items": Clothing[], "nextCursor": null }`.

## Visibility

| Caller relation | Status | In list | In detail |
|---|---|---|---|
| Owner | any | Yes (`mine`, `all`) | Yes |
| Other participant, same event | `available`, `confirmed` | Yes (`others`, `all`) | Yes |
| Other participant, same event | `withdrawn` | No | Yes |
| Other event | any | No | `404` |

## Registration transitions

| Precondition (checked in this order) | Result | Effects |
|---|---|---|
| Body invalid: missing field, description empty/space-only/over 1,000, unknown field | `422 VALIDATION_ERROR` | None |
| Missing/invalid credential | `401 UNAUTHENTICATED` | None |
| Event missing/malformed, or credential from another event | `404 NOT_FOUND` | None |
| Event closed | `409 EVENT_CLOSED` | None |
| Photo missing, in another event, or uploaded by someone else | `404 NOT_FOUND` (identical body) | None |
| Photo already referenced by a garment (incl. repeat or race) | `409 PHOTO_ALREADY_ATTACHED` | None |
| Otherwise | `201 Clothing` + `clothing_registered` log after commit | One `clothes` row |

Reads never change state and are allowed in closed events. The event's `stats.availableClothingCount` counts `clothes` rows with `status = available`.
