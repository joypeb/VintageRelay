# Research: Read Event

**Feature**: `003-read-event` | **Spec**: [spec.md](spec.md)

There were no NEEDS CLARIFICATION items in the Technical Context. Below are the design decisions for adding the first authenticated endpoint on top of the feature 001 infrastructure.

## R1. Caller resolution: `get_current_participant` dependency

- **Decision**: Add `get_current_participant` to `backend/app/api/deps.py`. It reads the bearer credential via `fastapi.security.HTTPBearer(auto_error=False)`, hashes the token with the existing `hash_participant_token`, and looks up the participant by `session_token_hash` in its own `db.read()` block. It then compares `participant.event_id` with the path `event_id`. It exposes the `CurrentParticipant` alias.
  - Missing header, a scheme other than `Bearer`, an empty credential, or an unknown token → `UnauthenticatedError` (401).
  - Known token whose `event_id` differs from the path → `NotFoundError` (404).
- **Rationale**: `docs/rules/dev/backend/api.md` puts token lookup and the event match in `deps.get_current_participant`, and `database.md` says it finishes its query in its own read transaction. With `auto_error=False`, `HTTPBearer` returns `None` instead of raising its own 403, so all failures go through the domain error handlers and the shared format. It also registers a bearer security scheme in OpenAPI. The 401 check runs before any event lookup, so a missing token returns 401 even for a non-existent event (spec Edge Cases).
- **Alternatives considered**: `Header()` with a `str` type, rejected because a missing header becomes 422 (and an optional header needs manual parsing anyway). Doing the lookup in the service, rejected because it contradicts the backend rules and would be repeated in every later authenticated endpoint.

## R2. Malformed and non-existent event IDs → 404

- **Decision**: Type the `event_id` path parameter as plain `str` with no UUID validation. Because a participant always belongs to an existing event, "path `event_id` ≠ `participant.event_id`" covers three cases: another event's ID, a non-existent ID, and a malformed ID. All three raise the same `NotFoundError`.
- **Rationale**: This satisfies FR-004 (the cases are indistinguishable) without a 422 path-validation branch, as the user confirmed. No extra query is needed to tell the cases apart.
- **Alternatives considered**: `uuid.UUID` path type, rejected because FastAPI would return 422 for malformed IDs.

## R3. Domain errors

- **Decision**: Add `UnauthenticatedError` (401, `UNAUTHENTICATED`, "Please join the event again.") and `NotFoundError` (404, `NOT_FOUND`, "Resource not found.", as in `error-handling.md`) to `app/domain/errors.py`, matching the table in `docs/rules/dev/backend/error-handling.md`. `details` is `null` for both.
- **Rationale**: These codes already exist in `api-contract.md`. The existing `AppError` handler renders them in the shared format with `requestId`.
- **Alternatives considered**: Raising `HTTPException`, rejected because routers must not raise it (`api.md`).

## R4. Service: `EventService.get(actor, event_id)`

- **Decision**: Add a read-only method to `EventService`. It opens `db.read()`, loads the event by ID (a missing event at this point is a race and raises `NotFoundError`), builds `me` from the actor, and computes `stats` only when `actor.id == event.organizer_participant_id`. It writes no data and no audit log.
- **Rationale**: Per `database.md`, the service re-reads authorization-relevant values (event state, organizer) inside its own transaction. FR-010 forbids side effects.
- **Alternatives considered**: A separate `EventReadService`, rejected because one event service is enough (Simplicity).

## R5. Stats computation

- **Decision**:
  - `participantCount`: `SELECT count(*) FROM participants WHERE event_id = ?`, using a new `participant_repo.count_by_event`.
  - `availableClothingCount` and `confirmedExchangeCount`: always `0` in this feature, because the `clothing` and `proposals` tables don't exist yet. Mark both in code with `# TODO(feature 06/11): count from clothing/proposals`. The features that add those tables replace the constants with real counts (`clothing.status = 'available'`, `proposals.status = 'confirmed'`, per `docs/plans/database-design-v1.md`) and add tests for them.
- **Rationale**: The spec Assumptions state that counts reflect only stored data. With no tables, the true count is always 0. Creating empty tables only for counting would be speculative schema work (Constitution V). Feature 001 made the same choice (R11).
- **Alternatives considered**: Creating stub `clothing` and `proposals` tables now, rejected because their schema belongs to features 06 and 11.

## R6. Shared response builder

- **Decision**: Extract `build_event_read(event, me: Participant, stats: EventStats | None, settings) -> EventRead` in `app/services/event.py`. `build_event_session` (create) calls it with `stats=EventStats(1, 0, 0)`; `get` calls it with computed stats or `None`. `is_organizer = me.id == event.organizer_participant_id`. `entry_url` keeps the existing `f"{settings.app_base_url}/join?code={event.entry_code}"`.
- **Rationale**: FR-013 requires the same shape as the create result. One builder prevents the two operations from drifting apart. Existing create tests guard the refactor.
- **Alternatives considered**: Duplicating the construction code, rejected.

