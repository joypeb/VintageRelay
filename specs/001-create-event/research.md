# Research: Create Event

**Feature**: `001-create-event` | **Date**: 2026-10-28 | **Plan**: [plan.md](plan.md)

Sources: [spec.md](spec.md), `docs/plans/api/01-create-event.md`, `docs/plans/api/02-read-event.md`, `docs/plans/database-design-v1.md`, `docs/rules/dev/common/api-contract.md`, `docs/rules/dev/backend/*`, and the current `backend/` scaffold (only `GET /api/v1/health` exists; no DB, settings, logging, or error handling yet).

No `NEEDS CLARIFICATION` items remain. Each decision below resolves a technical unknown or a conflict between documents.

---

## R1. Persistence stack

- **Decision**: SQLite with synchronous SQLAlchemy 2.1 (2.0 style), Alembic for schema changes, and pydantic-settings for configuration. Add `sqlalchemy`, `alembic`, and `pydantic-settings` with `uv add` (lower bounds from `docs/rules/dev/backend/README.md`).
- **Interpreter**: Pin Python 3.14 with `uv python pin 3.14`, which writes `backend/.python-version`. The local `.venv` currently runs 3.15.0, which `requires-python >=3.14` allows. The pin keeps host, CI, and Docker on the baseline version.
- **Configuration docs**: `backend/.env.example` lists every settings key with a safe default and a one-line description (`docs/rules/dev/common/tech-stack.md`).
- **Rationale**: Mandated by `docs/rules/dev/backend/{README,database,code-style}.md`. None of these packages are in `backend/pyproject.toml` yet.
- **Alternatives considered**: stdlib `sqlite3` (rejected: violates ORM and migration rules); async SQLAlchemy with `aiosqlite` (explicitly prohibited).

## R2. Shared backend infrastructure built by this feature

- **Decision**: Because this is the first feature, it also builds the minimum shared infrastructure every later endpoint relies on:
  - `app/core/config.py`: `Settings` (`DATABASE_URL`, default `sqlite:///./data/app.db`; `APP_BASE_URL`; `LOG_LEVEL`; `LOG_FORMAT`), with no `.env` file loading, and `get_settings()` (cached).
  - `app/core/db.py`: `make_engine(url, begin_sql)` with the required pragmas and `hide_parameters=True` (R12). `class Db` builds a read engine (`BEGIN`) and a write engine (`BEGIN IMMEDIATE`) from one URL and exposes `read()`, `write()`, `write_engine` (used by tests to create the schema), and `dispose()`.
  - `app/core/logging.py`: `setup_logging()`, the JSON and text formatters (both with safe exception rendering, R12), `mask()`, `request_id_var`, and the request ID middleware.
  - `app/domain/errors.py` (`AppError` hierarchy) and `app/api/errors.py` (global handlers and the shared OpenAPI error responses, R17).
  - `app/schemas/common.py`: the `ApiModel` base with camelCase aliases. `app/schemas/error.py`: the error response models.
  - `app/main.py`: `create_app(settings: Settings | None = None, db: Db | None = None) -> FastAPI`, with `app = create_app()` at module level. It stores `settings` and `db` on `app.state`. When `db` isn't injected, a lifespan creates `Db(settings.database_url)` on startup and disposes it on shutdown. It also registers the CORS middleware (R16). `api/deps.py` reads `request.app.state.settings` and `request.app.state.db`, so tests build an app per test instead of overriding globals; there is no module-level DB state.
- **Rationale**: FR-013 (audit log), FR-015 (shared error format), and the `requestId`/`X-Request-ID` contract can't be met without this infrastructure. Building only what this endpoint exercises keeps the work minimal (Constitution V).
- **Alternatives considered**: a separate infrastructure feature first (rejected: it would ship with no consumer, and the tests would have no behavior to drive them).

## R3. Field validation and reason mapping

