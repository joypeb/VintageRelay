---

description: "Task list for feature 003-read-event"
---

# Tasks: Read Event

**Input**: Design documents from `/specs/003-read-event/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/read-event.openapi.yaml](contracts/read-event.openapi.yaml), [quickstart.md](quickstart.md)

**Tests**: Required (Constitution II).
- Every behavior's test task comes before the implementation task that covers it.
- Run each test and confirm it fails for the expected reason (Red) before implementing.
- No test in this plan is allowed to be green on first run. If one is, report it as a planning defect.

**Organization**:
- US1 (participant read), US3 (closed event readable), and US4 (auth rejection) share one cycle. All three are served by the same route, dependency, and service method, and US3 needs no extra code: a closed event is readable as soon as the read exists. Their tests must be Red before the route exists.
- US2 (organizer stats) is a separate cycle. In the first cycle, `stats` is `null` for everyone, so the US2 tests start Red.

**Delegates** (AGENTS.md):
- Each task names its Paseo profile. Tasks with no listed agent are done by the orchestrator (docs and API artifacts only).
- Every test → implementation cycle ends with a `commit-reviewer` review and then a commit. Never commit a Red state alone.
- Checks for every backend cycle: `cd backend && uv run ruff format --check --no-cache . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`.

**Rules for every delegate**:
- `docs/rules/dev/common/api-contract.md` (Authentication, error format).
- `docs/rules/dev/backend/{api,error-handling,database,testing}.md`.
- `docs/rules/dev/common/testing.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 from spec.md
- **Paths**: `backend/app/`, `backend/tests/{services,api}/`, `postman/`, `docs/`

---

## Phase 1: Setup (Shared Infrastructure)

No tasks. The feature 001 infrastructure (settings, `Db`, error handlers, request ID, CORS, Alembic) is reused. There are no new dependencies and no migration ([research.md](research.md); [data-model.md](data-model.md)).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Test fixtures for rows that later APIs (join 04, close 03) will create, and the shared response builder (R6, R10). Neither adds new behavior: the fixtures are test infrastructure, and the refactor stays under the existing green create tests. This phase is one commit after `commit-reviewer`.

**⚠️ CRITICAL**: Phase 3 depends on both tasks.

- [X] T001 [P] Add helpers to `backend/tests/conftest.py`, next to `count_rows`. Both use `db.write()`, need no new fixtures, and are plain functions importable from `tests.conftest` (agent: `test-author`):
  - `add_participant(db: Db, event_id: str, display_name: str) -> tuple[Participant, str]`:
    - Generates a token with `app.core.security.generate_participant_token()`.
    - Inserts `Participant(id=str(uuid4()), event_id=event_id, display_name=display_name, session_token_hash=hash_participant_token(token), created_at=datetime.now(UTC))`.
    - Returns the participant and the **raw** token.
  - `close_event(db: Db, event_id: str, closed_at: datetime) -> None`: sets `events.status = 'closed'` and `events.closed_at = closed_at` for that event.
  - Run the existing suite to confirm it stays green (no new tests in this task).
- [X] T002 [P] Refactor `backend/app/services/event.py` (R6). Extract:
  ```python
  build_event_read(event: Event, me: Participant, stats: EventStats | None, settings: Settings) -> EventRead
  ```
  - `is_organizer = me.id == event.organizer_participant_id`.
  - `organizer_participant_id = event.organizer_participant_id`.
  - `entry_url = f"{settings.app_base_url}/join?code={event.entry_code}"` (unchanged).
  - `status = EventStatus(event.status)`.

  `build_event_session` must call it with `stats=EventStats(participant_count=1, available_clothing_count=0, confirmed_exchange_count=0)`. Note: in `create`, `set_organizer` runs before `build_event_session`, so `event.organizer_participant_id == organizer.id` at that point.

  No behavior change: all existing tests (especially `tests/api/test_create_event*.py` and `tests/services/test_event_*.py`) stay green. Agent: `implementer-be`.

