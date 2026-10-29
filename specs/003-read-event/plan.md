# Implementation Plan: Read Event

**Branch**: `003-read-event` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-read-event/spec.md`

## Summary

Implement `GET /api/v1/events/{event_id}`, the first authenticated endpoint. The new shared dependency `get_current_participant` handles authentication:

- It resolves the caller from `Authorization: Bearer <participantToken>` by its SHA-256 hash.
- It returns `401 UNAUTHENTICATED` for a missing, non-Bearer, empty, or unknown token. This check runs before anything else.
- It returns `404 NOT_FOUND` when the token's event differs from the path. This one comparison also covers non-existent and malformed IDs, so the three cases are indistinguishable.

`EventService.get` then reads the event in a read transaction and returns the same `EventRead` shape as creation, built by a shared `build_event_read`:

- `me.isOrganizer` is derived from `organizer_participant_id`.
- `stats` is included only for the organizer. `participantCount` is computed; the clothing and exchange counts are `0` until features 06 and 11 add those tables.

Closed events stay readable. The read has no side effects.

## Technical Context

**Language/Version**: Python 3.14 (unchanged from feature 001)

**Primary Dependencies**: FastAPI 0.162 (`fastapi.security.HTTPBearer(auto_error=False)`), Pydantic 2.14, SQLAlchemy 2.1. No new dependencies.

**Storage**: Existing SQLite `events` and `participants` tables, read only. No migration. Uses the `db.read()` read transactions (`docs/rules/dev/backend/database.md`).

**Testing**: pytest + `TestClient`, a SQLite file per test in `tmp_path`, `caplog`. New conftest helpers insert regular participants and close events directly, because the join and close APIs don't exist yet (R10).

**Target Platform**: The existing Docker Compose backend service

**Project Type**: Web service (backend only; frontend consumers come in a later feature)

**Performance Goals**: p95 < 1 s for reads with 5 concurrent clients (SC-006); the lookups use the token-hash unique index and the primary key

**Constraints**:
- 401 before 404; no 422 for path or header shape (R1, R2).
- The raw token is never stored, logged, or returned (FR-002, FR-011).
- Shared error format with `requestId`; errors are documented in OpenAPI (FR-012).
- The read has no side effects (FR-010).
- No new `HTTPException` in routers.

**Scale/Scope**: 1 endpoint, 1 shared auth dependency, 2 domain errors, 0 tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| I. Exchange Integrity First | No exchange actions. The server enforces authorization (401/404 and organizer-only stats) and derives the organizer from `organizer_participant_id`, per the API contract. | PASS |
| II. Test-First | Each Red test batch comes before the code it covers: the auth dependency, then the service `get`, then the route/OpenAPI. The `build_event_read` refactor runs under the existing green create tests. | PASS |
| III. Test Scope by Risk | API tests cover authorization and the error format (backend testing.md §4). A service test covers the stats/organizer logic. No coverage target. | PASS |
| IV. Isolated, Deterministic Tests | Uses `tmp_path` SQLite and direct-insert fixtures; no external services. | PASS |
| V. Simplicity | No new tables or dependencies. Clothing and exchange counts are fixed at 0 until their tables exist (R5). Open decisions stay deferred: read access after closure and retention, and session recovery. | PASS |

**Post-design re-check (after Phase 1)**: PASS. The design adds one reusable dependency that the backend rules already prescribe (`deps.get_current_participant`), two exception classes from the documented hierarchy, an OpenAPI helper, and a small OpenAPI post-process that removes FastAPI's auto-added 422. It adds no new projects or patterns.

## Project Structure

### Documentation (this feature)

```text
specs/003-read-event/
├── plan.md                        # This file
├── research.md                    # Phase 0: decisions R1–R12
├── data-model.md                  # Phase 1: read-only entities, caller resolution, stats sources
├── quickstart.md                  # Phase 1: validation guide and test map
├── contracts/
│   └── read-event.openapi.yaml    # Phase 1: GET /api/v1/events/{event_id}
├── checklists/requirements.md     # From /speckit-specify
└── tasks.md                       # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

All files are modified (*(modify)*) unless marked *(new)*.

```text
backend/
├── app/
│   ├── domain/errors.py            # (modify) + UnauthenticatedError (401), NotFoundError (404) (R3)
│   ├── api/
│   │   ├── deps.py                 # (modify) + get_current_participant via HTTPBearer(auto_error=False), CurrentParticipant (R1, R2)
│   │   ├── errors.py               # (modify) error_responses(*statuses) helper incl. 401/404; ERROR_RESPONSES kept for create (R8)
│   ├── main.py                     # (modify) custom app.openapi removing FastAPI's auto-added 422 HTTPValidationError from this GET only (R8)
│   │   └── routers/events.py       # (modify) + GET /{event_id} → service.get(me, event_id) (R7)
│   ├── services/event.py           # (modify) extract build_event_read; + EventService.get (R4–R6)
│   └── repositories/
│       ├── event.py                # (modify) + get(s, event_id)
│       └── participant.py          # (modify) + get_by_token_hash, count_by_event
└── tests/
    ├── conftest.py                 # (modify) + add_participant(db, event_id, name) -> (Participant, token), close_event(db, event_id)
    ├── api/test_read_event.py      # (new) US1–US3
    ├── api/test_read_event_auth.py # (new) US4, error format, no token in logs
    ├── api/test_openapi_contract.py    # (modify) GET responses + security scheme
    └── services/test_event_service.py  # (modify) EventService.get

postman/collections/Vintage Relay API/08 Auth errors/Get non-existent event.request.yaml  # (new) 404 case (R11)
```

**Structure Decision**: Web application, backend only, extending the feature 001 layered layout (`api → services → repositories → models`). `frontend/` isn't touched. The P2 banner, M1, and the closed banner consume this endpoint in a later frontend feature.

## Implementation Notes for `/speckit-tasks`

- **TDD cycles**:
  1. **Foundational**: conftest fixtures and the `build_event_read` refactor, under the existing green tests (no new behavior).
  2. **US1 + US3 + US4**: Red with `test_read_event.py`, `test_read_event_auth.py`, the `EventService.get` service tests, and the OpenAPI GET contract test. Green with the domain errors, the repository lookups, `get_current_participant`, `EventService.get` (`stats = None`), `error_responses`, the custom `app.openapi` (this GET only), and the route.
  3. **US2**: Red with the organizer stats tests. Green with `count_by_event` and organizer stats.
- **The dependency signature** takes `event_id: str` from the path, plus `credentials: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False))`, `db: DbDep`. Raise domain errors only.
- **Placeholders** in `EventService.get`: mark the clothing and exchange zero counts with `# TODO(feature 06/11): count from clothing/proposals` (R5).
- **Router**: `def`, not `async def`. `responses={200: X-Request-ID header, **error_responses(401, 404, 500)}`.
- **No boilerplate** for the `scaffolder`; all tasks have behavior and follow `test-author` → `implementer-be` → `commit-reviewer`. The Postman request file is a non-code artifact the orchestrator may add with the polish task.

## Complexity Tracking

No constitution violations to justify.
