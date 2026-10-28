---

description: "Task list for feature 001-create-event"
---

# Tasks: Create Event

**Input**: Design documents from `/specs/001-create-event/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/create-event.openapi.yaml](contracts/create-event.openapi.yaml), [quickstart.md](quickstart.md)

**Tests**: Required (Constitution II).
- Every behavior's test task comes before the implementation task that covers it.
- Run each test and confirm it fails for the expected reason (Red) before implementing.
- No test in this plan is allowed to be green on first run. If one is, report it as a planning defect; don't treat it as acceptable.

**Organization**: Tasks are grouped by user story. US4 (atomicity) shares US1's cycle, because the single-transaction service in US1 *is* the atomicity behavior; its tests must be Red before that service exists.

**Delegates** (AGENTS.md):
- Each task names its Paseo profile. Tasks with no listed agent are done by the orchestrator (docs and API artifacts only).
- Every test → implementation cycle ends with a `commit-reviewer` review and then a commit. Never commit a Red state alone.
- Checks for every backend cycle: `cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 from spec.md
- **Paths**: `backend/app/`, `backend/tests/{unit,services,api}/`, `backend/alembic/`, root `compose.yaml`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Set up the interpreter, dependencies, and package skeleton. This is pure boilerplate with no behavior, so there are no tests (`scaffolder` → `commit-reviewer` → commit).

- [X] T001 Pin the interpreter in `backend/` with `uv python pin 3.14`, which creates `backend/.python-version`. Then run `uv sync` so `.venv` is recreated on 3.14; it currently runs 3.15.0. Verify `uv run python --version` prints `3.14.x` (research R1) — agent: `scaffolder`
- [X] T002 Add runtime dependencies with `uv add "sqlalchemy>=2.1" "alembic>=1.20" "pydantic-settings>=2.16"` in `backend/`, updating `backend/pyproject.toml` and `backend/uv.lock` (R1) — agent: `scaffolder`
- [X] T003 [P] Create empty package files `backend/app/core/__init__.py`, `backend/app/api/__init__.py`, `backend/app/api/routers/__init__.py`, `backend/app/schemas/__init__.py`, `backend/app/services/__init__.py`, `backend/app/repositories/__init__.py`, and `backend/app/models/__init__.py` — agent: `scaffolder`
- [X] T004 [P] Add `data/` to `backend/.gitignore`, keeping the existing `*.db*` and `.env*` / `!.env.example` rules — agent: `scaffolder`
- [X] T005 [P] Create `backend/.env.example`. Each key gets a one-line `#` description and a safe value: `DATABASE_URL=sqlite:///./data/app.db`, `APP_BASE_URL=http://localhost:3000` (the frontend public origin, also the only CORS origin), `LOG_LEVEL=INFO`, and `LOG_FORMAT=text` (`text`|`json`) (R1, `docs/rules/dev/common/tech-stack.md`) — agent: `scaffolder`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure that every endpoint relies on (R2, R6, R7, R9, R12, R16). There are three TDD cycles, F1–F3; each cycle's tests come before its implementation.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Cycle F1 — domain helpers

- [X] T006 [P] Write `backend/tests/unit/test_entry_code.py`:
  - `ENTRY_CODE_ALPHABET == "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"` (32 characters) and `ENTRY_CODE_LENGTH == 6`.
  - Across 1,000 calls, every result of `generate_entry_code()` from `app.domain.entry_code` is exactly 6 characters, all of them in the alphabet, with none of `0`, `O`, `1`, `I`.
  - Agent: `test-author`.
- [X] T007 [P] Write `backend/tests/unit/test_security.py`:
  - `generate_participant_token()` from `app.core.security` returns a string of length ≥ 43 matching `^[A-Za-z0-9_-]+$`, and two calls return different values.
  - `hash_participant_token(t) == hashlib.sha256(t.encode()).hexdigest()`; the result is 64 lowercase hex characters and differs from `t`.
  - Agent: `test-author`.
- [X] T008 [P] Implement `backend/app/domain/entry_code.py` (stdlib only): `ENTRY_CODE_ALPHABET`, `ENTRY_CODE_LENGTH = 6`, and `generate_entry_code()` using `secrets.choice` (R6). Makes T006 pass — agent: `implementer-be`
- [X] T009 [P] Implement `backend/app/core/security.py`: `generate_participant_token()` returns `secrets.token_urlsafe(32)`, and `hash_participant_token(token)` returns the SHA-256 hex digest (R7). Makes T007 pass — agent: `implementer-be`

### Cycle F2 — settings, schema base, logging formatters, database

- [ ] T010 [P] Write `backend/tests/unit/test_config.py`:
  - With `monkeypatch.delenv` for all four keys, `Settings()` from `app.core.config` has `database_url == "sqlite:///./data/app.db"`, `app_base_url == "http://localhost:3000"`, `log_level == "INFO"`, and `log_format == "text"`.
  - `monkeypatch.setenv` of `DATABASE_URL`, `APP_BASE_URL`, `LOG_LEVEL`, and `LOG_FORMAT=json` overrides each value.
  - `LOG_FORMAT=xml` raises `ValidationError`.
  - A `.env` file in the working directory is *not* read (create one in `tmp_path` and `monkeypatch.chdir`).
  - Agent: `test-author`.
- [ ] T011 [P] Write `backend/tests/unit/test_schemas_common.py`, using an `ApiModel` subclass from `app.schemas.common` with fields `created_at: UtcDatetime` and `display_name: str`:
  - `model_dump(by_alias=True, mode="json")` of `datetime(2026, 10, 27, 5, 30, tzinfo=UTC)` gives `"createdAt": "2026-10-27T05:30:00.000Z"`.
  - The input `{"createdAt": ..., "displayName": "  Mina  "}` validates, and `display_name == "Mina"` (stripped).
  - An unknown key raises a `ValidationError` of type `extra_forbidden`.
  - Agent: `test-author`.
