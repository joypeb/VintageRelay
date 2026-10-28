# Data Model: Create Event

**Feature**: `001-create-event` | **Date**: 2026-10-28 | **Research**: [research.md](research.md)

This feature introduces the `events` and `participants` tables (first Alembic revision) and the API schemas for creation. Table drafts come from `docs/plans/database-design-v1.md` §3.1–3.2. Implementation types follow [research.md](research.md) R7–R9.

## Tables

### `events`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `String(36)` | PK | Lowercase hyphenated UUID v4 string |
| `name` | `String(60)` | NOT NULL | Trimmed; 1–60 code points (validated in schema) |
| `status` | `String(16)` | NOT NULL, `CheckConstraint("status IN ('active','closed')", name="status")` → `ck_events_status` | Always `active` at creation (FR-005) |
| `entry_code` | `String(6)` | NOT NULL, UNIQUE | Uppercase, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (FR-008) |
| `organizer_participant_id` | `String(36)` | NULL, FK → `participants.id` (`use_alter=True`, named constraint) | NULL only inside the creation transaction (R8) |
| `created_at` | `UtcDateTime` | NOT NULL | UTC |
| `closed_at` | `UtcDateTime` | NULL | Always NULL at creation |

### `participants`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `String(36)` | PK | UUID v4 string |
| `event_id` | `String(36)` | NOT NULL, FK → `events.id` | Owning event |
| `display_name` | `String(30)` | NOT NULL | Trimmed; 1–30 code points. Per-event case-insensitive uniqueness index is deferred to the join feature (R14) |
| `session_token_hash` | `String(64)` | NOT NULL, UNIQUE | SHA-256 hex of the raw token; raw token never stored (FR-010) |
| `created_at` | `UtcDateTime` | NOT NULL | UTC |

### Relationships and invariants

- `participants.event_id` → `events.id` (many participants per event).
- `events.organizer_participant_id` → `participants.id` (exactly one organizer per event once creation commits).
- **Invariant (SC-002, US4 AS2):** after any committed transaction, every `active` event has a non-NULL `organizer_participant_id` that references a participant whose `event_id` equals that event's `id`. Enforced by the single write transaction in `EventService.create` and by a test; no DB-level composite constraint (R8).
- Constraint names follow a `MetaData(naming_convention=...)` on `Base` (Alembic batch-mode requirement). CHECK constraints must pass an explicit `name=`, because the convention uses `%(constraint_name)s`.
- `UtcDateTime` is an application `TypeDecorator`. Migrations render it as `sa.DateTime()`, its storage type, so revisions don't import application modules.

## Domain values

| Name | Location | Values |
|---|---|---|
| `EventStatus` (`StrEnum`) | `app/domain/enums.py` | `active`, `closed` |
| `ENTRY_CODE_ALPHABET`, `ENTRY_CODE_LENGTH = 6` | `app/domain/entry_code.py` | see above |
| `ValidationReason` (`StrEnum`) | `app/schemas/common.py` | `required`, `too_long`, `invalid_type`, `invalid_characters`, `unknown_field`, `invalid` |

## State transitions

```text
(none) ──create──▶ active ──close (feature 03)──▶ closed
```

This feature only performs the creation transition; there is no draft or pending state.

## API schemas (`app/schemas/event.py`)

All inherit `ApiModel` (camelCase aliases, `from_attributes=True`). Wire shapes: [contracts/create-event.openapi.yaml](contracts/create-event.openapi.yaml).

| Schema | Fields (Python → JSON) | Notes |
|---|---|---|
| `EventCreate` (request) | `name` → `name`: `str` (strip, 1–60, no `Cc`); `organizer_display_name` → `organizerDisplayName`: `str` (strip, 1–30, no `Cc`) | Inherits `extra="forbid"` (R5) |
| `EventMe` | `participant_id`, `display_name`, `is_organizer: bool` | |
| `EventStats` | `participant_count`, `available_clothing_count`, `confirmed_exchange_count`: `int` | Creation values `1, 0, 0` (R11) |
| `EventRead` | `id`, `name`, `status: EventStatus`, `entry_code`, `entry_url`, `organizer_participant_id`, `created_at: UtcDatetime`, `closed_at: UtcDatetime \| None`, `me: EventMe`, `stats: EventStats \| None` | Same shape as read-event (02); `stats` is nullable for non-organizers there |
| `EventSession` (response) | `event: EventRead`, `participant_token: str` | Only creation and join return it (FR-011) |

## Validation rules (from spec FR-002–FR-004)

| Input condition (after trim) | Result |
|---|---|
| Field missing, `null`, or empty/whitespace-only | 422 `VALIDATION_ERROR`, reason `required` |
| `name` > 60 or `organizerDisplayName` > 30 code points | 422, reason `too_long` |
| Non-string value (number, array, object, boolean) | 422, reason `invalid_type` |
| Contains a Unicode `Cc` character (e.g. `\n`, `\t`) | 422, reason `invalid_characters` |
| Multiple invalid fields | One entry per invalid field in `details.fields` |
| Body unparseable, missing, or not a JSON object | 400 `BAD_REQUEST` (R4) |
| Unknown extra field (any value, including `null`) | 422, `field` = key as received, reason `unknown_field` |
| Declared field sent in snake_case (e.g. `organizer_display_name`, accepted via `populate_by_name`) | Validated normally; errors report the camelCase `field` |