**Checkpoint**: The backend checks are green, and `build_event_read` is importable.

---

## Phase 3: User Story 1 + User Story 3 + User Story 4 — Read the event; closed events readable; unauthorized reads rejected (P1 / P2 / P2) 🎯 MVP

**Goal**: `GET /api/v1/events/{event_id}` with `Authorization: Bearer <participantToken>` returns the `EventRead` shape:
- caller info is correct,
- entry code and link are visible to all,
- closed events are readable,
- no side effects.

Auth failures return 401 before 404. Another event's ID, a non-existent ID, and a malformed ID all return the same 404. In this cycle `stats` is `null` for **every** caller; US2 adds organizer stats.

**Independent Test**:
- US1: the organizer and a regular participant each read the event and get the right `me`.
- US3: a closed event is read with status `closed` and `closedAt`.
- US4: missing, non-Bearer, empty, and unknown tokens return 401; another event's ID, a non-existent ID, and a malformed ID return 404.

### Tests (write first, confirm Red) ⚠️ — agent: `test-author`

- [ ] T003 [P] [US1] Write `backend/tests/api/test_read_event.py`. Create the event via `client.post("/api/v1/events", json={"name": "Mangwon Flea Market Swap Corner", "organizerDisplayName": "Mina"})`; keep `event_id` and the organizer token. Add a regular participant with `add_participant(db, event_id, "Joon")` (T001).
  - **Regular participant** (`GET /api/v1/events/{event_id}`, header `Authorization: Bearer <joon token>`):
    - 200, and the body has exactly the keys `id`, `name`, `status`, `entryCode`, `entryUrl`, `organizerParticipantId`, `createdAt`, `closedAt`, `me`, and `stats`.
    - `status == "active"`, `closedAt is None`, and `name == "Mangwon Flea Market Swap Corner"`.
    - `me == {"participantId": <joon id>, "displayName": "Joon", "isOrganizer": False}`.
    - `organizerParticipantId` equals the create response's `event.organizerParticipantId`.
    - `entryCode` equals the created code, and `entryUrl == f"https://vintage-relay.test/join?code={entryCode}"`.
    - `createdAt` ends with `Z`.
    - `stats is None`.
  - **Organizer** (organizer token): `me.participantId == organizerParticipantId`, `me.displayName == "Mina"`, and `me.isOrganizer is True`. Every field except `me`/`stats` equals the create response's `event`. Don't assert on `stats` here; US2 owns that.
  - **No secrets**: `"participantToken"` is not in the body, and neither raw token appears in `response.text`.
  - **No side effects** (FR-010):
    - Read twice with the same token. The two bodies are equal.
    - `count_rows(db, "events")` and `count_rows(db, "participants")` are unchanged.
    - The `events` row (`status`, `closed_at`, `organizer_participant_id`) is unchanged.
  - **`X-Request-ID`**: sending `X-Request-ID: rd-1` echoes it in the response header.
- [ ] T004 [P] [US3] In `backend/tests/api/test_read_event.py`, add closed-event tests. Create the event, `add_participant(...)`, then `close_event(db, event_id, datetime(2026, 10, 27, 9, 0, tzinfo=UTC))` (T001).
  - The regular participant and the organizer each get 200 with `status == "closed"` and `closedAt == "2026-10-27T09:00:00.000Z"`.
  - All other fields are as in T003.