- [ ] T012 [P] Write `backend/tests/unit/test_logging.py`, testing `app.core.logging`:
  - `mask()` replaces with `"***"` the value of any key containing `authorization`, `cookie`, `token`, `session`, `api_key`, `entry_code`, or `image` (case-insensitive), and keeps `event_id`.
  - `JsonFormatter().format(record)` parses as JSON with `ts`, `level`, `logger`, `msg`, `request_id`, and the `extra` keys, and masks an `extra` key `participant_token`.
  - For a record whose `exc_info` comes from `raise ValueError("token=SECRET123") from KeyError("code=K7P3QX")`, both `JsonFormatter` and `TextFormatter` output contain `ValueError`, `KeyError`, and a traceback frame line, but neither `SECRET123` nor `K7P3QX` (R12).
  - After `setup_logging(Settings(log_format="json"))` has been called twice, the root logger has exactly one handler owned by the app, and `logging.getLogger("app.services.event").propagate is True` (R13).
  - Agent: `test-author`.
- [ ] T013 [P] Write `backend/tests/services/test_db.py`, using `Db(f"sqlite:///{tmp_path / 'db.sqlite'}")` from `app.core.db`:
  - Inside `db.read()`, `PRAGMA foreign_keys` is 1, `PRAGMA journal_mode` is `"wal"`, and `PRAGMA busy_timeout` is 5000.
  - `db.write()` commits on normal exit and rolls back when the block raises.
  - Calling `execute` on a session created by the write sessionmaker outside `begin()` raises, because `autobegin=False`.
  - A test-local `Table` with a `UtcDateTime` column (from `app.models.base`) round-trips an aware UTC datetime and returns `tzinfo == UTC`.
  - Inserting a duplicate value `"SECRET123"` into a unique column raises `sqlalchemy.exc.IntegrityError`, and `"SECRET123"` does not appear in `str(exc)` (`hide_parameters=True`, R12).
  - `db.dispose()` closes both engines.
  - Agent: `test-author`.
- [ ] T014 [P] Implement `backend/app/core/config.py`:
  - `Settings(BaseSettings)` with `database_url: str = "sqlite:///./data/app.db"`, `app_base_url: str = "http://localhost:3000"`, `log_level: str = "INFO"`, and `log_format: Literal["text", "json"] = "text"`.
  - `model_config = SettingsConfigDict(env_file=None)`, so no `.env` is read.
  - `get_settings()` wrapped in `functools.lru_cache`.
  - Makes T010 pass — agent: `implementer-be`.
- [ ] T015 [P] Implement `backend/app/schemas/common.py`:
  - `ApiModel(BaseModel)` with `ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", from_attributes=True, str_strip_whitespace=True)`.
  - `UtcDatetime = Annotated[datetime, PlainSerializer(...)]`, which serializes as `YYYY-MM-DDTHH:MM:SS.mmmZ` after converting to UTC (R9).
  - Makes T011 pass — agent: `implementer-be`.
- [ ] T016 [P] Implement `backend/app/core/logging.py`, without the middleware (that comes in T026):
  - `request_id_var: ContextVar[str]` (default `"-"`), `SENSITIVE_KEYS`, and `mask()`.
  - `JsonFormatter` and `TextFormatter`. Both render exceptions safely: for each exception in the `__cause__`/`__context__` chain, emit `type(exc).__qualname__` and `traceback.format_tb(exc.__traceback__)`, never `str(exc)` (R12).
  - `setup_logging(settings)`: install or replace one app-owned stdout `StreamHandler` on the root logger, set the level from `settings.log_level`, choose the formatter from `settings.log_format`, disable `uvicorn.access`, never set `propagate=False`, and never use `disable_existing_loggers`. The function is idempotent.
  - Makes T012 pass — agent: `implementer-be`.
- [ ] T017 Implement `backend/app/core/db.py`, following `docs/rules/dev/backend/database.md`:
  - `make_engine(url: str, begin_sql: str) -> Engine`:
    - `create_engine(url, connect_args={"check_same_thread": False, "timeout": 5}, hide_parameters=True)`.
    - A `connect` listener that sets `isolation_level = None` and the pragmas `foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout = 5000`, and `synchronous = NORMAL`.
    - A `begin` listener that executes `begin_sql`.
  - `class Db`:
    - `__init__(self, url: str)` creates the read engine (`"BEGIN"`) and the write engine (`"BEGIN IMMEDIATE"`), with sessionmakers using `expire_on_commit=False` and `autobegin=False`.
    - `read()` and `write()` are context managers that yield a `Session` inside `s.begin()`.
    - A `write_engine` property and `dispose()`.
  - Makes T013 pass. Depends on T014 — agent: `implementer-be`.
- [ ] T018 [P] Implement `backend/app/models/base.py`:
  - `Base(DeclarativeBase)` with `metadata = MetaData(naming_convention={"ix": "ix_%(column_0_label)s", "uq": "uq_%(table_name)s_%(column_0_name)s", "ck": "ck_%(table_name)s_%(constraint_name)s", "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s", "pk": "pk_%(table_name)s"})`.
  - A `UtcDateTime` `TypeDecorator` (`impl = DateTime`, `cache_ok = True`) that converts aware values to naive UTC on bind, rejects naive input with `ValueError`, and attaches `UTC` on result (R9).
  - Makes the `UtcDateTime` part of T013 pass — agent: `implementer-be`.

