# Implementation Plan: Create Event

**Branch**: `001-create-event` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-create-event/spec.md`

## Summary

Implement `POST /api/v1/events`. Anyone can call it without authentication. In a single write transaction it:

- creates an **active** event with a unique 6-character entry code,
- registers the caller as the organizer participant,
- stores only a SHA-256 hash of a fresh random participant token, and
- links the organizer.

It returns an `EventSession`: the event in the read-event shape (with `entryUrl = {APP_BASE_URL}/join?code=…`) plus the raw token, returned only this once. Inputs are trimmed and validated, with field-level reasons (`required`, `too_long`, `invalid_type`, `invalid_characters`, `unknown_field`). Malformed bodies return `400 BAD_REQUEST`.

This is the first backend feature, so it also builds the minimum shared infrastructure: settings, SQLite/SQLAlchemy sessions, Alembic, request ID logging, and the shared error format ([research.md](research.md) R2). The backend runs with Docker Compose: one `backend` service, with the SQLite file on a named volume and no separate DB container (R15).

## Technical Context

**Language/Version**: Python 3.14 (`backend/pyproject.toml` `requires-python >=3.14`)

**Primary Dependencies**: FastAPI 0.162 (`fastapi[standard]`), Pydantic 2.14, and the new dependencies `sqlalchemy>=2.1`, `alembic>=1.20`, `pydantic-settings>=2.16` (R1)

**Storage**: SQLite file (`DATABASE_URL`; `sqlite:////data/app.db` on the Compose named volume `backend-data`, `sqlite:///./data/app.db` for local runs), with WAL, `foreign_keys=ON`, and separate read (`BEGIN`) and write (`BEGIN IMMEDIATE`) engines (`docs/rules/dev/backend/database.md`)

**Testing**: pytest 9.2 with FastAPI `TestClient`, a real SQLite file per test in `tmp_path`, `caplog`, and `monkeypatch`. One Alembic migration test (R13).

**Target Platform**: Docker Compose on a single always-on Linux host: one `backend` container (official uv Python 3.14 image, one worker) with a persistent named volume (R15)

**Project Type**: Web service (backend API of a web app; frontend screens H1/H2 are out of scope here)

**Performance Goals**: p95 < 1 s for event creation with up to 5 concurrent creation requests (SC-006). Verified by a local timing check against the Compose stack (tasks T061, quickstart §4).

**Constraints**:
- Raw tokens and raw entry codes never appear in stored participant data or in logs (SC-005).
- All-or-nothing creation (FR-007).
- Shared error format with `requestId` matching `X-Request-ID`, including on 500 responses (R12). Error responses are documented in OpenAPI (R17).
- Exception logs never render exception messages, and SQL parameters are hidden (R12).
- CORS: only the `APP_BASE_URL` origin; allows `Authorization`, `Content-Type`, and `X-Request-ID`; exposes `X-Request-ID` (FR-016, R16).
- camelCase JSON; UTC timestamps with a `Z` suffix.
- Python pinned to 3.14 (`backend/.python-version`).

**Scale/Scope**: A handful of organizers per day, dozens of participants per event; 1 endpoint and 2 tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| I. Exchange Integrity First | No exchange rules involved. The organizer and event integrity (organizer is a participant of the same event; no organizer-less active event) is enforced by the server in one write transaction and verified by tests (R8). | PASS |
| II. Test-First | `tasks.md` orders each test task before the implementation it covers, in cycles F1–F3, US1+US4, US2, and US3. US4's atomicity tests are in the US1 Red batch, because the single-transaction service implements them. No test is allowed to pass on first run. | PASS |
| III. Test Scope by Risk | API tests cover the error formats and key response fields (common testing.md §2). Service tests cover the integrity risks (atomicity, token hashing, code uniqueness). There is no coverage target. | PASS |
| IV. Isolated, Deterministic Tests | `tmp_path` SQLite per test. Randomness (entry code generator) and the clock are injectable. No external services; AI isn't used. | PASS |
| V. Simplicity | Only the infrastructure this endpoint exercises. `stats` is built from creation facts, without the clothing and proposal tables (R11). Deferred: the composite same-event FK, the display-name index, session recovery, and rate limiting. | PASS |

**Post-design re-check (after Phase 1)**: PASS. The design artifacts add no new projects, patterns, or dependencies beyond R1, and they keep open decisions deferred. Unknown fields now follow the shared schema rule (`extra="forbid"`, R5), so no rule deviations remain. After `/speckit-analyze`, the TDD ordering (atomicity tests, middleware tests, settings tests) was fixed in tasks.md, and CORS (R16), OpenAPI error responses (R17), and safe exception logging (R12) were added. Docker Compose adds only runtime packaging. It doesn't change test isolation (pytest still runs on the host and in CI) or the single-writer guarantee (one container, one worker).

## Project Structure

### Documentation (this feature)