- **Decision**:
  - `EventCreate` declares `name: str = Field(min_length=1, max_length=60)` and `organizer_display_name: str = Field(min_length=1, max_length=30)`, with `str_strip_whitespace=True`.
  - An `after` field validator rejects any character in Unicode category `Cc` by raising `PydanticCustomError("invalid_characters", ...)`.
  - `app/api/errors.py` maps Pydantic error types to contract reasons, reporting each invalid field once:

  | Pydantic error | Reason |
  |---|---|
  Rules are evaluated in this order; the first match wins:

  | Order | Pydantic error | Reason | `field` |
  |---|---|---|---|
  | 1 | `extra_forbidden` (even when its `input` is `None`) | `unknown_field` | `str(loc[-1])` as received |
  | 2 | `missing`, `string_too_short`, or any other error whose `input` is `None` | `required` | `to_camel(str(loc[-1]))` |
  | 3 | `string_too_long` | `too_long` | `to_camel(...)` |
  | 4 | `string_type` | `invalid_type` | `to_camel(...)` |
  | 5 | `invalid_characters` (custom) | `invalid_characters` | `to_camel(...)` |
  | 6 | any other type | `invalid` (fallback; not expected for this endpoint) | `to_camel(...)` |

  - Declared fields are normalized with `to_camel`. The contract's `populate_by_name=True` also accepts snake_case input such as `organizer_display_name`, whose error `loc` is snake_case, so normalization keeps `field` camelCase. Unknown keys are echoed verbatim, because `to_camel` could alter them.
  - Each field appears once, in first-seen order, and `input` is never included in the response.
  - The reason strings live in one constants module (`app/schemas/common.py`, `ValidationReason` `StrEnum`), so later features reuse them.
- **Rationale**:
  - pydantic-core strips with Rust `str::trim`, which removes every Unicode `White_Space` character, including U+3000 and U+00A0 (spec edge case).
  - Length constraints count `char`s, which are Unicode code points (spec clarification 1).
  - Stripping happens before the length constraints run, so a whitespace-only value fails `min_length=1` and becomes `required` (FR-002, FR-003).
  - In Pydantic v2 lax mode, numbers aren't coerced to `str`, so they raise `string_type` (`invalid_type`). An explicit `null` also raises `string_type`, which is why rule 2 checks `input is None` (spec clarification 2). An unknown key with value `null` also has `input=None`, which is why rule 1 runs first (verified with Pydantic 2.14.1).
  - The example handler in `docs/rules/dev/backend/error-handling.md` passes `e["type"]` through as the reason, which would leak Pydantic names (`missing`, `string_too_long`). The mapping above keeps the same structure but emits only contract reasons.
