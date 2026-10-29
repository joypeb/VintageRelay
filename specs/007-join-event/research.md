# Research: Join Event (Backend)

**Date**: 2026-10-29
**Scope**: Existing backend and repository rules; no dependency upgrades or application changes during planning.

## R1. Reuse the create-event session pieces

**Decision**: Reuse `generate_participant_token`, `hash_participant_token` (`backend/app/core/security.py`), `build_event_read` and the `EventSession` schema (`backend/app/schemas/event.py`). Build the join session with `stats=None`; `me.isOrganizer` is derived as `false` by the existing comparison with `organizer_participant_id`.

**Rationale**: The source requires the same `EventSession` shape as creation. `build_event_session` hardcodes organizer stats, so join needs a sibling builder (or a `stats` parameter), not a new response model. The token rules (32 random bytes, SHA-256 hash, unique hash column) already satisfy the shared contract.

**Alternatives considered**: A separate join response model would duplicate the contract. Returning organizer stats to regular participants contradicts the source.

## R2. Lookup normalization and constant-time join check

**Decision**: Normalize an entry code with `strip().upper()`. Lookup queries `events.entry_code` with the normalized value in `db.read()`. Join loads the event by `event_id`, then compares the normalized `entryCode` with `event.entry_code` using `hmac.compare_digest` on UTF-8 bytes.

**Rationale**: Stored codes are 6 uppercase characters from `ENTRY_CODE_ALPHABET` (`backend/app/domain/entry_code.py`), so uppercasing implements case-insensitive matching. Lookup is keyed by the code itself, so an indexed equality query is appropriate; the join path compares a client-provided secret against a known event, where the source requires constant time. Encoding to bytes avoids `compare_digest`'s ASCII-only restriction for `str`.

**Alternatives considered**: Case-insensitive SQL collation would change the existing column and migration. Rejecting non-alphabet input with 422 would let clients distinguish formats; any non-matching code is simply not found.

## R3. Indistinguishable not-found responses

**Decision**: Add `EntryCodeNotFoundError(NotFoundError)` with the source message "We couldn't find an event with this code. Check the code and try again." Raise it for unknown lookup codes and for join attempts with a nonexistent/malformed event ID or a wrong code.

**Rationale**: The source fixes the lookup message and requires join's wrong-code and missing-event cases to be identical. Using the same error class for both join cases makes identical status, code, message, and `details` structural rather than incidental.

**Alternatives considered**: The generic "Resource not found." for join is acceptable but less helpful to the P1 screen; both join cases still must share one class. "Identical" means equal status, code, message, and details; the correlation `requestId` differs per request.

## R4. Case-insensitive display-name uniqueness

**Decision**: Inside the join write transaction, load the event's existing display names and reject a match by `casefold()` with `DisplayNameTakenError` (`409 DISPLAY_NAME_TAKEN`, `details={"field": "displayName"}`). Add an Alembic revision with a unique expression index on `(event_id, lower(display_name))` as a database safeguard, declared in the model's `__table_args__`. Map an `IntegrityError` from that index to the same 409.

**Rationale**: Writes use `BEGIN IMMEDIATE` (`backend/app/core/db.py`), so the in-transaction check is authoritative under concurrent joins. `docs/rules/dev/backend/database.md` requires uniqueness declared in models. SQLite `lower()` folds ASCII only; every pair it considers equal is also equal under `casefold()`, so the index can never reject a name the service accepts, while the service additionally catches non-ASCII case variants. Event sizes are small, so loading names per join is cheap.

**Alternatives considered**: A stored `display_name_key` column would require backfilling and updating every participant insert, including existing test factories. A service-only check leaves no schema safeguard. A `NOCASE` collation is also ASCII-only and changes column semantics.

**Migration risk**: The index migration precedes the join endpoint, so only pre-existing manual data can conflict. Before upgrading a populated database, run `SELECT event_id, lower(display_name), count(*) FROM participants GROUP BY 1, 2 HAVING count(*) > 1`; resolve rows manually if any. Upgrade failure leaves the schema at the previous revision. SQLAlchemy's Inspector skips expression indexes, so migration tests inspect `sqlite_master` and verify enforcement directly.