```text
specs/001-create-event/
├── plan.md                         # This file
├── research.md                     # Phase 0: decisions R1–R17
├── data-model.md                   # Phase 1: tables, schemas, validation rules
├── quickstart.md                   # Phase 1: validation guide and test map
├── contracts/
│   └── create-event.openapi.yaml   # Phase 1: POST /api/v1/events contract
├── checklists/requirements.md      # From /speckit-specify
└── tasks.md                        # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

New files unless marked *(modify)*. The layout follows `docs/rules/dev/backend/project-structure.md`.

```text
compose.yaml                        # backend service, named volume backend-data:/data, healthcheck (R15)
backend/
├── Dockerfile                      # uv python3.14 image; uv sync --locked --no-dev; alembic upgrade head && fastapi run
├── .dockerignore
├── .python-version                 # 3.14 (uv python pin)
├── .env.example                    # DATABASE_URL, APP_BASE_URL, LOG_LEVEL, LOG_FORMAT
├── pyproject.toml                  # (modify) add sqlalchemy, alembic, pydantic-settings via uv add
├── uv.lock                         # (modify)
├── alembic.ini
├── alembic/
│   ├── env.py                      # render_as_batch=True, target_metadata=Base.metadata, URL from Settings
│   └── versions/<rev>_create_events_and_participants.py
├── app/
│   ├── main.py                     # (modify) create_app(settings, db): lifespan Db, request ID middleware, CORS (outermost), handlers, /api/v1 routers
│   ├── core/
│   │   ├── config.py               # Settings + get_settings (DATABASE_URL, APP_BASE_URL, LOG_LEVEL, LOG_FORMAT)
│   │   ├── db.py                   # make_engine (pragmas, hide_parameters), Db(url): read()/write()/write_engine/dispose()
│   │   ├── logging.py              # setup_logging, Json/Text formatters (safe exceptions), mask, request_id_var, request_context middleware (500 inside, R12)
│   │   └── security.py             # generate_participant_token, hash_participant_token (R7)
│   ├── api/
│   │   ├── deps.py                 # get_db / get_settings_dep from app.state, get_event_service
│   │   ├── errors.py               # handlers (400 vs 422, ordered reason mapping) + ERROR_RESPONSES for OpenAPI (R17)
│   │   └── routers/events.py       # POST /events → EventService.create (thin, status_code=201)
│   ├── schemas/
│   │   ├── common.py               # ApiModel, UtcDatetime serializer, ValidationReason, no-control-char validator
│   │   ├── error.py                # ValidationFieldError, ErrorBody, ErrorResponse (R17)
│   │   └── event.py                # EventCreate, EventMe, EventStats, EventRead, EventSession
│   ├── services/event.py           # EventService.create (one db.write(); build_event_session inside; code retry; audit log after commit)
│   ├── repositories/
│   │   ├── event.py                # entry_code_exists, add, set_organizer
│   │   └── participant.py          # add
│   ├── models/
│   │   ├── base.py                 # DeclarativeBase + naming_convention, UtcDateTime TypeDecorator
│   │   ├── event.py
│   │   └── participant.py
│   └── domain/
│       ├── enums.py                # EventStatus
│       ├── errors.py               # AppError hierarchy (only what's needed; InternalError for code-retry exhaustion)
│       └── entry_code.py           # alphabet + generate_entry_code (secrets)
└── tests/
    ├── conftest.py                 # (modify) settings, db (tmp_path), app = create_app(settings, db), client, client_no_raise
    ├── unit/test_{entry_code,security,config,schemas_common,logging}.py
    ├── services/test_{db,event_service,event_atomicity,entry_code_retry}.py
    ├── api/test_{error_format,cors,create_event,create_event_atomicity,create_event_sharing,create_event_validation,openapi_contract}.py
    └── test_migrations.py

docs/plans/api/01-create-event.md   # (modify) add invalid_type, invalid_characters, unknown_field, and 400 cases to the Errors table (R14)
docs/rules/dev/backend/README.md    # (modify) add docker compose commands to Common Commands (R15)
backend/.gitignore                  # (modify) add data/
postman/collections/Vintage Relay API/08 Auth errors/Create event with unknown field.request.yaml
```

**Structure Decision**: Web application, backend only. All code lives under the existing `backend/` uv project, and `compose.yaml` sits at the repository root so the frontend can be added as a service later. The code uses the layered layout `api → services → repositories → models`, with `domain` kept pure. The existing `tests/api/test_health.py` must keep passing with the new `client` fixture. `frontend/` isn't touched by this feature.

## Implementation Notes for `/speckit-tasks`

- **TDD order**: as finalized in [tasks.md](tasks.md): F1 (domain helpers) → F2 (settings, schema base, formatters, db) → F3 (request ID, errors, CORS, app factory) → US1+US4 → US2 → US3 → Polish.
- **Boilerplate**: `alembic.ini` and `env.py`, `uv add`, the empty package `__init__.py` files, the `Dockerfile`, `.dockerignore`, and `compose.yaml` have no behavior, so the `scaffolder` can produce them (AGENTS.md). Verify the Docker files manually with quickstart §2.
- **Router**: `def`, not `async def` (synchronous DB access).
- **Services**: raise only domain errors, never `HTTPException`.

## Complexity Tracking

No constitution violations to justify.
