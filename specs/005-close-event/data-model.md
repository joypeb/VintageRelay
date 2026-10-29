# Data Model: Close Event

## Current storage

Reuse the existing tables. No Alembic revision is needed for this increment.

### Event (`events`)

| Field | Existing representation | Closure rule |
|---|---|---|
| `id` | String primary key | Unchanged; request identifiers remain opaque strings |
| `name` | Non-null string | Unchanged |
| `status` | String with CHECK for `active`, `closed` | Change only `active` to `closed` |
| `entry_code` | Unique string | Unchanged; no raw value in logs |
| `organizer_participant_id` | Nullable FK to `participants.id`, populated at creation | Authoritative organizer reference; unchanged |
| `created_at` | UTC-aware timestamp through `UtcDateTime` | Unchanged |
| `closed_at` | Nullable `UtcDateTime` | Set once on successful initial closure; preserved on replay |

**Behavioral invariants**: Normal creation produces active/null closure time. Successful closure produces closed/non-null closure time. Replay never clears or overwrites the closure time. The existing DB status CHECK does not enforce this time relationship; service and integration tests enforce it for supported operations. This plan does not add a stronger schema constraint.

### Participant (`participants`)

Existing fields are `id`, `event_id`, `display_name`, `session_token_hash`, and `created_at`. A participant belongs to one event; `event.organizer_participant_id == participant.id` confers organizer authority. Closure inserts, deletes, and modifies no participants. Credentials are resolved through the existing hash lookup and are never returned by closure.

## State transitions

| Before | Authorized request | After | Effects |
|---|---|---|---|
| `active`, no closure time | First organizer close | `closed`, closure time set | Conditional update and prepared result commit together; log after commit |
| `closed`, original closure time | Organizer replay | Same closed state/time | Current result; no update, clock use, or extra closure log |
| Either state | Non-organizer | Unchanged | Forbidden before replay |
| Either state | Missing/invalid credential | Unchanged | Unauthenticated |
| Either state | Other event's credential or missing event | Unchanged | Not found; no existence disclosure |
| `active` | Pre-commit failure | Original active state | Full rollback; no successful closure log |

The service's current-event checks, conditional update, refresh, summary reads, and result construction share one `Db.write()` session. Repositories do not commit. Separate reads cannot be used to make mutation decisions.

## Response projection (`EventRead`)

Reuse [the existing Event schema](../001-create-event/contracts/create-event.openapi.yaml) and [close contract](contracts/close-event.openapi.yaml).

- Event identity/details, entry information, organizer identity, and creation time remain unchanged.
- `status` is `closed`; `closedAt` is the original closure instant serialized in UTC with a `Z` suffix.
- `me` contains the organizer's participant ID/display name and `isOrganizer=true`.
- `stats` contains a real participant count including the organizer. `availableClothingCount` and `confirmedExchangeCount` remain existing zero placeholders until their source features exist. Share their calculation with the read service inside the caller's transaction.
- No `participantToken`, hash, or new response field is introduced.

## Closure activity

Use existing standard logging, not a database entity. One initial successful transition emits INFO `event_closed` with `event_id`, `participant_id`, and `invalidated_proposal_count`. The count is zero with the current schema. Existing middleware correlates request ID. Neither replay nor rolled-back closure emits a success log. Standard logging does not provide a crash-safe durable audit ledger.

## Conditional future entities

These describe proposed policy only. Do not add the following tables or transitions in this increment.

| Entity | Future fields/relationships relevant to closure | Conditional effect |
|---|---|---|
| Exchange proposal (`trade_proposals` in the database design) | Event, version, status, end reason, ending time | If approved, target-event `pending` → `invalidated`, reason `event_closed`, ending time set in the closure transaction |
| Confirmed proposal | Confirmation time and participating garments | If approved, preserve status, confirmation details, and normal visibility |
| Exchange participant association (`trade_participants` in the database design) | Proposal/participant/garments, `is_confirmed` | If approved, retain confirmed associations; closure does not release garments |
| Garment | Event, owner, availability/confirmation state | No physical-handover completion implied by closure |

Already rejected, invalidated, and cancelled proposal records would retain their historical reasons/timestamps. Other events would remain unaffected. These rules need approved policy and the real proposal/garment implementation; see [integration obligations](contracts/closure-integration.md).