## R7. Router

- **Decision**: Add `@router.get("/{event_id}")` to `app/api/routers/events.py`, defined with `def`, returning `EventRead`. The body is one service call: `service.get(me, event_id)`. Document the responses as 200 (with the `X-Request-ID` header), 401, 404, and 500 using `ErrorResponse`.
- **Rationale**: Routes stay thin and synchronous (`api.md`; feature 001 notes).

## R8. OpenAPI error responses

- **Decision**:
  - Replace the fixed `ERROR_RESPONSES` dict in `app/api/errors.py` with a small helper `error_responses(*statuses)`, built from a status→description map that now includes 401 and 404. Keep `ERROR_RESPONSES = error_responses(400, 422, 500)` so create stays unchanged. The GET route uses `error_responses(401, 404, 500)`.
  - FastAPI automatically adds a `422 HTTPValidationError` response to any operation with path parameters. The GET endpoint can never return 422: `event_id` is an unconstrained `str` and there is no body or query. So `create_app` installs a custom `app.openapi` that removes the auto-added `422` (schema `HTTPValidationError`) from **this GET operation only**. It then drops the `HTTPValidationError`/`ValidationError` components if nothing references them any more. Every other operation is untouched: create keeps its `ErrorResponse` 422, and a future endpoint with validated parameters keeps its documented 422.
- **Rationale**:
  - Follows the feature 001 convention (R17) that every route documents its real error responses with `ErrorResponse` and `X-Request-ID`.
  - The existing contract test asserts that `HTTPValidationError` doesn't appear in operations; the GET test extends that rule.
- **Alternatives considered**:
  - Documenting 422 with `ErrorResponse` on GET, rejected because the endpoint never returns it.
  - Leaving FastAPI's default, rejected because it is misleading and inconsistent with the 001 test.

## R9. Logging and secrets

- **Decision**: The read emits no audit log. The `authorization` header is already in `SENSITIVE_KEYS` (`logging.md`), and request-context logging doesn't log headers. Tests assert that the raw token doesn't appear in `caplog` output for a successful read or a 401.
- **Rationale**: FR-002 and FR-011; reads are high-frequency (home-screen polling), so an audit log entry per read adds noise.

## R10. Test strategy

- **Decision**:
  - Add test helper `add_participant(db, event_id, display_name) -> (participant, token)` in `tests/conftest.py`, which inserts a participant with a hashed token. The join API (04) doesn't exist yet. Also add helper `close_event(db, event_id, closed_at)`, because the close API (03) doesn't exist yet.
  - API tests (`tests/api/test_read_event.py`, `tests/api/test_read_event_auth.py`) cover all acceptance scenarios: regular participant, organizer, stats visibility, participant count, closed event, idempotent read with no DB change, 401 variants (missing, non-Bearer scheme, empty, unknown), 404 variants (another event, non-existent ID, malformed ID, 401-before-404), the shared error format, and no token in the body or logs.
  - Add the GET route to `tests/api/test_openapi_contract.py`: 200/401/404/500 with `ErrorResponse` and `X-Request-ID`, a bearer security scheme, no `422`, and no `HTTPValidationError` anywhere in the operation.
  - Add one service test for `EventService.get` (stats `None` for non-organizers, participant count).
- **Rationale**: `docs/rules/dev/backend/testing.md` §4 requires API tests for authorization and the error format. Tests run on a fresh SQLite file in `tmp_path` per test (Constitution IV).

## R11. Frontend and Postman

- **Decision**: Backend only. `frontend/src/types/event.ts` already defines `Event`/`EventMe`/`EventStats` matching this shape, and `apiFetch` already sends the bearer token, so a later frontend feature only adds `getEvent`. The frontend P2 banner, M1, and the closed-event banner consume this endpoint in a later frontend feature. The Postman requests `01 Events/Get event` and `08 Auth errors/Missing token` already cover this endpoint. Add `08 Auth errors/Get non-existent event` for the 404 case; cross-event 404 is covered by automated tests.
- **Rationale**: Keeps scope bounded, mirroring the split between 001 and 002.

## R12. Performance

- **Decision**: No new indexes. `participants.session_token_hash` is `UNIQUE` (indexed), `events.id` is the primary key, and the participant count is per event. Dozens of participants per event make the count query trivial. SC-006 is verified with the same local timing check as feature 001 (quickstart §3).
- **Alternatives considered**: An index on `participants.event_id`, deferred until listing participants becomes frequent. The row count is tiny.
