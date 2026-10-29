# Data Model: Read Event

**Feature**: `003-read-event` | **Research**: [research.md](research.md)

This feature adds **no tables, columns, or migrations**. It reads the `events` and `participants` tables created in feature 001 ([../001-create-event/data-model.md](../001-create-event/data-model.md)).

## Stored Entities (read only)

| Entity | Fields used | Notes |
|---|---|---|
| `events` | `id`, `name`, `status`, `entry_code`, `organizer_participant_id`, `created_at`, `closed_at` | `status ∈ {active, closed}`; `closed_at` is set only when closed |
| `participants` | `id`, `event_id`, `display_name`, `session_token_hash` | Caller lookup by `session_token_hash` (UNIQUE); count by `event_id` |

## Caller Resolution (`get_current_participant`, R1–R2)

| Input | Result |
|---|---|
| No `Authorization` header, non-`Bearer` scheme, or empty credential | `UnauthenticatedError` → 401 `UNAUTHENTICATED` |
| `sha256(token)` matches no `participants.session_token_hash` | 401 `UNAUTHENTICATED` |
| Participant found, `participant.event_id != path event_id` (another event, non-existent ID, malformed ID) | `NotFoundError` → 404 `NOT_FOUND` |
| Participant found, same event | Caller = participant |

The 401 checks always run before the event comparison.

## Response Schemas (existing, `app/schemas/event.py`)

Unchanged from feature 001; serialized in camelCase with UTC `Z` timestamps.

- **`EventRead`**: `id`, `name`, `status`, `entryCode`, `entryUrl`, `organizerParticipantId`, `createdAt`, `closedAt` (`null` while active), `me`, `stats`.
- **`EventMe`**: `participantId`, `displayName`, `isOrganizer` (`me.id == event.organizer_participant_id`).
- **`EventStats`** (organizer only; otherwise `stats: null`):

| Field | Source in this feature |
|---|---|
| `participantCount` | `count(participants WHERE event_id = event.id)` (includes the organizer) |
| `availableClothingCount` | `0`. The `clothing` table doesn't exist yet; feature 06 replaces this with `count(clothing WHERE status = 'available')` (R5) |
| `confirmedExchangeCount` | `0`. The `proposals` table doesn't exist yet; feature 11 replaces this with `count(proposals WHERE status = 'confirmed')` (R5) |

- `entryUrl` = `{APP_BASE_URL}/join?code={entryCode}`, built by the shared `build_event_read` (R6).

## Error Schema

Uses the existing `ErrorResponse` (`{"error": {"code", "message", "details", "requestId"}}`); `details` is `null` for 401 and 404.

## State

Read only; no state transitions. Both `active` and `closed` events are readable (FR-009).