## R5. Join check order and atomicity

**Decision**: Request body validation (422) runs first via FastAPI. Then in one `Db.write()`: event exists → code matches (both else R3 404) → event active (else `409 EVENT_CLOSED`) → name available (else 409) → insert participant with token hash → build the session. Log `participant_joined` with `event_id` and `participant_id` after commit.

**Rationale**: The source lists code verification before the closed check, so closed state is never disclosed to someone without the code. One write transaction makes participant creation and hash storage atomic, and serializes against closure so a join cannot commit after a close commits. Logging after commit matches `event_created` and `event_closed`.

**Alternatives considered**: Checking closure before the code would leak event state to code guessers.

## R6. Error definitions and OpenAPI

**Decision**: Add `ConflictError` subclasses `EventClosedError` (`EVENT_CLOSED`, shared default message "This event has ended."; join raises it with the message "This event has ended, so you can't join it.") and `DisplayNameTakenError` (`DISPLAY_NAME_TAKEN`, "This display name is already taken in this event.") in `backend/app/domain/errors.py`, the central error module. Add a 409 description to `_ERROR_DESCRIPTIONS`. Document lookup as 200/404/500 and join as 201/400/404/409/422/500. Add the lookup path to the existing bodyless 422 cleanup in `backend/app/main.py`.

**Rationale**: The shared contract lists both codes and requires central definitions. Messages are new English user-facing sentences; the contract fixes only codes.

**Alternatives considered**: Raising `HTTPException(409)` would bypass central codes.

## R7. Rate limiting is deferred

**Decision**: Do not implement FR-013 in this increment. Record the deferral in the plan.

**Rationale**: It is a SHOULD. No limiter dependency exists, the prototype runs one worker without a trusted proxy configuration (so the client IP is unreliable behind proxies), and the 32⁶ code space keeps risk low for a hackathon. Constitution V favors the practical minimum. Deferral does not provide abuse resistance for deployment; revisit before public use.

**Alternatives considered**: An in-memory fixed-window limiter keyed on `request.client.host` adds state, reset behavior, and proxy questions without agreed limits. `slowapi` adds a dependency.

## R8. Logging and confidentiality

**Decision**: Log only `participant_joined` with `event_id` and `participant_id`. Never log the entry code, display name, or token. Rejected joins and lookups emit no domain log beyond the existing request log, which records the path. Because the lookup path contains the code, the request log must mask the lookup path segment.

**Rationale**: `docs/rules/dev/backend/logging.md` forbids raw entry codes and tokens; the request middleware (`backend/app/core/logging.py`) logs `request.url.path`, which for `GET /api/v1/entry-codes/{code}` would include the raw code. Mask everything after the first two characters of that segment (for example, `K7****`).

The server's own access log is a fourth path: `setup_logging` disables `uvicorn.access`, but `fastapi run` imports the app before Uvicorn applies its logging configuration, which re-enables that logger (reproduced with `logging.config.dictConfig(uvicorn.config.LOGGING_CONFIG)`). Disable it again at lifespan startup.

**Alternatives considered**: Dropping path logging for this route loses useful request tracing. Configuring `--no-access-log` only in the Dockerfile would leave `fastapi dev` and other launches exposed.

## R9. Tests

**Decision**: API tests for both endpoints (shape, case/space normalization, closed preview, every error, identical wrong-code/missing-event bodies, token usable on read, no token in later reads); service tests with real SQLite for atomicity (failure injection after insert leaves no participant and no success log), casefold duplicates including the organizer, and concurrent same-name joins via independent sessions; a migration test asserting the new unique index; a logging test asserting masked lookup paths and no raw code/token.

**Rationale**: Follows `docs/rules/dev/backend/testing.md`, the close-event concurrency and atomicity test precedents, and the constitution's isolated SQLite requirement.
