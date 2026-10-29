# Implementation Plan: Join Event (Backend)

**Branch**: `docs/backend-join-event-spec` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-join-event/spec.md`

## Summary

Add the public `GET /api/v1/entry-codes/{entry_code}` preview and `POST /api/v1/events/{event_id}/participants` join. Lookup normalizes the code and reads the event in `db.read()`. Join verifies the code in constant time, rejects closed events and case-insensitive duplicate names, then inserts the participant and token hash in one `Db.write()` transaction, returning the existing `EventSession` shape with `stats=null`. One migration adds a unique `(event_id, lower(display_name))` index as a safeguard. Request logs mask the lookup code. Rate limiting (SHOULD) is deferred.

## Technical Context

**Language/Version**: Existing Python 3.14 baseline (`backend/pyproject.toml`); no version changes.

**Primary Dependencies**: Existing FastAPI, SQLAlchemy 2.x, Pydantic v2, Alembic. No new dependencies.

**Storage**: Existing SQLite `events` and `participants`; WAL, read `BEGIN`, write `BEGIN IMMEDIATE`. One new Alembic revision adding a unique expression index on participants.

**Testing**: pytest, FastAPI TestClient, real SQLite file per test under `tmp_path`, injected clock/token generator, `monkeypatch` failure injection, `caplog`, independent sessions for concurrent joins.

**Target Platform**: Existing single-server backend with one Uvicorn worker.

**Project Type**: Web service; backend-only increment.

**Performance Goals**: No new latency target. Keep the join write transaction free of external I/O. Concurrent same-name joins complete within finite test timeouts.

**Constraints**: Body 422 → 404 (missing event or wrong code, identical) → 409 `EVENT_CLOSED` → 409 `DISPLAY_NAME_TAKEN` → insert. No authentication on either route; any `Authorization` header is ignored. No raw code/token in logs. Preserve create/read/close behavior.

**Scale/Scope**: Two endpoints, one migration, zero new tables, dependencies, or frontend changes. Participant limits remain undecided.

## Constitution Check

*GATE: Checked before research and re-evaluated after Phase 1 design.*

| Principle | Pre-research assessment | Post-design assessment |
|---|---|---|
| I. Exchange Integrity First | PASS: Entry boundary and closed-event rejection are server responsibilities. | PASS: Code, state, and name checks share the serialized write transaction, so a join cannot commit after closure; a DB index backs name uniqueness. |
| II. Test-First | PASS: No application code is written during planning. | PASS: Every test covering a behavior (including masking integration, concurrency ordering, and success logging) is written and confirmed Red before the implementation task that introduces it; no behavior is first tested after its commit. |
| III. Test Scope by Risk | PASS: Code secrecy, closed-event rejection, uniqueness, and atomicity are the primary risks. | PASS: API, service, concurrency, migration, and logging tests target them; no numeric coverage goal. |
| IV. Isolated, Deterministic Tests | PASS: Existing fixtures provide isolated SQLite. | PASS: Injected clock/token and bounded thread synchronization; no external services. |
| V. Simplicity | PASS: Extend existing layers. | PASS: No new tables, columns, limiter, or recovery mechanism; rate limiting deferred with rationale. |

**Governance outcome**: PASS. FR-013 is a SHOULD and is explicitly deferred ([R7](research.md#r7-rate-limiting-is-deferred)); session recovery stays open. No unresolved clarifications.

## Project Structure

### Documentation (this feature)

```text
specs/007-join-event/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/join-event.openapi.yaml
├── checklists/requirements.md
└── tasks.md                         # Created by /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── alembic/versions/<rev>_participants_display_name_unique.py  # New unique lower() index
├── app/
│   ├── api/
│   │   ├── errors.py                # Add 409 description
│   │   └── routers/
│   │       ├── entry_codes.py       # New GET /entry-codes/{entry_code}
│   │       └── events.py            # Add POST /{event_id}/participants (201)
│   ├── core/logging.py              # Mask entry-code path segment in request/error logs
│   ├── domain/
│   │   ├── entry_code.py            # Add normalize_entry_code
│   │   └── errors.py                # ConflictError, EventClosedError, DisplayNameTakenError, EntryCodeNotFoundError
│   ├── main.py                      # Include entry_codes router; extend bodyless 422 cleanup; disable access log at startup
│   ├── models/participant.py        # __table_args__ unique Index(event_id, lower(display_name))
│   ├── repositories/
│   │   ├── event.py                 # get_by_entry_code
│   │   └── participant.py           # list_display_names(event_id)
│   ├── schemas/event.py             # EntryCodePreview, ParticipantCreate
│   └── services/event.py            # lookup_entry_code, join; session builder with stats=None
└── tests/
    ├── api/
    │   ├── test_lookup_entry_code.py
    │   ├── test_join_event.py
    │   └── test_openapi_contract.py     # Extend for both operations
    ├── services/
    │   ├── test_join_event.py           # Order, casefold, atomicity, logging
    │   └── test_join_event_concurrency.py
    ├── unit/test_entry_code.py          # normalize_entry_code
    ├── unit/test_logging.py             # Path masking
    └── test_migrations.py               # New index present
