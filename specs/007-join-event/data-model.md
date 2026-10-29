# Data Model: Join Event

## Storage changes

One Alembic revision adds a unique expression index. No new tables or columns.

### Participant (`participants`)

| Field | Existing representation | Join rule |
|---|---|---|
| `id` | String(36) primary key | New UUID v4 per join |
| `event_id` | FK to `events.id` | Target event of the join |
| `display_name` | String(30), non-null | Trimmed input, 1–30 characters, no control characters |
| `session_token_hash` | String(64), unique | SHA-256 of the newly issued token; raw token never stored |
| `created_at` | `UtcDateTime` | Injected clock at join |

**New index**: `uq_participants_event_id_display_name_lower`, unique on `(event_id, lower(display_name))`, declared in the model's `__table_args__` and created in the migration ([research R4](research.md#r4-case-insensitive-display-name-uniqueness)). The authoritative check is the service's `casefold()` comparison inside the write transaction; the index is the ASCII safeguard.

**Uniqueness scope**: All participants of the event, including the organizer.

### Event (`events`)

Read only. `entry_code` is stored as 6 uppercase characters; input is matched after `strip().upper()`. `status` decides whether join is allowed. No event field changes during join.

## Read models

### Entry-code preview

| Field | Source |
|---|---|
| `eventId` | `events.id` |
| `name` | `events.name` |
| `status` | `events.status` (`active` or `closed`) |

No entry code, organizer, timestamps, or counts are exposed.

### Join result

Existing `EventSession`: `event` is the `EventRead` for the new participant (`me.isOrganizer = false`, `stats = null`), plus `participantToken` (returned only here and on creation).

## Join transitions

| Precondition | Result | Effects |
|---|---|---|
| Event missing, malformed ID, or code mismatch | `404 NOT_FOUND` (one shared error) | None |
| Event closed, code matches | `409 EVENT_CLOSED` | None |
| Active, name taken (casefold, includes organizer) | `409 DISPLAY_NAME_TAKEN`, `details.field = displayName` | None |
| Active, name free | `201` session | One participant row with token hash; `participant_joined` log after commit |
| Failure after insert, before commit | `500 INTERNAL_ERROR` | Rollback: no participant, no success log |

Join never changes the event, the organizer, or other participants.