### Cycle F3 — request ID, error format, CORS, app factory

- [ ] T019 [P] Write `backend/tests/api/test_error_format.py`. Build a fresh app with `create_app(settings, db)` (fixtures from T021) and add test-only routes with `app.add_api_route`.
  - A provided `X-Request-ID: t-1` is echoed in the response header. Without the header, a non-empty ID is generated.
  - `GET /api/v1/does-not-exist` returns 404 with the body `{"error": {"code": "NOT_FOUND", "message": <str>, "details": null, "requestId": <X-Request-ID header>}}`.
  - A route raising a test-local `AppError` subclass (`status_code = 409`, `code = "CONFLICT"`) returns 409 and that code.
  - A route raising `RuntimeError("secret-detail")`, called through `client_no_raise`, returns 500 with `code: "INTERNAL_ERROR"`, `message: "A temporary error occurred."`, and `details: null`. Its `requestId` equals the `X-Request-ID` header, and `"secret-detail"` appears neither in the body nor in any `caplog` record's formatted output; one `unhandled_error` record exists (R12).
  - `GET /api/v1/health` returns 200 `{"status": "ok"}`.
  - Agent: `test-author`.
- [ ] T020 [P] Write `backend/tests/api/test_cors.py`, using `client` with `app_base_url="https://vintage-relay.test"`:
  - A preflight `OPTIONS /api/v1/events` with `Origin: https://vintage-relay.test`, `Access-Control-Request-Method: POST`, and `Access-Control-Request-Headers: authorization, content-type, x-request-id` returns 200, `access-control-allow-origin: https://vintage-relay.test`, and an `access-control-allow-headers` value that includes all three headers (case-insensitive).
  - `GET /api/v1/health` with that `Origin` returns `access-control-expose-headers` containing `X-Request-ID`.
  - A preflight from `Origin: https://evil.test` has no `access-control-allow-origin` header.
  - The 500 response from a test-only failing route (via `client_no_raise`) with the allowed `Origin` still carries `access-control-allow-origin` (R16, FR-016).
  - Agent: `test-author`.
- [ ] T021 Rewrite `backend/tests/conftest.py`:
  - `settings` fixture: `Settings(database_url=f"sqlite:///{tmp_path / 'test.db'}", app_base_url="https://vintage-relay.test")`.
  - `db` fixture: `Db(settings.database_url)`, then `Base.metadata.create_all(db.write_engine)`; on teardown, `db.dispose()`.
  - `app` fixture: `create_app(settings, db)`.
  - `client` fixture: `with TestClient(app) as c: yield c`, then `app.dependency_overrides.clear()`.
  - `client_no_raise` fixture: the same, with `raise_server_exceptions=False`.
  - Helper `count_rows(db, table_name) -> int`, which runs inside `db.read()`.
  - The existing `backend/tests/api/test_health.py` keeps using `client`.
  - Agent: `test-author`.
- [ ] T022 [P] Implement `backend/app/domain/errors.py` (stdlib only):
  - `AppError(Exception)`, with class attributes `status_code = 400`, `code = "BAD_REQUEST"`, and `message = "Invalid request."`, and an `__init__(message=None, *, details=None)` as in `docs/rules/dev/backend/error-handling.md`.
  - `InternalError(AppError)` with `status_code = 500`, `code = "INTERNAL_ERROR"`, and `message = "A temporary error occurred."`.
  - No other subclasses yet (Constitution V).
  - Agent: `implementer-be`.
- [ ] T023 [P] In `backend/app/core/logging.py`, add `async def request_context(request, call_next)`, the request ID middleware function:
  - Use `rid = request.headers.get("X-Request-ID") or uuid4().hex` and set `request_id_var`.
  - On success, set the response header and log `request` with `method`, `path`, `status`, and `ms`.
  - On `except Exception`, call `logger.exception("unhandled_error", extra={"path": request.url.path})` and return `JSONResponse({"error": {"code": "INTERNAL_ERROR", "message": "A temporary error occurred.", "details": None, "requestId": rid}}, status_code=500, headers={"X-Request-ID": rid})`.
  - Reset the context variable in `finally` (R12).
  - Agent: `implementer-be`.