- [ ] T005 [P] [US4] Write `backend/tests/api/test_read_event_auth.py`. Set up event A (with organizer token A) and event B (with organizer token B) via the create API.
  - **401 cases**: each returns 401 with body `{"error": {"code": "UNAUTHENTICATED", "message": <non-empty str>, "details": None, "requestId": <equals X-Request-ID header>}}`:
    - no `Authorization` header;
    - `Authorization: Basic <token A>`;
    - `Authorization: Bearer ` (empty credential);
    - `Authorization: <token A>` (no scheme);
    - `Authorization: Bearer not-a-real-token`.
  - **401 before 404**: with no header and with an unknown token, `GET /api/v1/events/00000000-0000-4000-8000-000000000000` and `GET /api/v1/events/not-a-uuid` both return 401, not 404 or 422.
  - **404 cases**: each test first asserts that `GET /api/v1/events/{event A id}` with token A returns 200, which keeps the test Red until the route exists (an unmatched path already returns `NOT_FOUND`). Then each case returns 404 with `code == "NOT_FOUND"` and `details is None`:
    - token A on event B's ID;
    - token A on `00000000-0000-4000-8000-000000000000`;
    - token A on `not-a-uuid`;
    - token A on `%20`.
  - **Indistinguishable**: after the same 200 precondition, the three main 404 bodies (another event, non-existent ID, malformed ID) are equal once `requestId` is removed (FR-004, SC-003).
  - **No 422**: no request in this file returns 422.
  - **No token in logs**: with `caplog.set_level(logging.DEBUG)`, a successful read with token A and a 401 with `Bearer not-a-real-token` leave neither token A nor `not-a-real-token` in any `caplog` record's `getMessage()` or in the formatted `JsonFormatter().format(record)` output (FR-002, R9).
- [ ] T006 [P] [US1] Extend `backend/tests/services/test_event_service.py` with `EventService.get(actor, event_id)` tests. Use `EventService(db, settings)`; create the event through `service.create(EventCreate(name="Swap", organizer_display_name="Mina"))` and get the actor rows via `add_participant` / a `db.read()` lookup.
  - With the organizer as actor: returns `EventRead` with `me.is_organizer is True`.
  - With a regular participant as actor: `me.is_organizer is False` and `stats is None`.
  - With a valid actor but a non-existent `event_id` passed directly (`"00000000-0000-4000-8000-000000000000"`), it raises `app.domain.errors.NotFoundError`. This is the race guard from R4.
  - The method writes nothing: `count_rows` is unchanged before and after.
- [ ] T007 [P] [US4] Extend `backend/tests/api/test_openapi_contract.py` with `test_read_event_openapi_describes_success_and_errors`, for operation `document["paths"]["/api/v1/events/{event_id}"]["get"]` (R8):
  - `{"200", "401", "404", "500"} <= responses.keys()` and `"422" not in responses`.
  - `"HTTPValidationError" not in json.dumps(operation)` and `"HTTPValidationError" not in document["components"]["schemas"]`.
  - Each of those four responses has an `X-Request-ID` header.
  - The 200 schema resolves to an object whose `required` includes `id`, `name`, `status`, `entryCode`, `entryUrl`, `organizerParticipantId`, `createdAt`, `closedAt`, `me`, and `stats`, and doesn't include `participantToken`.
  - The 401, 404, and 500 schemas are `{"$ref": "#/components/schemas/ErrorResponse"}`.
  - `operation["security"]` is non-empty, and the referenced scheme in `document["components"]["securitySchemes"]` has `type == "http"` and `scheme == "bearer"` (case-insensitive).
  - The POST `/api/v1/events` operation is unchanged: responses are still `{"201", "400", "422", "500"}`, and its 422 still references `ErrorResponse`.
  - The existing create-event OpenAPI tests must keep passing unchanged (including `assert not operation.get("security")` for POST).

### Implementation (Green → Refactor) — agent: `implementer-be`

- [ ] T008 [P] [US4] Add to `backend/app/domain/errors.py` (R3):
  - `class UnauthenticatedError(AppError)` with `status_code = 401`, `code = "UNAUTHENTICATED"`, and `message = "Please join the event again."`.
  - `class NotFoundError(AppError)` with `status_code = 404`, `code = "NOT_FOUND"`, and `message = "Resource not found."`.