```

**Structure Decision**: Follow `api → services → repositories → models`. The lookup gets its own router because its resource is `entry-codes`; join lives with event-scoped collections in `events.py`. Both operations go through `EventService` to share event reads and session building. No auth dependency is attached to either route.

## Phase 0: Research

Consolidated in [research.md](research.md), decisions R1–R9. Paseo's `explorer` investigated the same workspace read-only; the orchestrator verified its findings against the code. They agree on reuse points, missing errors/helpers, absent `hmac.compare_digest`, absent rate limiting, the raw-path logging exposure, and the missing display-name constraint. The explorer suggested service-only uniqueness without a migration; this plan keeps the service check as authoritative but adds the index because `docs/rules/dev/backend/database.md` requires uniqueness declared in models (R4). Test fixtures build the schema with `Base.metadata.create_all`, so the model-declared index also applies in tests. No unresolved technical clarifications.

## Phase 1: Design

### Lookup flow

1. Router receives `entry_code` as a string; no credential dependency.
2. `EventService.lookup_entry_code(code)` opens `db.read()`, normalizes with `normalize_entry_code` (`strip().upper()`), and calls `event_repo.get_by_entry_code`.
3. Missing → `EntryCodeNotFoundError`. Found → `EntryCodePreview(event_id, name, status)` for active and closed events.

### Join flow

1. `ParticipantCreate` (`ApiModel`: strips whitespace, forbids extras) validates `entryCode` (min 1) and `displayName` (1–30, no control characters). Failures → 422/400 via existing handlers.
2. `EventService.join(event_id, body)` opens `Db.write()`:
   1. `event_repo.get(event_id)`; `None` → `EntryCodeNotFoundError`.
   2. `hmac.compare_digest(normalize_entry_code(body.entry_code).encode(), event.entry_code.encode())`; false → the same error.
   3. `event.status == closed` → `EventClosedError("This event has ended, so you can't join it.")`.
   4. `body.display_name.casefold()` in `{n.casefold() for n in participant_repo.list_display_names(s, event.id)}` → `DisplayNameTakenError(details={"field": "displayName"})`.
   5. Generate token, insert `Participant` with hash via `participant_repo.add`; catch `IntegrityError` from the name index → `DisplayNameTakenError` (transaction rolls back).
   6. Build `EventSession(event=build_event_read(event, participant, None, settings), participant_token=token)` inside the transaction.
3. After commit: `logger.info("participant_joined", extra={"event_id": event.id, "participant_id": participant.id})`.

### Logging

`mask_path` in `core/logging.py` masks only the segment immediately after `/api/v1/entry-codes/` (first two characters plus `****`; segments of two or fewer characters become `****`) and preserves later segments. Apply it in `request_context`'s `request` and `unhandled_error` logs and in the registered `unhandled` handler in `api/errors.py`. An exception raised by a route is caught by the middleware, so the registered handler is tested by direct invocation. `fastapi run` imports the app before Uvicorn applies its logging configuration, which re-enables `uvicorn.access` and its raw-URL request lines; `disable_access_log()` therefore also runs at lifespan startup in `main.py`.

### Interface and storage

[join-event.openapi.yaml](contracts/join-event.openapi.yaml) defines both operations with `security: []`. [data-model.md](data-model.md) defines the new index and transitions.

### Acceptance allocation

| Requirements / outcomes | Evidence | Limitation |
|---|---|---|
| FR-001–FR-003; SC-001 | Lookup API tests: case/space variants, closed preview, exact fields, 404 message | None |
| FR-004, FR-005, FR-008; SC-002 | Join API tests: shape, trimming, 1/30 boundaries, token works on read, read never returns token | None |
| FR-006; SC-003 | Wrong-code vs missing/malformed event equality of status, code, message, details (excluding `requestId`); `compare_digest` used | Constant-time comparison of the supplied code only; missing-event responses are not timing-equalized |
| FR-007 | Closed event join 409; code checked before closure (closed + wrong code → 404) | None |
| FR-009, FR-012; SC-004 | Failure injection after insert → no rows, no success log; rejected joins leave row counts unchanged | None |
| FR-010; SC-004 | Concurrent same-name (case-variant) joins via independent sessions: one 201, one 409; index rejects direct duplicate insert | ASCII-only DB safeguard; service check covers Unicode |
| FR-011; SC-005 | caplog: one `participant_joined`, masked lookup path, no raw code/token; stored hash ≠ token | stdout logging is not durable exactly-once |
| FR-013 | Deferred | Recorded in R7 |
| SC-006 | Two operations, preview then join | None |

## Implementation Notes for `/speckit-tasks`

Dependency-ordered TDD cycles (test-author → implementer-be → commit-reviewer → commit; never commit Red alone):

1. **Domain primitives and log masking**: `normalize_entry_code`, error classes, 409 description, `mask_path`. Unit tests plus integration tests for all three log paths (request log via a not-yet-routed lookup URL, middleware `unhandled_error` via a test-only failing route, registered `unhandled` handler invoked directly) first. Lands before any endpoint so no committed state logs raw codes.
2. **Migration and model index**: migration test (via `sqlite_master`; the Inspector skips expression indexes) and duplicate-insert tests first. Lands before join so no API-created duplicates can block the upgrade.
3. **Lookup endpoint**: API and OpenAPI tests first.
4. **Join endpoint, complete**: API, service, concurrency, and OpenAPI tests for success, every rejection (validation, identical 404s, closed event, ASCII/Unicode/organizer duplicates), atomicity, name races, controlled join-first/close-first ordering, and success logging first; then one implementation and one commit.
5. **Polish**: rerun all checks and record quickstart evidence.

Log assertions filter to application loggers (`app.*`); TestClient's transport logger records full URLs and is out of scope. Ordering tests pause one transaction inside its write lock with `threading.Event`, wait until the second operation signals it is about to acquire its write transaction, then release in `finally`; they never compare timestamps.

Profiles come from fresh Paseo `list_profiles` in this feature's workspace; delegates must not delegate. Re-run checks before marking tasks done; resolve Critical/High review findings with re-review. PR work needs a separate `pr-reviewer` pass.

```bash
cd backend
uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

## Complexity Tracking

No constitution violations or additional architectural layers to justify.