- [ ] T024 Implement `backend/app/api/errors.py` with `register_error_handlers(app)`. Every body has the shape `{"error": {"code", "message", "details" (None when empty), "requestId": request_id_var.get()}}`.
  - `AppError` → `exc.status_code`, `exc.code`, and `exc.message`.
  - `RequestValidationError` → 422 `VALIDATION_ERROR` with message `"Please check your input."` and `details = {"fields": [{"field": str(loc[-1]), "reason": <error type>}]}`, never including `input`. T052 refines this.
  - `StarletteHTTPException` → 400 `BAD_REQUEST`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND` (any other status → `BAD_REQUEST`), with message `"Unable to process this request."`.
  - `Exception` → 500 `INTERNAL_ERROR`, as a last resort.
  - Depends on T016 and T022.
  - Agent: `implementer-be`.
- [ ] T025 Implement `backend/app/api/deps.py`:
  - `get_settings_dep(request: Request) -> Settings` returns `request.app.state.settings`.
  - `get_db(request: Request) -> Db` returns `request.app.state.db`.
  - Aliases `SettingsDep` and `DbDep`.
  - No module-global state.
  - Agent: `implementer-be`.
- [ ] T026 Refactor `backend/app/main.py` to `create_app(settings: Settings | None = None, db: Db | None = None) -> FastAPI`:
  - Resolve `settings = settings or get_settings()` and call `setup_logging(settings)`.
  - Create `FastAPI(title="Vintage Relay API", lifespan=...)`. When `db` is `None`, the lifespan creates `Db(settings.database_url)` on startup and disposes it on shutdown. Set `app.state.settings` (and `app.state.db` when injected).
  - Call `register_error_handlers(app)` and `app.middleware("http")(request_context)`.
  - Then add `CORSMiddleware(allow_origins=[settings.app_base_url], allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type", "X-Request-ID"], expose_headers=["X-Request-ID"], allow_credentials=False)` *after*, so it is the outermost layer (R16).
  - Keep `GET /api/v1/health` (`async def`, returns `{"status": "ok"}`), create `api_router = APIRouter(prefix="/api/v1")` for feature routers, and set `app = create_app()` at module level.
  - Makes T019–T021 pass. Depends on T023–T025.
  - Agent: `implementer-be`.
- [ ] T027 Scaffold Alembic: `backend/alembic.ini`, `backend/alembic/script.py.mako`, and `backend/alembic/env.py`.
  - In `env.py`, use `render_as_batch=True` and `target_metadata = Base.metadata`, and `import app.models` so the models register.
  - Take the URL from `config.get_main_option("sqlalchemy.url")` when set, otherwise from `get_settings().database_url`.
  - Leave `versions/` empty.
  - Boilerplate — agent: `scaffolder`.

**Checkpoint**: T006–T021 pass, and the backend checks are green.

---

## Phase 3: User Story 1 + User Story 4 — Create an active event, all-or-nothing (P1 / P2) 🎯 MVP

**Goal**:
- `POST /api/v1/events` creates an active event, registers the creator as organizer participant, stores only the token hash, and returns an `EventSession` with 201 (US1).
- Any failure leaves no rows (US4).

**Independent Test**:
- US1: a valid submission returns an active event with `me.isOrganizer == true`, and the token hashes to the stored organizer.
- US4: a failure injected at linking or at response construction returns 500 and leaves 0 rows.

### Tests (write first, confirm Red) ⚠️ — agent: `test-author`

- [ ] T028 [P] [US1] Write `backend/tests/api/test_create_event.py`, using `client`. Post `{"name": "Mangwon Flea Market Swap Corner", "organizerDisplayName": "Mina"}`.
  - The response is 201, and the body has exactly the keys `event` and `participantToken`.
  - `event` has exactly the keys `id`, `name`, `status`, `entryCode`, `entryUrl`, `organizerParticipantId`, `createdAt`, `closedAt`, `me`, and `stats`.
  - `status == "active"` and `closedAt is None`.
  - `createdAt` matches `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`.
  - `entryCode` matches `^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$` (US2 AS1 baseline).
  - `entryUrl == f"https://vintage-relay.test/join?code={entryCode}"` (US2 AS2 baseline).
  - `me == {"participantId": organizerParticipantId, "displayName": "Mina", "isOrganizer": True}`.
  - `stats == {"participantCount": 1, "availableClothingCount": 0, "confirmedExchangeCount": 0}`.
  - `participantToken` is non-empty.
  - Trimming: `"  Mina  "` → `"Mina"` and `"  Mangwon Flea Market Swap Corner  "` → trimmed (US1 AS4).
  - `Authorization: Bearer whatever` still gets 201.
  - Two identical posts produce different `id`, `organizerParticipantId`, `entryCode`, and `participantToken` (FR-014).
  - The `X-Request-ID` request header is echoed.
- [ ] T029 [P] [US1] Write `backend/tests/services/test_event_service.py`. Use the API through `client` and query rows through the `db` fixture.
  - Stored `session_token_hash == hashlib.sha256(token.encode()).hexdigest()`, and no `participants` column value equals the raw token.
  - A lookup by `hash_participant_token(token)` returns exactly one participant, with `id == events.organizer_participant_id` (US1 AS2).
  - Stored `name` and `display_name` are trimmed.
  - With `caplog` at INFO, exactly one record has `msg == "event_created"` and `record.event_id == <event id>`.
  - The raw token and the raw entry code appear in no record's `getMessage()` or `__dict__` values (FR-013, SC-005).
- [ ] T030 [P] [US4] Write `backend/tests/services/test_event_atomicity.py`:
  - (a) `monkeypatch.setattr("app.repositories.event.set_organizer", <raise RuntimeError>)`, then call `EventService(db, settings).create(EventCreate(name="Swap", organizer_display_name="Mina"))`. It raises `RuntimeError`, and afterwards `count_rows(db, "events") == count_rows(db, "participants") == 0` (US4 AS1).
  - (b) The same with `monkeypatch.setattr("app.services.event.build_event_session", <raise RuntimeError>)` → 0 rows (R8, a response-construction failure).
  - (c) After three successful creates, every `events` row has a non-null `organizer_participant_id` whose participant has `event_id == events.id` (US4 AS2, SC-002).
  - (d) No `event_created` record is logged in (a) or (b).
- [ ] T031 [P] [US4] Write `backend/tests/api/test_create_event_atomicity.py`, using `client_no_raise` and the T030 (a) injection:
  - The response is 500 with `error.code == "INTERNAL_ERROR"` and `error.details is None`, and `error.requestId` equals the `X-Request-ID` header.
  - Afterwards both tables have 0 rows.
- [ ] T032 [P] [US1] Write `backend/tests/test_migrations.py`:
  - Build an `alembic.config.Config` pointing `script_location` at `backend/alembic`, with `sqlalchemy.url = sqlite:///{tmp_path}/m.db`, and run `command.upgrade(cfg, "head")` on the empty file.
  - Then, with SQLAlchemy `inspect`, assert:
    - Tables `events` and `participants` exist.
    - There is a unique constraint on `events.entry_code` and one on `participants.session_token_hash`.
    - A check constraint `ck_events_status` exists.
    - `events.organizer_participant_id` is nullable.
    - FKs exist from `events.organizer_participant_id` to `participants.id` and from `participants.event_id` to `events.id`.
- [ ] T033 [P] [US1] Write `backend/tests/api/test_openapi_contract.py`. `GET /openapi.json`; for `paths["/api/v1/events"]["post"]`:
  - The response keys include `"201"`, `"400"`, `"422"`, and `"500"`.
  - The 400, 422, and 500 JSON schemas resolve to the component `ErrorResponse`, whose `error` object requires `code`, `message`, `details`, and `requestId`.
  - No `HTTPValidationError` reference appears anywhere in this operation.
  - The 201 schema resolves to an object requiring `event` and `participantToken`. Resolve `$ref`s; don't hard-code component names other than `ErrorResponse`.
  - Every one of those four responses declares an `X-Request-ID` header.
  - The operation has no `security` requirement.

### Implementation (Green → Refactor) — agent: `implementer-be`

- [ ] T034 [P] [US1] Implement `backend/app/domain/enums.py`: `class EventStatus(StrEnum)` with `ACTIVE = "active"` and `CLOSED = "closed"`.
- [ ] T035 [P] [US1] Implement `backend/app/models/event.py` (`Event`, table `events`), following data-model.md:
  - `id` `String(36)` PK (UUID v4 string).
  - `name` `String(60)` NOT NULL.
  - `status` `String(16)` NOT NULL, with `CheckConstraint("status IN ('active','closed')", name="status")` → `ck_events_status`.
  - `entry_code` `String(6)` NOT NULL UNIQUE.
  - `organizer_participant_id` `String(36)` NULL, an FK to `participants.id` with `use_alter=True`, named by the convention.
  - `created_at` `UtcDateTime` NOT NULL.
  - `closed_at` `UtcDateTime` NULL.
- [ ] T036 [P] [US1] Implement `backend/app/models/participant.py` (`Participant`, table `participants`), following data-model.md:
  - `id` `String(36)` PK.
  - `event_id` `String(36)` NOT NULL, an FK to `events.id`.
  - `display_name` `String(30)` NOT NULL. No uniqueness index; that is deferred to the join feature.
  - `session_token_hash` `String(64)` NOT NULL UNIQUE.
  - `created_at` `UtcDateTime` NOT NULL.
  - Export `Event` and `Participant` from `backend/app/models/__init__.py`.
- [ ] T037 [US1] Generate the first revision with `DATABASE_URL=sqlite:///$(mktemp -d)/autogen.db uv run alembic revision --autogenerate -m "create events and participants"` (a throwaway database, so no `data/` directory is needed). Then hand-edit `backend/alembic/versions/<rev>_create_events_and_participants.py`:
  - Render `UtcDateTime` columns as `sa.DateTime()`, with no `app.*` imports.
  - Confirm `ck_events_status`, both UNIQUE constraints, and both named FKs are present.
  - Makes T032 pass. Depends on T027, T035, and T036.
- [ ] T038 [P] [US1] Implement `backend/app/repositories/event.py` as **module-level functions**:
  - `add(s: Session, event: Event) -> None` adds and flushes.
  - `entry_code_exists(s: Session, code: str) -> bool` runs a `select` on `events.entry_code`.
  - `set_organizer(s: Session, event: Event, participant_id: str) -> None` sets the field and flushes.
  - No commits and no business decisions.
- [ ] T039 [P] [US1] Implement `backend/app/repositories/participant.py` as a module-level function: `add(s: Session, participant: Participant) -> None` adds and flushes.
- [ ] T040 [P] [US1] Implement `backend/app/schemas/error.py`, all on `ApiModel`:
  - `ValidationFieldError`: `field: str`, `reason: str`.
  - `ErrorBody`: `code: str`, `message: str`, `details: dict[str, object] | None`, `request_id: str`.
  - `ErrorResponse`: `error: ErrorBody` (R17).
- [ ] T041 [US1] Implement `backend/app/schemas/event.py`, all on `ApiModel`:
  - `EventCreate`: `name: str`, `organizer_display_name: str`. T051 adds the constraints.
  - `EventMe`: `participant_id: str`, `display_name: str`, `is_organizer: bool`.
  - `EventStats`: `participant_count: int`, `available_clothing_count: int`, `confirmed_exchange_count: int`.
  - `EventRead`: `id`, `name`, `status: EventStatus`, `entry_code`, `entry_url`, `organizer_participant_id`, `created_at: UtcDatetime`, `closed_at: UtcDatetime | None`, `me: EventMe`, `stats: EventStats | None`.
  - `EventSession`: `event: EventRead`, `participant_token: str`.
- [ ] T042 [US1] Implement `backend/app/services/event.py`:
  - Import `from app.repositories import event as event_repo, participant as participant_repo`, and always call through the module (`event_repo.set_organizer(...)`) so T030's patches take effect.
  - Module-level `build_event_session(event: Event, organizer: Participant, token: str, settings: Settings) -> EventSession`. It uses keyword arguments only (`EventStats(participant_count=1, available_clothing_count=0, confirmed_exchange_count=0)`), `entry_url=f"{settings.app_base_url}/join?code={event.entry_code}"`, and `me=EventMe(participant_id=organizer.id, display_name=organizer.display_name, is_organizer=True)`.
  - `class EventService.__init__(self, db: Db, settings: Settings, *, entry_code_generator: Callable[[], str] = generate_entry_code, token_generator: Callable[[], str] = generate_participant_token, clock: Callable[[], datetime] = lambda: datetime.now(UTC))`.
  - `create(self, body: EventCreate) -> EventSession`, in **one** `with self.db.write() as s:` block:
    1. Generate the code.
    2. `event_repo.add` an `Event(id=str(uuid4()), status=EventStatus.ACTIVE, organizer_participant_id=None, created_at=clock())`.
    3. Generate the token, then `participant_repo.add` a `Participant(session_token_hash=hash_participant_token(token))`.
    4. `event_repo.set_organizer`.
    5. `session = build_event_session(...)` (still inside the block).
  - After the block exits, call `logger.info("event_created", extra={"event_id": event.id})` and return `session`.
  - Raise only domain errors, and never swallow an exception.
  - Makes T029–T031 pass. Depends on T034–T041.
- [ ] T043 [US1] Wire the endpoint:
  - In `backend/app/api/errors.py`, add `ERROR_RESPONSES: dict[int | str, dict[str, Any]]` for 400, 422, and 500, each `{"model": ErrorResponse, "description": ..., "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}}`.
  - In `backend/app/api/deps.py`, add `get_event_service(db: DbDep, settings: SettingsDep) -> EventService` and `EventServiceDep`.
  - Create `backend/app/api/routers/events.py`:
    - `router = APIRouter(prefix="/events", tags=["events"])`.
    - `@router.post("", status_code=201, summary="Create an event", responses={201: {"headers": {"X-Request-ID": ...}}, **ERROR_RESPONSES})`.
    - Synchronous `def create_event(body: EventCreate, service: EventServiceDep) -> EventSession: return service.create(body)`, at most 10 lines.
  - Include the router in `api_router` in `backend/app/main.py`.
  - Makes T028 and T033 pass.

**Checkpoint**: US1 and US4 pass. Events are created atomically and return a code, link, and token.

---

## Phase 4: User Story 2 - Organizer shares the event entry (Priority: P1)

**Goal**: The join link is correct for any configured origin, and the entry code stays unique under collisions (bounded retry).

**Independent Test**: With an origin configured with a trailing slash, `entryUrl` has no `//join`. A forced collision yields a new code, and exhaustion returns 500 with 0 new rows.

### Tests (write first, confirm Red) ⚠️ — agent: `test-author`

- [ ] T044 [P] [US2] Write `backend/tests/api/test_create_event_sharing.py`. Build `create_app(Settings(database_url=settings.database_url, app_base_url="https://vintage-relay.test/"), db)` (trailing slash) and assert:
  - After a create, `entryUrl == f"https://vintage-relay.test/join?code={entryCode}"` (R10).
  - A preflight from `Origin: https://vintage-relay.test` gets `access-control-allow-origin: https://vintage-relay.test` (R16).
- [ ] T045 [P] [US2] Write `backend/tests/services/test_entry_code_retry.py`:
  - (a) Create one event with `entry_code_generator=lambda: "AAAAAA"`. A second `EventService` whose generator yields `"AAAAAA"` and then `"BBBBBB"` stores `"BBBBBB"` (US2 AS3).
  - (b) A generator that always returns `"AAAAAA"` raises `InternalError`. The generator is called exactly 10 times, and the event and participant counts are unchanged.
  - (c) Through `client_no_raise`, with `app.dependency_overrides[get_event_service]` returning that always-colliding service, the response is 500 `INTERNAL_ERROR` and the row counts are unchanged.

### Implementation (Green → Refactor) — agent: `implementer-be`

- [ ] T046 [US2] In `backend/app/core/config.py`, add `@field_validator("app_base_url")` that returns `value.rstrip("/")` (R10). Makes T044 pass.
- [ ] T047 [US2] In `backend/app/services/event.py`, add `ENTRY_CODE_MAX_ATTEMPTS = 10`. Inside the same write block, call `entry_code_generator()` until `event_repo.entry_code_exists(s, code)` is false; when the attempts are used up, raise `InternalError()` (R6, FR-008). Makes T045 pass.

**Checkpoint**: US1, US2, and US4 pass.

---

## Phase 5: User Story 3 - Invalid input is rejected clearly (Priority: P2)

**Goal**: Field-level errors use the contract reasons, malformed bodies return 400, the OpenAPI schema documents the constraints, and nothing is persisted on error.

**Independent Test**: Submit each invalid variant and check the status, `error.code`, `details.fields`, and 0 rows. Check that each accepted boundary case creates exactly one linked event.

### Tests (write first, confirm Red) ⚠️ — agent: `test-author`

- [ ] T048 [P] [US3] Write `backend/tests/api/test_create_event_validation.py`, using `client` and `db`.
  - **Rejection (parametrized):** after every rejection case, both tables have 0 rows and `error.requestId` equals the `X-Request-ID` header. Each case returns 422 `VALIDATION_ERROR` with `details.fields` equal to:
    - missing `name` → `[{"field": "name", "reason": "required"}]`
    - `"name": null` → `required`
    - `"name": "   "` → `required`
    - `"name": "　"` → `required`
    - a 61-code-point `name` → `too_long`
    - a 31-code-point `organizerDisplayName` → `[{"field": "organizerDisplayName", "reason": "too_long"}]`
    - `"organizerDisplayName": 123` → `invalid_type`
    - `"name": ["a"]` → `invalid_type`
    - `"organizerDisplayName": "Mina\nKim"` → `invalid_characters`
    - `"name": "Swap\tCorner"` → `invalid_characters`
    - extra `"theme": "denim"` → `[{"field": "theme", "reason": "unknown_field"}]`
    - extra `"theme": null` → `[{"field": "theme", "reason": "unknown_field"}]` (V1)
    - extra `"some_key": 1` → `[{"field": "some_key", "reason": "unknown_field"}]` (verbatim, not camelCased)
    - snake_case `{"name": "Swap", "organizer_display_name": "Mina\nKim"}` → `[{"field": "organizerDisplayName", "reason": "invalid_characters"}]` (V2)
    - both fields missing → exactly two entries, `name` then `organizerDisplayName`
  - **400 `BAD_REQUEST`, with `details is None` and 0 rows:**
    - body `{"name":` with `Content-Type: application/json`
    - body `[]`
    - body `"text"`
    - empty body
  - **Acceptance (separate parametrization):** each case returns 201 and afterwards exactly 1 event and 1 participant, linked:
    - 60-code-point `name`
    - 30-code-point `organizerDisplayName`
    - `"가" * 30`
    - `"Mina\n"` → stored and returned as `"Mina"`
- [ ] T049 [P] [US3] Extend `backend/tests/api/test_openapi_contract.py`. The request body schema of `POST /api/v1/events`, after resolving its `$ref`, has:
  - `required ⊇ ["name", "organizerDisplayName"]` and `additionalProperties: false`.
  - `name.minLength == 1` and `name.maxLength == 60`.
  - `organizerDisplayName.minLength == 1` and `organizerDisplayName.maxLength == 30`.

### Implementation (Green → Refactor) — agent: `implementer-be`

- [ ] T050 [US3] In `backend/app/schemas/common.py`:
  - Add `class ValidationReason(StrEnum)` with `REQUIRED = "required"`, `TOO_LONG = "too_long"`, `INVALID_TYPE = "invalid_type"`, `INVALID_CHARACTERS = "invalid_characters"`, `UNKNOWN_FIELD = "unknown_field"`, and `INVALID = "invalid"`.
  - Add `reject_control_characters(value: str) -> str`, which raises `PydanticCustomError("invalid_characters", "Control characters are not allowed.")` if any character has `unicodedata.category(c) == "Cc"`.
- [ ] T051 [US3] In `backend/app/schemas/event.py`:
  - Constrain `EventCreate.name: str = Field(min_length=1, max_length=60)` and `EventCreate.organizer_display_name: str = Field(min_length=1, max_length=30)`.
  - Add `field_validator("name", "organizer_display_name", mode="after")` that calls `reject_control_characters`.
  - Keep the inherited `extra="forbid"` (R5).
  - Makes T049 pass.
- [ ] T052 [US3] Refine the `RequestValidationError` handler in `backend/app/api/errors.py` (R3, R4):
  - **400 first:** if any error has type `json_invalid`, or has `loc == ("body",)`, return 400 `BAD_REQUEST` with `details: None`.
  - **422 otherwise:** map each error with the first matching rule, in this order:

    | Order | Condition | Result |
    |---|---|---|
    | 1 | `extra_forbidden` | `field = str(loc[-1])` verbatim, reason `unknown_field` |
    | 2 | `missing` or `string_too_short`, or `input is None` | `required` |
    | 3 | `string_too_long` | `too_long` |
    | 4 | `string_type` | `invalid_type` |
    | 5 | `invalid_characters` | `invalid_characters` |
    | 6 | anything else | `invalid` |

    For rules 2–6, `field = to_camel(str(loc[-1]))`.
  - Emit one entry per field in first-seen order, and never include `input`.
  - Makes T048 pass. Depends on T050 and T051.

**Checkpoint**: All four user stories pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Docker Compose runtime (R15), documentation sync (R14), performance verification (SC-006), and final validation.

- [ ] T053 [P] Create `backend/Dockerfile` (R15):
  - Base `ghcr.io/astral-sh/uv:python3.14-bookworm-slim`, with `WORKDIR /app`.
  - Copy `pyproject.toml`, `uv.lock`, and `.python-version` first, then `uv sync --locked --no-dev --no-install-project` as a dependency layer.
  - Copy `app/`, `alembic/`, and `alembic.ini`.
  - Set `ENV PATH="/app/.venv/bin:$PATH" DATABASE_URL=sqlite:////data/app.db` and `EXPOSE 8000`.
  - `CMD ["sh", "-c", "alembic upgrade head && exec fastapi run app/main.py --host 0.0.0.0 --port 8000"]` (one worker).
  - Boilerplate — agent: `scaffolder`.
- [ ] T054 [P] Create `backend/.dockerignore`, excluding `.venv/`, `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `data/`, `tests/`, `*.db*`, and `.env*` — agent: `scaffolder`.
- [ ] T055 [P] Create root `compose.yaml` with a single service `backend` (no DB service and no replicas, R15) — agent: `scaffolder`:
  - `build: ./backend` and `ports: ["8000:8000"]`.
  - `environment`: `DATABASE_URL: sqlite:////data/app.db`, `APP_BASE_URL: ${APP_BASE_URL:-http://localhost:3000}`, `LOG_FORMAT: ${LOG_FORMAT:-json}`, `LOG_LEVEL: ${LOG_LEVEL:-INFO}`.
  - `volumes: ["backend-data:/data"]` and `restart: unless-stopped`.
  - `healthcheck` with `test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health')"]` and `interval: 10s`.
  - Top-level `volumes: {backend-data: {}}`.
- [ ] T056 [P] Update `docs/plans/api/01-create-event.md` (R14) — orchestrator (docs):
  - 400 row: the body is unparseable, missing, or not a JSON object.
  - 422 reasons: `required` (including `null`), `too_long`, `invalid_type`, `invalid_characters`, and `unknown_field`. Unknown fields are rejected.
  - 500 row: the transaction failed, or the entry-code retries (10) were exhausted.
  - Note CORS per api-contract §9.
- [ ] T057 [P] Add `docker compose up --build -d`, `docker compose logs backend`, and `docker compose down` to Common Commands in `docs/rules/dev/backend/README.md`. Note that `down -v` deletes the SQLite volume (R15) — orchestrator (docs).
- [ ] T058 [P] Add `postman/collections/Vintage Relay API/08 Auth errors/Create event with unknown field.request.yaml`, modeled on `Create event with empty name.request.yaml`, with `order: 5000` and body `{"name": "Swap", "organizerDisplayName": "Mina", "theme": "denim"}`. Its tests assert status 422, `error.code == "VALIDATION_ERROR"`, and that `details.fields` contains `{field: "theme", reason: "unknown_field"}` — orchestrator (API artifact).
- [ ] T059 Run the full suites on Python 3.14 and record the actual results:
  - Backend: `cd backend && uv run python --version && uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest`
  - Frontend (unchanged; regression check): `cd frontend && pnpm lint && pnpm typecheck && pnpm test`
- [ ] T060 Run the Docker Compose validation from [quickstart.md](quickstart.md) §2:
  - The stack becomes healthy, and the logs show the migration.
  - The happy-path and error-path curls give the expected results.
  - The CORS preflight curl gives the expected result.
  - The stored-data check shows a 64-character hash, and no raw token appears in the DB or `docker compose logs`.
  - Data persists across `down` and `up`.
  - Report this as local, live, manual evidence.
- [ ] T061 Run the SC-006 timing check from [quickstart.md](quickstart.md) §4 against the Compose stack: 100 `POST /api/v1/events` requests from 5 concurrent clients. Report p50, p95, and the error count. The pass condition is p95 < 1 s with 0 errors; record the result in the PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T001 runs first so later `uv` commands use 3.14.
- **Foundational (Phase 2)**: Depends on Setup. Cycles run in the order F1 → F2 → F3. Blocks all stories.
- **US1 + US4 (Phase 3)**: Depends on Foundational.
- **US2 (Phase 4)**: Depends on Phase 3, because it extends the same config and service.
- **US3 (Phase 5)**: Depends on Phase 3. Independent of US2.
- **Polish (Phase 6)**:
  - T053–T055 depend on T027 and T037.
  - T056–T058 depend on Phase 5.
  - T059 depends on all implementation tasks.
  - T060 and T061 depend on T059.

### TDD Cycles (one commit each, after `commit-reviewer`)

| Cycle | Red (`test-author`) | Green (`implementer-be`) |
|---|---|---|
| F1 | T006, T007 | T008, T009 |
| F2 | T010, T011, T012, T013 | T014, T015, T016, T017, T018 |
| F3 | T019, T020, T021 | T022, T023, T024, T025, T026 |
| US1+US4 | T028–T033 | T034–T043 (T037 after T027) |
| US2 | T044, T045 | T046, T047 |
| US3 | T048, T049 | T050, T051, T052 |

These run without a test cycle (`scaffolder` or orchestrator → `commit-reviewer` → commit):
- T001–T005 (Setup)
- T027 (Alembic scaffold, committed with F3 or on its own)
- T053–T055 (Docker files)
- T056–T058 (docs and the Postman request)

### Parallel Opportunities

- **Setup:** T003–T005.
- **F1:** T006 and T007, then T008 and T009.
- **F2:** T010–T013, then T014, T015, T016, and T018 (T017 after T014).
- **F3:** T019 and T020 (T021 alongside them, sequentially in one `test-author` run), then T022 and T023 (T024 → T025 → T026).
- **Phase 3:**
  - Tests T028–T033 can all run in parallel (different files).
  - Implementation: T034–T036 together, and T038–T040 together.
- **After Phase 3:** US2 and US3 touch different test files, but share `backend/app/api/errors.py` and `backend/app/core/config.py` only in non-overlapping ways. Run them in parallel only in separate Paseo workspaces (one implementer per workspace); sequential is the default.
- **Polish:** T053–T058.

---

## Parallel Example: Phase 3

```bash
# test-author — one Red batch (all must fail):
Task: "T028 API happy path in backend/tests/api/test_create_event.py"
Task: "T029 token hash / audit log in backend/tests/services/test_event_service.py"
Task: "T030 atomicity in backend/tests/services/test_event_atomicity.py"
Task: "T031 API 500 atomicity in backend/tests/api/test_create_event_atomicity.py"
Task: "T032 migration in backend/tests/test_migrations.py"
Task: "T033 OpenAPI contract in backend/tests/api/test_openapi_contract.py"

# implementer-be — models in parallel:
Task: "T035 Event model in backend/app/models/event.py"
Task: "T036 Participant model in backend/app/models/participant.py"
```

---

## Implementation Strategy

### MVP First

1. Setup → Foundational (F1–F3).
2. Phase 3 (US1 + US4). **Stop and validate**: run the tests and do a manual curl. Events are created atomically, with a code, a link, and a token.

### Incremental Delivery

Foundation → US1 + US4 (MVP) → US2 (origin normalization, collision retry) → US3 (validation UX, schema constraints) → Polish (Docker Compose, docs, performance).

---

## Notes

- [P] = different files and no dependency on incomplete tasks.
- Never delete or skip a failing test. Use `xfail(reason=...)` only for deliberately unimplemented cases; none are planned.
- `mypy` checks `app/` only. Tests must still pass `ruff`.
- Out of scope: frontend H1/H2, read-event (02), display-name uniqueness, session recovery, rate limiting.