- [ ] T009 [P] [US1] Add repository functions (R1, R4):
  - In `backend/app/repositories/participant.py`: `get_by_token_hash(s: Session, token_hash: str) -> Participant | None`, using `select(Participant).where(Participant.session_token_hash == token_hash)`.
  - In `backend/app/repositories/event.py`: `get(s: Session, event_id: str) -> Event | None`, using `s.get(Event, event_id)`.
- [ ] T010 [US4] Add to `backend/app/api/deps.py` (R1, R2):
  - `bearer_scheme = HTTPBearer(auto_error=False, scheme_name="participantToken", description="participantToken from event creation or join")`.
  - `get_current_participant(event_id: str, db: DbDep, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]) -> Participant`:
    - If `credentials is None` or `not credentials.credentials.strip()`, raise `UnauthenticatedError()`.
    - Inside its own `with db.read() as s:`, look up `participant_repo.get_by_token_hash(s, hash_participant_token(credentials.credentials))`. If it returns `None`, raise `UnauthenticatedError()`.
    - If `participant.event_id != event_id`, raise `NotFoundError()`.
    - Return the participant.
  - Alias `CurrentParticipant = Annotated[Participant, Depends(get_current_participant)]`.
  - Never log the token or the header.
  - Depends on T008 and T009.
- [ ] T011 [US1] Add `EventService.get(self, actor: Participant, event_id: str) -> EventRead` to `backend/app/services/event.py` (R4):
  - Inside `with self.db.read() as s:`, `event = event_repo.get(s, event_id)`. If it is `None`, raise `NotFoundError()`.
  - Return `build_event_read(event, actor, None, self.settings)`. `stats` is always `None` in this cycle; US2 (T016) adds the organizer stats.
  - Write nothing and log no audit entry.
  - Depends on T002, T008, and T009.
- [ ] T012 [US4] In `backend/app/api/errors.py`, add `error_responses(*statuses: int) -> dict[int | str, dict[str, Any]]` (R8):
  - Build it from a module map `{400: "Malformed request.", 401: "Missing or invalid participant token.", 404: "Resource not found.", 422: "Field validation failed.", 500: "A temporary error occurred."}`. Each entry has `model: ErrorResponse`, a `description`, and an `X-Request-ID` header, as in the existing dict.
  - Redefine `ERROR_RESPONSES = error_responses(400, 422, 500)` so POST is unchanged.
- [ ] T013 [US4] In `backend/app/main.py` `create_app`, install a custom `app.openapi` (R8):
  - On first call, build the schema with `fastapi.openapi.utils.get_openapi(title=app.title, version=app.version, routes=app.routes)`.
  - Only for `paths["/api/v1/events/{event_id}"]["get"]`, delete `responses["422"]` when its schema `$ref` ends with `/HTTPValidationError`. Every other operation is untouched, so a future endpoint with validated parameters keeps its documented 422.
  - Then delete the `HTTPValidationError` and `ValidationError` entries from `components.schemas` if nothing references them any more.
  - Cache the result in `app.openapi_schema`.
  - Keep the function small and local to `main.py`.
- [ ] T014 [US1] Add the route to `backend/app/api/routers/events.py` (R7):
  ```python
  @router.get("/{event_id}", summary="Read an event", responses={200: {"headers": {"X-Request-ID": ...}}, **error_responses(401, 404, 500)})
  def read_event(event_id: str, me: CurrentParticipant, service: EventServiceDep) -> EventRead:
      return service.get(me, event_id)
  ```
  - Use `def`, not `async def`, and keep the route thin.
  - Makes T003–T007 pass, except that US2 stats assertions don't exist yet.
  - Depends on T010–T013.

**Checkpoint**: T003–T007 pass and the full backend checks are green. Commit after `commit-reviewer`. This is the MVP: P2 banner, closed banner, and role detection are all served.

---

## Phase 4: User Story 2 — Organizer sees event summary counts (Priority: P1)

