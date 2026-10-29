# Tasks: Join Event (Backend)

**Input**: Design documents from `specs/007-join-event/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [operation contract](contracts/join-event.openapi.yaml), [quickstart.md](quickstart.md), and `.specify/memory/constitution.md`.

**Tests**: Required. Every production behavior change follows test-author Red → implementer-be Green → Refactor. Every test that covers a behavior is written and confirmed failing before the implementation task that introduces that behavior; no behavior is first tested after its commit. Never delete or skip failing tests; genuinely unimplemented cases use `xfail(reason=...)`.

**Organization**: Every committed state is safe: log masking and the name index land before any endpoint exposes them, and the first join commit already rejects closed events and duplicate names and carries its concurrency and logging tests. US1 (lookup) is the MVP. US2, US3, and US4's join assertions share one cycle because shipping join without them would violate Constitution I or II. US4's masking tests belong to the Foundational masking cycle.

## Format: `[ID] [P?] [Story] Description`

- Paths are relative to the repository root. `[P]` marks test-author work on disjoint files that may run together; it never permits parallel production implementers in one workspace.
- Do not add tables, columns, dependencies, rate limiting (deferred, research R7), session recovery, or frontend changes.

## Execution Rules

The orchestrator writes Spec Kit artifacts only. Before each delegation, call Paseo `list_profiles`, read notes, and pass the selected profile's provider/model/modeId/thinkingOptionId/featureValues to `create_agent`. Required profiles: `test-author`, `implementer-be`, `commit-reviewer`; a missing profile stops that cycle. Use this feature's workspace, one implementer at a time; delegates must not delegate.

Each prompt includes the task IDs/text, allowed paths, this feature's artifacts, `AGENTS.md`, `docs/rules/dev/common/api-contract.md`, `docs/rules/dev/common/testing.md`, `docs/rules/dev/backend/` (all), and `docs/plans/api/04-join-event.md`. Test authors may edit `backend/tests/**` only; implementers may edit only the named paths under `backend/app/**` and `backend/alembic/**`. Reviewers are read-only.

Each **review** task closes its cycle: run focused tests and the full backend checks, have the orchestrator rerun them, then obtain a fresh `commit-reviewer` OCR delegate review (`ocr delegate preview --format json`, `ocr delegate rule --format json <paths>`) of the exact commit content in the same workspace, with English findings (severity, file/line, trigger/impact, fix) and coverage. Resolve Critical/High findings, rerun checks, obtain re-review, then commit the green cycle. Never commit Red alone; do not create empty commits. PR work needs a separate `pr-reviewer` and is not authorized by this list.

**Log assertions**: tests that inspect logs filter `caplog.records` to application loggers (`record.name.startswith("app.")`). TestClient's transport logger records the full request URL and is outside the application's logging; it must not be asserted on. Format filtered records with both `JsonFormatter` and `TextFormatter` from `backend/app/core/logging.py` when checking for raw values.

**Closing events in tests**: `close_event` in `backend/tests/conftest.py` is a plain helper, not a fixture; import it and call `close_event(db, event_id, closed_at)` (see `backend/tests/api/test_read_event.py`).

Full backend checks:

```bash
cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

## Phase 1: Setup

- [X] T001 Verify branch `docs/backend-join-event-spec` (or its feature successor) and `.specify/feature.json` pointing to `specs/007-join-event`; run the full backend checks and record the baseline results in `specs/007-join-event/quickstart.md` under a new "Implementation Evidence" section.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain primitives, log masking, and the name index, all before any endpoint exists.

### Domain primitives and log masking

- [ ] T002 [P] Have `test-author` add unit tests in `backend/tests/unit/test_entry_code.py` for planned `normalize_entry_code(value)` returning `value.strip().upper()` (e.g. `" k7p3qx "` → `"K7P3QX"`), and in `backend/tests/unit/test_errors.py` for planned `EntryCodeNotFoundError` (404, `NOT_FOUND`, message exactly "We couldn't find an event with this code. Check the code and try again.", a `NotFoundError` subclass), `EventClosedError` (409, `EVENT_CLOSED`, default message exactly "This event has ended."), and `DisplayNameTakenError` (409, `DISPLAY_NAME_TAKEN`, "This display name is already taken in this event."), both subclasses of a new `ConflictError` (409). Run; confirm failure from missing names.
- [ ] T003 [P] [US4] Have `test-author` add `backend/tests/unit/test_logging.py` cases for planned `mask_path(path)` in `backend/app/core/logging.py`: only the segment immediately after `/api/v1/entry-codes/` is masked and later segments are preserved; `/api/v1/entry-codes/K7P3QX` → `/api/v1/entry-codes/K7****`; `/api/v1/entry-codes/K7P3QX/fail` → `/api/v1/entry-codes/K7****/fail`; a segment of two or fewer characters becomes `****`; an empty segment and all other paths (e.g. `/api/v1/events/abc`) are unchanged. Run; confirm failure from the missing function.
- [ ] T004 [P] [US4] Have `test-author` add `backend/tests/api/test_log_masking.py` covering all three application log paths, each asserting the expected record **exists** and its `path` is masked, and that no filtered record (both formatters) contains the raw code `K7P3QX`: (a) `request` log: `client.get("/api/v1/entry-codes/K7P3QX")` (404 before the route exists; the middleware still logs); (b) middleware `unhandled_error` log: add a test-only route `GET /api/v1/entry-codes/{code}/fail` raising `RuntimeError` to the `app` fixture, request it with `client_no_raise` for code `K7P3QX`, and assert a 500 response; (c) registered handler `unhandled_error` log: call `app.exception_handlers[Exception]` directly with a `starlette.requests.Request` built from an HTTP scope whose `path` is `/api/v1/entry-codes/K7P3QX` and a `RuntimeError`, using `asyncio.run`. (d) server access log: after `create_app(settings, db)`, apply Uvicorn's own logging configuration (`logging.config.dictConfig(uvicorn.config.LOGGING_CONFIG)`, which re-enables `uvicorn.access` as `fastapi run` does after importing the app), then start the app with `TestClient(app)` as a context manager and assert `logging.getLogger("uvicorn.access").disabled is True`; restore the logger's state in teardown. Run; confirm (a)–(d) fail (unmasked paths; access logger re-enabled).
- [ ] T005 Have `implementer-be` satisfy T002–T004 in `backend/app/domain/entry_code.py`, `backend/app/domain/errors.py`, and `backend/app/core/logging.py`; apply `mask_path` to `path` in both the `request` and `unhandled_error` logs in `backend/app/core/logging.py` and in the `unhandled` handler in `backend/app/api/errors.py`; add `disable_access_log()` to `backend/app/core/logging.py` (sets `logging.getLogger("uvicorn.access").disabled = True`), keep the call in `setup_logging`, and also call it at lifespan startup in `backend/app/main.py` before the `db is not None` branch, because the server reconfigures logging after importing the app; add `409: "State conflict with the current resource."` to `_ERROR_DESCRIPTIONS` in `backend/app/api/errors.py`.
- [ ] T006 Review and commit the T002–T005 cycle under Execution Rules.

### Display-name unique index

- [ ] T007 [P] Have `test-author` extend `backend/tests/test_migrations.py`: after `upgrade head`, query `sqlite_master` (SQLAlchemy Inspector skips expression indexes) and assert index `uq_participants_event_id_display_name_lower` exists on `participants` with SQL containing `UNIQUE`, `event_id`, and `lower(display_name)`; after inserting an event and a participant named `Ana`, inserting `ANA` in the same event raises `IntegrityError` and inserting `ANA` in another event succeeds; `downgrade` to `ee1be11dd5a7` removes the index. Add `backend/tests/services/test_participant_name_index.py` asserting the same enforcement through the `db` fixture (`Base.metadata.create_all`). Run; confirm failure.
- [ ] T008 Have `implementer-be` satisfy T007: add `Index("uq_participants_event_id_display_name_lower", "event_id", func.lower(display_name), unique=True)` to `__table_args__` in `backend/app/models/participant.py`, and an Alembic revision under `backend/alembic/versions/` (down_revision `ee1be11dd5a7`) creating it in `upgrade()` and dropping it in `downgrade()`.
- [ ] T009 Review and commit the T007–T008 cycle under Execution Rules.

**Checkpoint**: Masking and the name safeguard exist; no endpoint behavior changed.

## Phase 3: User Story 1 - Visitor previews an event from its entry code (Priority: P1) 🎯 MVP

**Goal**: Public `GET /api/v1/entry-codes/{entry_code}` returning `{eventId, name, status}`.

**Independent Test**: Create an event, look it up in lowercase with surrounding spaces, after closing it, and with an unknown code.

### Tests for User Story 1 (write first)

- [ ] T010 [P] [US1] Have `test-author` add `backend/tests/api/test_lookup_entry_code.py`: 200 body has exactly keys `eventId`, `name`, `status` for an active event; lowercase and `%20`-padded codes match; after `close_event(db, event_id, closed_at)` the lookup returns `status: "closed"`; unknown code → 404 `NOT_FOUND` with the exact T002 message and an `X-Request-ID` header; an `Authorization: Bearer garbage` header is ignored (still 200); participant row count unchanged; a successful lookup's filtered application records contain no raw code. Run; confirm failure (route missing, so 200 cases fail with 404).
- [ ] T011 [P] [US1] Have `test-author` extend `backend/tests/api/test_openapi_contract.py`: operation `lookupEntryCode` at `/api/v1/entry-codes/{entry_code}` GET has no security requirement, documents 200/404/500, and has no framework `HTTPValidationError` 422. Run; confirm failure.

### Implementation for User Story 1

- [ ] T012 [US1] Have `implementer-be` satisfy T010–T011: add `EntryCodePreview(event_id: str, name: str, status: EventStatus)` to `backend/app/schemas/event.py`; `get_by_entry_code(s, code)` to `backend/app/repositories/event.py`; `EventService.lookup_entry_code(code)` using `db.read()` and `normalize_entry_code` in `backend/app/services/event.py`, raising `EntryCodeNotFoundError`; new router `backend/app/api/routers/entry_codes.py` (prefix `/entry-codes`, tag `entry-codes`, `operation_id="lookupEntryCode"`, `error_responses(404, 500)`, no auth dependency); include it and add the path to the bodyless 422 cleanup in `backend/app/main.py`.
- [ ] T013 [US1] Review and commit the T010–T012 cycle under Execution Rules; confirm T004 stays green with the real route registered.

**Checkpoint**: Preview works and never logs raw codes.

## Phase 4: User Stories 2, 3 & 4 - Join, reject invalid joins, protect credentials (Priority: P1/P2)

**Goal**: `POST /api/v1/events/{event_id}/participants` creates a regular participant (201 `EventSession`) and, in the same commit, rejects validation failures, wrong codes, closed events, and duplicate names atomically, serializes against concurrent joins and closure, and logs exactly one masked-safe success record.

**Independent Test**: Join an active event and read it with the returned token; attempt each invalid join; run overlapping joins and join/close in both orders; inspect application logs.

### Tests for User Stories 2, 3 & 4 (write first)

- [ ] T014 [P] [US2] Have `test-author` add `backend/tests/api/test_join_event.py`. Success: 201 with `event.me.isOrganizer == false`, `event.me.displayName` trimmed (`" Joon "` → `"Joon"`), `event.stats is None`, `event.status == "active"`, non-empty `participantToken`; lowercase `entryCode` succeeds; names of exactly 1 and 30 characters succeed; `GET /api/v1/events/{id}` with the new token returns 200 as non-organizer without `participantToken`; another event's GET with that token → 404. Rejections [US3]: missing `entryCode`/`displayName`, whitespace-only and 31-character names, a control character, an unknown field → 422 `VALIDATION_ERROR` with matching `details.fields`; wrong code, nonexistent UUID, and malformed `event_id` → 404 with identical status, `code`, `message` (the T002 lookup message), and `details`, excluding `requestId`; after `close_event(db, event_id, closed_at)`, the correct code → 409 `EVENT_CLOSED` with message "This event has ended, so you can't join it." and a wrong code → 404; `"JOON"` after `"Joon"`, `"STRASSE"` after `"Straße"`, and the organizer's name in another case → 409 `DISPLAY_NAME_TAKEN` with `details == {"field": "displayName"}`; participant count unchanged after every rejection. Logging [US4], filtered to application loggers: exactly one `participant_joined` record per success with `event_id` and `participant_id` attributes and no `display_name`; no formatted record contains the issued token or the raw `entryCode`; rejected joins (404, 409, 422) emit no `participant_joined`. Run; confirm failure from the missing route.
- [ ] T015 [P] [US2] Have `test-author` add `backend/tests/services/test_join_event.py` with injected clock/token generator: one new participant whose `session_token_hash == hash_participant_token(token)` and `!= token`; `created_at` equals the clock value; event row unchanged. Atomicity [US3]: monkeypatch a failure after `participant_repo.add` flushes (e.g. in session building) → exception propagates, zero new participant rows, no `participant_joined` record; a subsequent valid join succeeds. Unicode [US3]: `Straße` then `STRASSE` raises `DisplayNameTakenError` although the SQLite index alone would accept it. Run; confirm failure.
- [ ] T016 [P] [US3] Have `test-author` add `backend/tests/services/test_join_event_concurrency.py` following `backend/tests/services/test_close_event_concurrency.py` (threads, independent sessions, finite timeouts well under the 5 s busy timeout). Name races: barrier-synchronized `db.write` with `"Ana"`/`"ANA"` and, separately, `"Straße"`/`"STRASSE"` → exactly one success and one `DisplayNameTakenError`, and one matching row. Ordering is controlled, not inferred from timestamps: **join first** — monkeypatch `participant_repo.add` with a wrapper that, after the original flush, sets `inside` and waits on `release` (`threading.Event`); start the join, wait for `inside`; start `EventService.close` in a second thread whose `db.write` is wrapped to set `second_started` immediately before calling the original (which then blocks on `BEGIN IMMEDIATE`); wait for `second_started` (timeout), then set `release` in a `finally` block before awaiting either result; assert the join returned a session, the close succeeded, and the participant row exists. **Close first** — monkeypatch `event_repo.mark_closed` the same way; start the close, wait for `inside`; start the join with the same `second_started` handshake on its `db.write`; wait for `second_started`, then set `release` in a `finally` block; assert the join raised `EventClosedError` and the participant count is unchanged. Run; confirm failure.
- [ ] T017 [P] [US2] Have `test-author` extend `backend/tests/api/test_openapi_contract.py`: `joinEvent` has no security, its 201 response references `EventSession`, and it documents 400/404/409/422/500. Run; confirm failure.

### Implementation for User Stories 2, 3 & 4

- [ ] T018 [US2] Have `implementer-be` satisfy T014–T017: add `ParticipantCreate(entry_code: str = Field(min_length=1), display_name: str = Field(min_length=1, max_length=30))` with the control-character validator on `display_name` to `backend/app/schemas/event.py`; `list_display_names(s, event_id)` to `backend/app/repositories/participant.py`; `EventService.join(event_id, body)` in `backend/app/services/event.py` using one `Db.write()`: event exists and `hmac.compare_digest(normalize_entry_code(body.entry_code).encode(), event.entry_code.encode())` (both failures → `EntryCodeNotFoundError`) → closed → `EventClosedError("This event has ended, so you can't join it.")` → `body.display_name.casefold()` in the casefolded existing names → `DisplayNameTakenError(details={"field": "displayName"})` → create participant with token hash via `participant_repo.add`, mapping `IntegrityError` from the name index to the same error → build `EventSession` via `build_event_read(event, participant, None, settings)` inside the transaction; after commit `logger.info("participant_joined", extra={"event_id": event.id, "participant_id": participant.id})`. Add the route in `backend/app/api/routers/events.py` (`status_code=201`, `operation_id="joinEvent"`, `error_responses(400, 404, 409, 422, 500)`, no auth dependency).
- [ ] T019 [US2] Review and commit the T014–T018 cycle under Execution Rules.

**Checkpoint**: Visitors can join; every rejection, race, and log rule is enforced and tested from the first commit.

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T020 Run the full backend checks (reruns every test above, including masking, concurrency, and logging); then run the [quickstart](quickstart.md) manual scenarios against a fresh SQLite file and record actual results in `specs/007-join-event/quickstart.md` "Implementation Evidence". Frontend is unchanged by this feature; run `cd frontend && pnpm lint && pnpm typecheck && pnpm test` once to confirm no regression and record results.
- [ ] T021 Update `specs/007-join-event/spec.md` Assumptions only if implementation revealed a deviation, then review and commit documentation changes under Execution Rules.

## Dependencies & Execution Order

- Setup (T001) → primitives and masking (T002–T006) → name index (T007–T009) → US1 (T010–T013) → join with US2/US3/US4 (T014–T019) → Polish (T020–T021).
- Masking and the index precede any endpoint so no committed state leaks codes or permits duplicate names. US1 and join both edit `schemas/event.py`, `services/event.py`, and `test_openapi_contract.py`, so they run sequentially.

## Parallel Opportunities

- T002 ‖ T003 ‖ T004 (three disjoint test files).
- T010 ‖ T011.
- T014 ‖ T015 ‖ T016 ‖ T017 (four disjoint test files).
- T007 runs alone. Implementation tasks are sequential (one implementer per workspace).

## Implementation Strategy

1. **MVP**: Phases 1–3 deliver a safe entry-code preview.
2. Phase 4 delivers complete, safe joining in one reviewed commit.
3. Phase 5 reruns everything and records evidence.
4. Report deferred FR-013 rate limiting and open session-recovery decisions in the PR description.
