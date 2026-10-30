# Research: Register/Read Clothing (Backend)

**Date**: 2026-10-30
**Scope**: Existing backend (`backend/app`) and repository rules; no dependency changes. Findings were verified against the code cited below.

## R1. `clothes` table with a unique photo reference

**Decision**: New `clothes` table (name from `docs/plans/database-design-v1.md` §3.3) declared in `app/models/clothing.py` plus one Alembic revision after `d04c8b6d5381` (photos). Columns: `id`, `event_id`, `owner_id`, `photo_id` (**unique**), `description`, `status` (check constraint `available|confirmed|withdrawn`), `content_version`, `created_at`, `updated_at`. Index `(event_id, created_at)` for the list. "Attaching" a photo means setting `clothes.photo_id`; the `photos` table does not change.

**Rationale**: The database design already states "unique `clothes.photo_id`". A unique column makes FR-004 a schema guarantee, not only a service check. `ClothingStatus` joins `EventStatus` in `app/domain/enums.py`.

**Alternatives considered**: An `attached_clothing_id` column on `photos` duplicates the relationship and needs a second write per registration.

## R2. Check order needs auth inside the handler

**Decision**: For `POST /events/{event_id}/clothing` and `GET /events/{event_id}/clothing`, the handler takes the validated body/query plus the raw `bearer_scheme` credentials, and calls the existing `get_current_participant(event_id, db, credentials)` as a plain function **inside** the handler. `GET /clothing/{clothing_id}` has nothing to validate, so it uses a new dependency `TokenParticipant` (credential → participant or 401, no event check); `get_current_participant` is refactored to call the same token lookup.

**Rationale**: The README check order is parse/validate (400/422) → 401 → 404. Verified on this FastAPI version: a dependency that raises runs **before** body and query validation (`POST` with an invalid body and failing auth dependency → 401; `GET` with a bad query → 401). Calling the auth function after FastAPI validates the arguments gives the required order with no new mechanism.

**Alternatives considered**: Keeping `CurrentParticipant` as a dependency returns 401 for requests that should be 422. A custom request-validation middleware is far more code.

## R3. Registration order, atomicity, and races

**Decision**: In one `Db.write()` (`BEGIN IMMEDIATE`): event exists (404) → event active (409 `EVENT_CLOSED`) → photo exists, same event, uploaded by caller (else the same generic 404) → photo not already referenced by a garment (409 `PHOTO_ALREADY_ATTACHED`) → insert garment with `status=available`, `content_version=1`, `created_at=updated_at=clock()`. An `IntegrityError` on the unique `photo_id` is mapped to the same 409. Log `clothing_registered` after commit.

**Rationale**: Order follows the source's processing rules (event, then photo). This deliberately differs from the generic README check order (all 404s before 409s): feature document 06 is the more specific source, and checking closure first means a closed event never reveals facts about photos. Writes are serialized by `BEGIN IMMEDIATE`, so the in-transaction check is authoritative; the unique constraint is the safety net (same pattern as the display-name index in feature 007). One row insert is the whole "create and attach", so there is no partial state (FR-003).

**Alternatives considered**: Checking the photo before closure would reveal photo facts in a closed event and depends on which check runs first.

## R4. Description validation reuses `ApiModel`

**Decision**: `ClothingCreate(photo_id: str, description: str = Field(min_length=1, max_length=1000))`. `ApiModel` already sets `str_strip_whitespace=True` and `extra="forbid"`, so trimming, space-only rejection (`string_too_short` → reason `required`), and the trimmed stored value come for free. Control characters are **not** rejected for descriptions, because owners may write line breaks.

**Rationale**: Clarify decision (trim, then validate and store the trimmed text) matches existing model behavior. Malformed `photoId` strings are not validated; they fall through to the generic 404, matching the not-found policy for IDs.

**Alternatives considered**: Reusing `reject_control_characters` would reject newlines in multi-line descriptions.

## R5. `analysis` is always `null` for now

**Decision**: The response field `analysis` is typed `None` and always `null`. No `clothing_analyses` table is created.