**Goal**: The organizer's read includes `stats`:
- `participantCount` is the participants of this event only (including the organizer).
- `availableClothingCount` and `confirmedExchangeCount` are `0` until features 06 and 11 add those tables (R5).

Non-organizers keep `stats: null`.

**Independent Test**: The organizer reads a fresh event and gets 1/0/0. After adding 2 participants it gets 3/0/0. A participant of another event isn't counted. A regular participant gets `null`.

### Tests (write first, confirm Red) ⚠️ — agent: `test-author`

- [ ] T015 [P] [US2] Add organizer stats tests to `backend/tests/api/test_read_event.py`:
  - The organizer reads a freshly created event: `stats == {"participantCount": 1, "availableClothingCount": 0, "confirmedExchangeCount": 0}`.
  - After `add_participant(db, event_id, "Joon")` and `add_participant(db, event_id, "Sora")`: the organizer gets `participantCount == 3`.
  - After creating a second event (via the API) and adding a participant to it: the first event's organizer still gets `participantCount == 3`.
  - (Regular participant `stats is None` is already covered by T003; it is not repeated here because it would be green on first run.)
  - Closed event (`close_event`): the organizer still gets `stats` with the same counts (US3 AS2).
- [ ] T016 [P] [US2] Extend `backend/tests/services/test_event_service.py`:
  - `EventService.get` with the organizer as actor returns `stats == EventStats(participant_count=<n>, available_clothing_count=0, confirmed_exchange_count=0)`, where `n` counts only participants with that `event_id`.
  - (Non-organizer `stats is None` is covered by T006; not repeated here.)

### Implementation (Green → Refactor) — agent: `implementer-be`

- [ ] T017 [P] [US2] Add `count_by_event(s: Session, event_id: str) -> int` to `backend/app/repositories/participant.py`, using `select(func.count()).select_from(Participant).where(Participant.event_id == event_id)` and returning `s.execute(stmt).scalar_one()`, the same pattern as `count_rows` in `backend/tests/conftest.py` (R5). `Session` has no `scalar_one` method.
- [ ] T018 [US2] Update `EventService.get` in `backend/app/services/event.py` (R5). Inside the same read transaction, when `actor.id == event.organizer_participant_id`:
  - Build `stats = EventStats(participant_count=participant_repo.count_by_event(s, event.id), available_clothing_count=0, confirmed_exchange_count=0)`.
  - Put the comment `# TODO(feature 06/11): count from clothing/proposals` on the two zero values.
  - Otherwise `stats = None`.
  - Makes T015–T016 pass. Depends on T017.

**Checkpoint**: All tests pass and the backend checks are green. Commit after `commit-reviewer`.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: API artifacts, documentation sync, and final and live validation.

- [ ] T019 [P] Add `postman/collections/Vintage Relay API/08 Auth errors/Get non-existent event.request.yaml` (R11). Cross-event 404 is covered by T005. Model it on `08 Auth errors/Missing token.request.yaml`, with `order: 6000` and `GET {{baseUrl}}/api/v1/events/00000000-0000-4000-8000-000000000000`, sent with the default collection bearer auth (the organizer token of `{{eventId}}`). Its tests assert status 404 and `error.code == "NOT_FOUND"` — orchestrator (API artifact).
- [ ] T020 [P] Update `docs/plans/api/02-read-event.md` — orchestrator (docs):
  - Processing Rules: the token is checked first (401 even for a non-existent event); the `event_id` path value isn't format-validated, so a malformed, non-existent, or other event's ID all return the same `404 NOT_FOUND`.
  - Errors: the 401 row covers a missing header, a non-Bearer scheme, an empty token, or an unknown token.
  - `stats`: `availableClothingCount` and `confirmedExchangeCount` are `0` until the clothing and proposals features exist.
- [ ] T021 Run the full suites and record the actual results:
  - Backend: `cd backend && uv run ruff format --check --no-cache . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`
  - Frontend (unchanged; regression check): `cd frontend && pnpm lint && pnpm typecheck && pnpm test`