- **Alternatives considered**: hand-written validation in the service (rejected: it duplicates Pydantic, and `docs/rules/dev/backend/code-style.md` says schemas validate shape); strict-mode models (rejected: they don't change the outcome here and complicate the mapping).

## R4. Malformed or non-object bodies → `400 BAD_REQUEST`

- **Decision**: The `RequestValidationError` handler returns `400 BAD_REQUEST` (with `details: null`) when any error has type `json_invalid`, or when its `loc` is exactly `("body",)`: the body is missing, isn't a JSON object, or isn't JSON because of a wrong `Content-Type`. Every other error becomes `422 VALIDATION_ERROR`.
- **Rationale**: FR-004 requires a bad-request error that is distinct from field errors. FastAPI reports unparseable JSON as `RequestValidationError` (`json_invalid`), not as an HTTP 400, so the handler must branch.
- **Alternatives considered**: custom request-body parsing in the router (rejected: thick router, and it bypasses OpenAPI).

## R5. Unknown request fields are rejected

- **Decision**: `EventCreate` inherits `ApiModel`'s `extra="forbid"` unchanged. Each unknown key produces a Pydantic `extra_forbidden` error, which the handler reports as `{field: <key as received>, reason: "unknown_field"}` in a 422 `VALIDATION_ERROR`, alongside any other field errors.
- **Rationale**: `docs/rules/dev/backend/code-style.md` requires that unknown request fields produce 422. The spec was updated to follow the rule (clarification of 2026-10-28; US3 AS8; FR-003). A dedicated reason lets the H1 screen tell a client bug apart from user input errors.
- **Alternatives considered**: `extra="ignore"` (rejected by user decision: it contradicts the shared schema rule); reusing reason `invalid` (rejected: less specific for the frontend).

## R6. Entry code generation and uniqueness

- **Decision**:
  - `app/domain/entry_code.py` defines `ENTRY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"` and `generate_entry_code()`, which builds 6 characters with `secrets.choice`.
  - Inside the same `db.write()` transaction, the service checks whether the code exists and regenerates on collision, up to 10 attempts (`ENTRY_CODE_MAX_ATTEMPTS`). If every attempt collides, it raises `InternalError` (500) and the transaction rolls back. This bounded policy is stated in the spec (FR-008, edge cases).
  - `events.entry_code` also has a `UNIQUE` constraint as a backstop.
  - The generator is injected into `EventService` (default: `generate_entry_code`), so tests can force collisions deterministically.
- **Rationale**: `BEGIN IMMEDIATE` serializes writers, so check-then-insert inside one write transaction is race-free without savepoints. With 32 characters (24 letters + 8 digits) and 32⁶ ≈ 1.07×10⁹ codes, collisions at prototype scale are negligible. The attempt cap prevents an unbounded loop. `secrets` keeps codes unguessable, which matters because codes grant entry.
- **Case-insensitive matching** (FR-008) applies only to lookups. Codes are stored uppercase; the join and lookup features normalize input with `.upper()`. This feature just guarantees uppercase storage.
- **Alternatives considered**: catching `IntegrityError` with a savepoint and retrying (works, but is more complex for no gain under serialized writes); `random` (rejected: predictable).

## R7. Participant token and hash

- **Decision**:
  - Generate the token with `secrets.token_urlsafe(32)` (32 random bytes, base64url).
  - Store `hashlib.sha256(token.encode()).hexdigest()` in `participants.session_token_hash`, which has a `UNIQUE` constraint.
  - Both helpers live in `app/core/security.py`.
- **Rationale**: The contract requires ≥32 random bytes, base64url, and hash-only storage. The docs don't name a hash algorithm. A high-entropy random token doesn't need a slow KDF, and a deterministic hash allows the unique-index lookup that `get_current_participant` needs in later features.
- **Alternatives considered**: bcrypt or argon2 (rejected: salted hashes can't be looked up by index, and they defend against low-entropy secrets this token doesn't have); HMAC with a server key (rejected for now: it adds secret management, and plain SHA-256 is enough for a random 256-bit token).

## R8. Atomic creation and the circular foreign key

- **Decision**: `EventService.create` runs one `with db.write() as s:` block:
  1. Insert the event (`status='active'`, `organizer_participant_id=NULL`, a unique code).
  2. `flush()`.
  3. Insert the participant with the token hash.
  4. `flush()`.
  5. Set `event.organizer_participant_id`, then flush.
  6. Build and validate the `EventSession` response *inside* the block, with keyword arguments only (`EventStats(participant_count=1, ...)`), by calling a module-level helper `build_event_session(...)`.
  7. Commit on block exit, then log `event_created` and return the prebuilt response.

  Building the response before commit means that a response-construction failure also rolls back. That avoids a committed event whose token the caller never received.

  The service calls repositories through their modules (`from app.repositories import event as event_repo`; `event_repo.set_organizer(...)`), so tests can inject failures by patching `app.repositories.event.set_organizer` or `app.services.event.build_event_session`.

  Any exception rolls back the whole transaction and surfaces as `500 INTERNAL_ERROR`.

  In the model, `events.organizer_participant_id` is a nullable FK to `participants.id` declared with `use_alter=True` and a named constraint. `participants.event_id` is a `NOT NULL` FK to `events.id`. The SQLite dialect renders both FKs inline in `CREATE TABLE`, which SQLite allows for forward references.
- **Rationale**: Matches `docs/plans/api/01-create-event.md` processing rules and `docs/rules/dev/backend/database.md` ("keep that field nullable and fill it immediately"). FR-007 and SC-002 are verified by a failure-injection test.
- **Same-event invariant** (US4 AS2): The service is the only writer and links the participant it just created. A test asserts the invariant. A composite FK (`(organizer_participant_id, id)` → `participants(id, event_id)`) is deferred under Constitution V.
- **Alternatives considered**: a deferred FK constraint (SQLite can't toggle deferral through ALTER); a non-nullable organizer FK (impossible because of the cycle).

## R9. Timestamps

- **Decision**:
  - Services take time from an injectable clock (`Callable[[], datetime]`, default `lambda: datetime.now(UTC)`).
  - A `UtcDateTime` `TypeDecorator` in `app/models/base.py` stores naive UTC in SQLite and returns timezone-aware UTC.
  - Responses serialize through a shared `UtcDatetime` annotated type in `app/schemas/common.py` as ISO 8601 with millisecond precision and a `Z` suffix (`2026-10-27T05:30:00.000Z`).
- **Rationale**: The contract requires UTC ISO 8601 with `Z` (milliseconds optional). SQLite drops tzinfo, so the read side must reattach it. A fixed precision keeps responses deterministic.
- **Alternatives considered**: storing ISO strings in `TEXT` columns (loses typed comparisons); Pydantic's default microsecond output (valid ISO, but varies in length).

## R10. Join link origin (`APP_BASE_URL`)

- **Decision**:
  - `Settings.app_base_url: str`, read from `APP_BASE_URL`, defaults to `http://localhost:3000` for local development and is normalized with `rstrip("/")`.
  - `entryUrl = f"{app_base_url}/join?code={entry_code}"`. The code alphabet is URL-safe, so no extra encoding is needed.
  - Deployments must set `APP_BASE_URL` to the frontend's public origin (the same value as `NEXT_PUBLIC_APP_URL`).
- **Rationale**: Implements FR-009 and adopts the proposed variable name from the API draft (spec Assumptions).
- **Alternatives considered**: deriving the origin from the request `Host` (rejected: the backend origin differs from the frontend origin).

## R11. `stats` in the creation result

- **Decision**: At creation, `stats` is `{participantCount: 1, availableClothingCount: 0, confirmedExchangeCount: 0}`, built from the creation facts and not from queries.
- **Rationale**:
  - These values hold by construction.
  - The `clothes` and `trade_proposals` tables don't exist yet; adding them only to count zero rows would violate Constitution V.
  - The read-event feature (02) implements the real queries.
  - The response shape stays identical to `Event` (FR-012).
- **Alternatives considered**: a shared stats query now (rejected: needs tables outside this feature's scope).

## R12. `requestId` on 500 responses

- **Decision**: The request ID middleware wraps `call_next` in `try/except Exception`. It logs `unhandled_error` with `logger.exception`, then builds the `INTERNAL_ERROR` JSON response itself, with `requestId` and the `X-Request-ID` header, before resetting the context variable. The `Exception` handler in `app/api/errors.py` stays as a last resort.
- **Rationale**: `docs/rules/dev/backend/error-handling.md` warns that the `Exception` handler runs in `ServerErrorMiddleware`, after the middleware's `finally` has run, so `requestId` would be lost. The same document requires a test proving it is retained. Ruff `BLE001` accepts a broad `except` that calls `logger.exception`.
- **Sensitive data in error logs (SC-005)**: Key-based `mask()` doesn't cover exception text. SQLAlchemy `StatementError` messages include bound parameters (entry codes, token hashes), and Pydantic `ValidationError` messages include input values (a token could appear on a response-validation failure). Two mitigations:
  1. Both engines use `create_engine(..., hide_parameters=True)`, which also removes parameters from `StatementError` strings.
  2. Both formatters render exceptions safely: for each exception in the `__cause__`/`__context__` chain, only the qualified type name and the traceback frames (`traceback.format_tb`) are printed, never `str(exc)`.

  Debugging relies on the request ID, the exception type, and the stack location.
- **Alternatives considered**: a pure ASGI middleware (more code, same effect); regex-scrubbing exception messages (incomplete; secrets have no fixed pattern).

## R13. Test seams

- **Decision**:
  - `tests/conftest.py` provides:
    - `settings`: `Settings(database_url=f"sqlite:///{tmp_path / 'test.db'}", app_base_url="https://vintage-relay.test")`.
    - `db`: `Db(settings.database_url)`, followed by `Base.metadata.create_all(db.write_engine)` and `dispose()` on teardown.
    - `app`: `create_app(settings, db)`.
    - `client` and `client_no_raise`: `TestClient(app)` and `TestClient(app, raise_server_exceptions=False)`.
  - Tests that need different settings build their own app with `create_app(other_settings, db)`.
  - Entry code collisions are forced through the injected generator. At the API level, override `get_event_service` with `app.dependency_overrides`.
  - Atomicity failures are injected with `monkeypatch` on `app.repositories.event.set_organizer` and `app.services.event.build_event_session` (R8).
  - Log assertions use `caplog`. `setup_logging()` only installs or replaces its own stdout handler on the root logger, keeps `propagate=True` on app loggers, and never uses `disable_existing_loggers`, so `caplog` still captures records. It is idempotent, because `create_app` runs it once per test.
  - A migration test runs `alembic upgrade head` against an empty `tmp_path` database.
- **Rationale**: Satisfies Constitution IV and `docs/rules/dev/backend/testing.md`.

## R14. Scope boundaries

- **In scope**: backend `POST /api/v1/events` with the infrastructure from R2, and the `events` and `participants` tables with their first Alembic revision.
- **Out of scope**:
  - Frontend H1/H2 screens (a separate feature; spec Assumptions).
  - Read-event (02).
  - Display-name uniqueness index (the join feature adds it).
  - Session recovery and rate limiting (open decisions).
- **Doc sync**: In the same change, add the reasons `invalid_type`, `invalid_characters`, and `unknown_field`, the 400 cases from R4, and the bounded code-retry outcome (R6) to the Errors table in `docs/plans/api/01-create-event.md`, and update `postman/collections/Vintage Relay API/08 Auth errors/` as needed. The `name: "   "` request there already matches.

## R15. Running the backend with Docker Compose

- **Decision**: The backend runs with Docker Compose. Because the database is SQLite, there is **no separate database service**: the database is a file on a named volume mounted into the backend container.
  - `backend/Dockerfile`:
    - Based on the official uv image for Python 3.14 (`ghcr.io/astral-sh/uv:python3.14-bookworm-slim`).
    - Installs runtime dependencies with `uv sync --locked --no-dev`, then copies `app/`, `alembic/`, and `alembic.ini`.
    - On start, runs `alembic upgrade head` and then `fastapi run app/main.py --host 0.0.0.0 --port 8000`, which uses one worker by default.
  - `backend/.dockerignore`: excludes `.venv`, caches, `data/`, `tests/`, and `.env*`.
  - `compose.yaml` at the repository root, so the frontend can be added as a second service later. It defines one service, `backend`:
    - `build: ./backend` and `ports: ["8000:8000"]`.
    - `environment`: `DATABASE_URL=sqlite:////data/app.db`, `APP_BASE_URL=${APP_BASE_URL:-http://localhost:3000}`, `LOG_FORMAT`, and `LOG_LEVEL`.
    - A named volume `backend-data:/data`.
    - `restart: unless-stopped`.
    - A healthcheck on `GET /api/v1/health` using Python's `urllib`, so no curl is needed in the image.
    - No `replicas` and no scaling.
- **Rationale**:
  - The user asked for Compose for both the DB and the backend, and confirmed keeping SQLite.
  - A named volume satisfies the rule "always-on single server with persistent disk; no disks reset on redeployment" (`docs/rules/dev/backend/database.md`). A single container with a single worker preserves the one-writer guarantee.
  - Named volumes avoid running SQLite WAL over a host bind mount (Docker Desktop file sharing), which risks locking problems.
  - `alembic upgrade head` is idempotent and safe on start, because only one instance runs.
- **Testing**: pytest still runs on the host through `uv` and in CI, following Constitution IV (no external services). The Compose setup is verified manually in [quickstart.md](quickstart.md) §2. It is boilerplate without behavior, so the `scaffolder` can produce it (AGENTS.md).
- **Doc sync**: Add `docker compose up --build` to the Common Commands in `docs/rules/dev/backend/README.md`.
- **Alternatives considered**:
  - A PostgreSQL service (rejected by the user; it would invalidate the SQLite-specific rules).
  - A sidecar "db" container that only holds the SQLite file (adds nothing over a volume).
  - Running migrations as a separate one-shot Compose service (more moving parts for a single instance).

## R16. CORS

- **Decision**:
  - `create_app` adds Starlette's `CORSMiddleware` with `allow_origins=[settings.app_base_url]`, `allow_methods=["GET", "POST", "PATCH", "DELETE"]`, `allow_headers=["Authorization", "Content-Type", "X-Request-ID"]`, `expose_headers=["X-Request-ID"]`, and `allow_credentials=False`.
  - It is added *after* the request ID middleware, so it is the outermost layer. Preflights are answered before routing, and error responses, including the 500 response built inside the request ID middleware, also carry CORS headers.
  - No new setting: `APP_BASE_URL` is by definition the frontend's public origin, and the R10 normalization (no trailing slash) keeps it a valid `Origin` value.
- **Rationale**: `docs/rules/dev/common/api-contract.md` §9 requires allowing `Authorization` and `X-Request-ID` and exposing `X-Request-ID` (spec FR-016). The frontend (`:3000`) and the backend (`:8000`) are different origins, so a JSON POST sends a preflight.
- **Alternatives considered**: a separate `CORS_ORIGINS` list (deferred until a second origin exists, Constitution V); a wildcard origin (rejected: too broad, even without credentials).

## R17. OpenAPI error responses

- **Decision**:
  - `app/schemas/error.py` defines the `ApiModel`-based models `ValidationFieldError(field, reason)`, `ErrorBody(code, message, details: dict[str, object] | None, request_id)`, and `ErrorResponse(error: ErrorBody)`.
  - `app/api/errors.py` exports `ERROR_RESPONSES = {400: ..., 422: ..., 500: ...}`, each with `{"model": ErrorResponse, "description": ..., "headers": {"X-Request-ID": {...}}}`.
  - The events router passes `responses={201: {"headers": {"X-Request-ID": ...}}, **ERROR_RESPONSES}`. Because 422 is declared explicitly, FastAPI doesn't add its default `HTTPValidationError` response.
  - An OpenAPI contract test checks the generated `/openapi.json` against [contracts/create-event.openapi.yaml](contracts/create-event.openapi.yaml): status codes, schema references (resolved, without hard-coding component names other than `ErrorResponse`), the request constraints, and the `X-Request-ID` headers.
- **Rationale**: The contract (§1) requires response schemas to be exposed through FastAPI OpenAPI, and frontend types derive from them (FR-015). Exception handlers alone don't change the schema (verified with FastAPI 0.162.0).
- **Alternatives considered**: hand-maintained OpenAPI (rejected: it drifts from code).