**Rationale**: The AI analysis feature owns that table and the `ClothingAnalysis` schema (`docs/plans/ai-features-v1.md` §2.1). Constitution V: don't build it early. That feature will widen the type.

**Alternatives considered**: Defining the full `ClothingAnalysis` schema now would add unused types to OpenAPI and frontend types.

## R6. Response building

**Decision**: `Clothing` response schema (`app/schemas/clothing.py`) with nested `owner {participantId, displayName, isOrganizer}` and `photo {id, url}`. Owner and organizer come from joining `participants` and `events`; `isOrganizer = owner.id == event.organizer_participant_id`; `isMine = owner.id == caller.id`. The photo URL comes from one helper `photo_url(settings.app_base_url, photo_id)` extracted from `PhotoService.upload`, so both features build the same URL.

**Rationale**: Reuses the existing public photo route; one URL builder avoids drift.

**Alternatives considered**: Storing the URL in the database would break if `app_base_url` changes.

## R7. List filters and visibility

**Decision**: Query `ownership: Ownership = all` (`mine|others|all`) and `status: list[ClothingStatus] | None` (repeatable). Filter: same event; ownership; then visibility `owner_id == me OR status != withdrawn`; then `status IN (...)` when given. Order `created_at DESC, id DESC` (tie-break for deterministic tests). Response `{items, nextCursor: null}`. Unknown enum values fail FastAPI query validation → the existing handler returns `422 VALIDATION_ERROR`.

**Rationale**: One query covers all FR-009/FR-010 combinations; duplicate status values are harmless in `IN`. Reads use `Db.read()` and do not check event status, so closed events stay readable.

## R8. Detail scope

**Decision**: `GET /clothing/{clothing_id}`: token → participant (401) → garment by ID whose `event_id == participant.event_id`, else generic 404 (covers missing, malformed, and foreign-event IDs). Withdrawn garments are returned as-is.

**Rationale**: Same 404 policy as other features; the participant's event is the only scope.

## R9. Event stats count

**Decision**: Replace the `available_clothing_count=0` TODO in `EventService._read` with `clothing_repo.count_available(s, event_id)`. The confirmed-exchange TODO stays for feature 11.

**Rationale**: FR-014; close-event responses use the same `_read`, so both stay consistent.

## R10. Placement and seams

**Decision**: `ClothingService(db, settings, clock, clothing_id_generator)` in `app/services/clothing.py`, mirroring `PhotoService` seams. Create and list routes live in `routers/events.py` (event-scoped collections); detail gets `routers/clothing.py` (top-level resource, like `photos.py`). Errors: new `PhotoAlreadyAttachedError(ConflictError)` with code `PHOTO_ALREADY_ATTACHED` (reserved in the shared contract).

**Rationale**: Follows `api → services → repositories → models` and the precedent of features 007 and 009.

## R11. Logging

**Decision**: After commit: `logger.info("clothing_registered", extra={"clothing_id", "event_id", "description_length"})`. Never log the description. Rejections emit nothing beyond the request log.

## R12. Not built here

**Decision**: `ClothingSummary` is not implemented; the first feature that embeds it (intents, 09) adds it. Per-event limits and "who wants this" (C4) stay open decisions.

**Rationale**: Constitution V. The spec says no operation in this feature returns the summary.

## R13. Tests

**Decision**: API tests (TestClient, tmp SQLite + tmp photo dir) per user story: success shape and stats count; the full rejection matrix including 422-before-401 ordering, identical 404 bodies for missing/foreign/other-uploader photos, closed event, attached photo and exact repeat; description boundaries 1/1000/1001 and space-only; list ownership × status × withdrawn visibility, order, other-event isolation, empty list, unknown enum 422; detail for own/other/withdrawn/foreign/missing. Service tests: unique-constraint race mapped to 409 (insert a conflicting row between check and insert via monkeypatch), log record extras with no description. Migration test: `clothes` exists with unique `photo_id`. OpenAPI test: three operations with their error statuses.

**Rationale**: Follows `docs/rules/dev/backend/testing.md` and the 007/009 test precedents.