- [ ] T022 Run the manual validation from [quickstart.md](quickstart.md) §2 against Docker Compose:
  - The happy-path read returns 200 with the same shape as creation and no `participantToken`.
  - Every error-path row gives the expected status and code, and `requestId` equals `X-Request-ID`.
  - Report this as local, live, manual evidence.
- [ ] T023 Run the SC-006 timing check from [quickstart.md](quickstart.md) §4: 100 `GET /api/v1/events/{id}` requests with a bearer token from 5 concurrent clients. Report p50, p95, and the error count. The pass condition is p95 < 1 s with 0 errors; record the result in the PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: T001 and T002 are independent of each other. Both block Phase 3.
- **US1 + US3 + US4 (Phase 3)**: Depends on Phase 2.
- **US2 (Phase 4)**: Depends on Phase 3 (same route, service, and test file).
- **Polish (Phase 5)**:
  - T019 and T020 depend on Phase 3.
  - T021 depends on all implementation tasks.
  - T022 and T023 depend on T021.

### TDD Cycles (one commit each, after `commit-reviewer`)

| Cycle | Red (`test-author`) | Green (`implementer-be`) |
|---|---|---|
| Foundational | T001 (fixtures, no new tests) | T002 (refactor under existing green tests) |
| US1+US3+US4 | T003, T004, T005, T006, T007 | T008–T014 |
| US2 | T015, T016 | T017, T018 |

These run without a test cycle (orchestrator → `commit-reviewer` → commit): T019 and T020 (Postman request and docs).

### Within Phase 3

T008 and T009 run in parallel. Then T010 (after T008 and T009) and T011 (after T002, T008, and T009). Then T012 and T013 in parallel. Then T014 last.

### Parallel Opportunities

- **Phase 2:** T001 and T002 touch different files. Run them in one workspace sequentially (one implementer at a time); `test-author` T001 can run alongside.
- **Phase 3:**
  - Tests T003–T007 in one `test-author` run (T003 and T004 share a file, so write them sequentially).
  - Implementation T008 and T009, then T012 and T013.
- **Phase 4:** T015 and T016 (different files), then T017.
- **Polish:** T019 and T020.

---

## Parallel Example: Phase 3

```bash
# test-author — one Red batch (all must fail: route, dependency, and service method don't exist yet):
Task: "T003/T004 read and closed-read API tests in backend/tests/api/test_read_event.py"
Task: "T005 auth 401/404 tests in backend/tests/api/test_read_event_auth.py"
Task: "T006 EventService.get tests in backend/tests/services/test_event_service.py"
Task: "T007 OpenAPI GET contract in backend/tests/api/test_openapi_contract.py"

# implementer-be — then in order:
Task: "T008 domain errors in backend/app/domain/errors.py"
Task: "T009 repository lookups in backend/app/repositories/{participant,event}.py"
```

---

## Implementation Strategy

### MVP First

1. Phase 2 (fixtures + `build_event_read`).
2. Phase 3 (US1 + US3 + US4). **Stop and validate**: participants can read their event with role and closed state, and unauthorized reads are rejected. This serves the P2 banner and the closed-event banner.

### Incremental Delivery

Foundational → read/auth (MVP) → organizer stats for M1 (US2) → Polish (Postman, docs, live and performance checks).

---

## Notes

- [P] = different files and no dependency on incomplete tasks.
- Never delete or skip a failing test. Use `xfail(reason=...)` only for deliberately unimplemented cases; none are planned.
- `get_current_participant` is the shared auth dependency for every later authenticated endpoint. Don't special-case it for this route.
- Out of scope:
  - frontend `getEvent`, the P2/M1 screens, and the closed banner (a later frontend feature);
  - read access after closure and record retention, and session recovery (open decisions);
  - real clothing and exchange counts (features 06 and 11).
