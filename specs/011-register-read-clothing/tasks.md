# Tasks: Register/Read Clothing (Backend)

**Input**: Design documents from `specs/011-register-read-clothing/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [operation contract](contracts/register-read-clothing.openapi.yaml), [quickstart.md](quickstart.md), and `.specify/memory/constitution.md`.

**Tests**: Required. Every production behavior change follows test-author Red → implementer-be Green → Refactor. Every test is written and confirmed failing before the implementation task that introduces its behavior. Never delete or skip failing tests; genuinely unimplemented cases use `xfail(reason=...)`.

**Organization**: Shared vocabulary (enums, error, URL helper, token lookup) and the `clothes` table land before any route. US1 and US2 share one cycle: shipping registration without its rejection rules would violate Constitution I. US3 (list) and US4 (detail) each follow as independent cycles; both read garments seeded directly into the database, so neither depends on the register route.

## Format: `[ID] [P?] [Story] Description`

- Paths are relative to the repository root. `[P]` marks test-author work on disjoint files that may run together; it never permits parallel production implementers in one workspace.
- Do not add a `clothing_analyses` table, a `ClothingAnalysis` or `ClothingSummary` schema, pagination, per-event limits, "who wants this" data, edit/withdraw endpoints, or frontend changes.

## Execution Rules

The orchestrator writes Spec Kit artifacts only. Before each delegation, call Paseo `list_profiles`, read notes, and pass the selected profile's provider/model/modeId/thinkingOptionId/featureValues to `create_agent`. Required profiles: `test-author`, `implementer-be`, `commit-reviewer`; a missing profile stops that cycle. Use this feature's workspace, one implementer at a time; delegates must not delegate.

Each prompt includes the task IDs/text, allowed paths, this feature's artifacts, `AGENTS.md`, `docs/rules/dev/common/api-contract.md`, `docs/rules/dev/common/testing.md`, `docs/rules/dev/backend/` (all), and `docs/plans/api/06-register-read-clothing.md`. Test authors may edit `backend/tests/**` only; implementers may edit only the named paths under `backend/app/**` and `backend/alembic/**`. Reviewers are read-only. No dependency changes.

Each **review** task closes its cycle: run focused tests and the full backend checks, have the orchestrator rerun them, then obtain a fresh `commit-reviewer` OCR delegate review (`ocr delegate preview --format json`, `ocr delegate rule --format json <paths>`) of the exact commit content in the same workspace, with English findings (severity, file/line, trigger/impact, fix) and coverage. Resolve Critical/High findings, rerun checks, obtain re-review, then commit the green cycle. Never commit Red alone; do not create empty commits. PR work needs a separate `pr-reviewer` and is not authorized by this list.

**Log assertions**: filter `caplog.records` to application loggers (`record.name.startswith("app.")`); format filtered records with both `JsonFormatter` and `TextFormatter` from `backend/app/core/logging.py` when checking for raw values.

**Seeding**: list/detail tests insert `Clothing` rows directly through the `db` fixture (plus `add_participant` and photo rows from `backend/tests/conftest.py`), with explicit `created_at` values and explicit `status` (including `withdrawn`), so they do not depend on the register route. A shared factory helper may be added to `backend/tests/conftest.py`.

Full backend checks:

```bash
cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

## Phase 1: Setup

- [X] T001 Verify branch `speckit-specify-register-read-clothing` and `.specify/feature.json` pointing to `specs/011-register-read-clothing`; run the full backend checks and record the baseline in `specs/011-register-read-clothing/quickstart.md` under a new "Implementation Evidence" section.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Enums, error class, photo URL helper, token lookup, and the `clothes` table, all before any clothing route exists.

### Vocabulary and shared helpers

- [X] T002 [P] Have `test-author` extend `backend/tests/unit/test_errors.py` for planned `PhotoAlreadyAttachedError` (subclass of `ConflictError`, status 409, code `PHOTO_ALREADY_ATTACHED`, English user-facing message, empty details); add `backend/tests/unit/test_clothing_enums.py` asserting `ClothingStatus` values exactly `available`, `confirmed`, `withdrawn` and `Ownership` values exactly `mine`, `others`, `all` in `backend/app/domain/enums.py`; add a unit test in `backend/tests/unit/test_photo_image.py` that planned `photo_url(settings.app_base_url, photo_id)` in `backend/app/domain/photos.py` returns `f"{settings.app_base_url}/api/v1/photos/{photo_id}"`. Run; confirm failure from the missing names.
- [X] T003 [P] Have `test-author` add `backend/tests/api/test_token_participant.py` for planned `TokenParticipant` in `backend/app/api/deps.py`, exercised through a test-only route added to the `app` fixture inside the test module: missing, blank, and unknown bearer tokens → `401 UNAUTHENTICATED`; a valid token from any event resolves its participant without checking an event ID. Existing `get_current_participant` tests (read/close/upload) must stay green unchanged. Run; confirm failure.
- [X] T004 Have `implementer-be` satisfy T002–T003: add `ClothingStatus` and `Ownership` `StrEnum`s to `backend/app/domain/enums.py`; add `PhotoAlreadyAttachedError` to `backend/app/domain/errors.py`; add `photo_url` to `backend/app/domain/photos.py` and use it in `backend/app/services/photo.py` (no behavior change); in `backend/app/api/deps.py`, extract the token → participant lookup (401 on missing/blank/unknown) into `get_token_participant` exposed as `TokenParticipant`, and make `get_current_participant` call it before its event check.
- [X] T005 Review and commit the T002–T004 cycle under Execution Rules.

### `clothes` table, model, and repository

- [X] T006 Have `test-author` extend `backend/tests/test_migrations.py`: after `upgrade head`, table `clothes` exists with columns `id`, `event_id`, `owner_id`, `photo_id`, `description`, `status`, `content_version`, `created_at`, `updated_at`; `photo_id` is unique (inserting two rows with the same `photo_id` raises `IntegrityError`); a `status` outside `available|confirmed|withdrawn` is rejected by the check constraint; index on `(event_id, created_at)` exists; `downgrade` to its recorded `down_revision` (`d04c8b6d5381`) removes the table. Add `backend/tests/services/test_clothing_repository.py` asserting through the `db` fixture: `add` + `get_in_event(s, clothing_id, event_id)` round-trip and `None` for another event's ID; `photo_is_attached(s, photo_id)`; `count_available(s, event_id)` counts only `available` rows in that event. Run; confirm failure.
- [X] T007 Have `implementer-be` satisfy T006: add `Clothing` to `backend/app/models/clothing.py` (`__tablename__ = "clothes"`; `id` String(36) PK; `event_id` FK `events.id` non-null; `owner_id` FK `participants.id` non-null; `photo_id` FK `photos.id` non-null **unique**; `description` String(1000) non-null; `status` String(16) non-null with check `status IN ('available','confirmed','withdrawn')`; `content_version` Integer non-null; `created_at`, `updated_at` `UtcDateTime` non-null; `Index("ix_clothes_event_id_created_at", "event_id", "created_at")`); import and export it in `backend/app/models/__init__.py` (`__all__`); add an Alembic revision under `backend/alembic/versions/` with `down_revision = "d04c8b6d5381"` creating it in `upgrade()` and dropping it in `downgrade()`; add `add`, `get_in_event`, `photo_is_attached`, `count_available` to `backend/app/repositories/clothing.py`.
- [X] T008 Review and commit the T006–T007 cycle under Execution Rules.

**Checkpoint**: Vocabulary and storage exist; no endpoint behavior changed.

## Phase 3: User Stories 1 & 2 - Register a garment; reject invalid registrations (Priority: P1) 🎯 MVP

**Goal**: `POST /api/v1/events/{event_id}/clothing` with every rejection rule, atomicity, logging, and the organizer's `availableClothingCount`.

**Independent Test**: As a joined participant, upload a photo, register it with a valid description, and get an available garment at content version 1; then run the full rejection matrix and confirm no garment is created by any rejected request.

### Tests for User Stories 1 & 2 (write first)

- [X] T009 [P] [US1] Have `test-author` add `backend/tests/api/test_register_clothing.py`: upload a photo via the existing route, then register with `{"photoId", "description": "  Green denim jacket, M  "}` → `201` with exact `Clothing` keys (`id`, `eventId`, `owner{participantId, displayName, isOrganizer}`, `isMine`, `photo{id, url}`, `description`, `status`, `contentVersion`, `analysis`, `createdAt`, `updatedAt`), `status == "available"`, `contentVersion == 1`, `analysis is None`, `isMine is True`, description stored trimmed, `photo.url` equal to the upload response `url`, `owner.isOrganizer` true for the organizer and false for a joined participant, `createdAt == updatedAt`; description boundaries: exactly 1 and exactly 1,000 characters accepted; multi-line description accepted; organizer `GET /api/v1/events/{id}` shows `stats.availableClothingCount` incremented by each registration. Run; confirm 404/405 failure (route missing).
- [X] T010 [P] [US2] Have `test-author` add `backend/tests/api/test_register_clothing_rejections.py` (assert `clothes` row count unchanged after every case via `count_rows`): `422 VALIDATION_ERROR` with `details.fields` for missing `photoId`, missing `description`, empty and space-only description (reason `required`), 1,001 characters (reason `too_long`), unknown field (reason `unknown_field`); malformed JSON → `400`; **422 returned even with no token** (validation before auth); missing/invalid token → `401`; nonexistent event, malformed event ID, and token from another event → identical `404` bodies (ignoring `requestId`); closed event (`close_event` helper) → `409 EVENT_CLOSED`, and closed is reported even when the `photoId` is unknown; unknown `photoId`, malformed `photoId` (e.g. `"not-a-uuid"`), photo from another event, and photo uploaded by another participant of the same event → identical `404` bodies; photo already attached (exact repeat of a successful request, and a different description with the same photo) → `409 PHOTO_ALREADY_ATTACHED`, still one row. Run; confirm failure.
- [X] T011 [P] [US2] Have `test-author` add `backend/tests/services/test_register_clothing.py` against planned `ClothingService(db, settings, clock, clothing_id_generator).register(event_id, participant, body)`: injected clock and ID appear in the result and row; race — monkeypatch `clothing_repo.photo_is_attached` to return `False` after another row with the same `photo_id` was inserted → raises `PhotoAlreadyAttachedError`, exactly one row remains; logging — one `clothing_registered` record with extras exactly `clothing_id`, `event_id`, `description_length` (length of the trimmed text), emitted after commit, and the description text absent from both formatters' output; no `clothing_registered` record on any rejection. Run; confirm failure.
- [X] T012 [P] [US1] Have `test-author` extend `backend/tests/api/test_openapi_contract.py`: operation `registerClothing` at `POST /api/v1/events/{event_id}/clothing` documents `201`, `400`, `401`, `404`, `409`, `422`, `500` with `X-Request-ID` headers and `ErrorResponse` error schemas; request schema has `required` `photoId`, `description`, `additionalProperties: false`, `description` `minLength 1` / `maxLength 1000`; no `HTTPValidationError` in the operation. Run; confirm failure.

### Implementation for User Stories 1 & 2

- [X] T013 [US1] Have `implementer-be` satisfy T009–T012: add `ClothingCreate` (`photo_id: str`; `description: str = Field(min_length=1, max_length=1000)`; no control-character validator, so newlines are allowed), `ClothingOwner`, `ClothingPhoto`, and `Clothing` (`analysis: None = None`) `ApiModel`s to `backend/app/schemas/clothing.py`; add `ClothingService.register` to `backend/app/services/clothing.py` implementing, in one `Db.write()`: event exists (else `NotFoundError`) → active (else `EventClosedError`) → photo exists with `event_id == event.id` and `uploader_id == participant.id` (else `NotFoundError`) → not attached (else `PhotoAlreadyAttachedError`) → insert with `status="available"`, `content_version=1`, `created_at=updated_at=clock()`; map `IntegrityError` on insert to `PhotoAlreadyAttachedError`; log `clothing_registered` after commit; build the response with `photo_url`. Add `POST /{event_id}/clothing` (`status_code=201`, `operation_id="registerClothing"`, `error_responses(400, 401, 404, 409, 422, 500)`) to `backend/app/api/routers/events.py` taking `body: ClothingCreate` and the raw `bearer_scheme` credentials, calling `get_current_participant(event_id, db, credentials)` **inside** the handler (research R2). Replace the `available_clothing_count=0` TODO in `backend/app/services/event.py` with `clothing_repo.count_available(s, event.id)`; keep the confirmed-exchange TODO.
- [X] T014 [US2] Review and commit the T009–T013 cycle under Execution Rules.

**Checkpoint**: Registration is complete and safe; MVP deliverable.

## Phase 4: User Story 3 - Participants browse garments in their event (Priority: P1)

**Goal**: `GET /api/v1/events/{event_id}/clothing` with ownership/status filters and withdrawn visibility.

**Independent Test**: Seed garments from two participants in all three statuses plus one in another event; list with each ownership option and status filter.

### Tests for User Story 3 (write first)

- [X] T015 [P] [US3] Have `test-author` add `backend/tests/api/test_list_clothing.py` (seeded rows per Execution Rules): `ownership=mine` returns all of the caller's garments including `withdrawn`; `ownership=others` returns others' `available`/`confirmed` only; default and `ownership=all` return the union; order `createdAt` descending with ties broken by `id` descending; `status=available`, repeated `status=available&status=confirmed`, and duplicated `status=available&status=available` filter correctly while keeping visibility (others' `withdrawn` never appears even with `status=withdrawn`); another event's garments never appear; empty event → `{"items": [], "nextCursor": null}`; `nextCursor` always `null`; each item has the exact `Clothing` shape with correct `isMine`; list still `200` after `close_event`; unknown `ownership` or `status` → `422 VALIDATION_ERROR` **even with no token**; missing/invalid token → `401`; nonexistent/malformed/foreign event → identical `404`s; end-to-end (SC-001): a garment created through the register route appears immediately in the owner's `ownership=mine` list and in another participant's `ownership=others` list. Run; confirm failure.
- [X] T016 [P] [US3] Have `test-author` extend `backend/tests/api/test_openapi_contract.py`: operation `listClothing` documents `200`, `401`, `404`, `422`, `500`; query `ownership` enum `mine|others|all` default `all`; query `status` is an array of `available|confirmed|withdrawn`. Run; confirm failure.

### Implementation for User Story 3

- [X] T017 [US3] Have `implementer-be` satisfy T015–T016: add `list_visible(s, event_id, viewer_id, ownership, statuses)` to `backend/app/repositories/clothing.py` (one query joined to `participants` and `events`; visibility `owner_id == viewer_id OR status != 'withdrawn'`; optional `status IN (...)`; `ORDER BY created_at DESC, id DESC`); add `ClothingList` (`items: list[Clothing]`, `next_cursor: None = None`) to `backend/app/schemas/clothing.py`; add `ClothingService.list(event_id, participant, ownership, statuses)` using `Db.read()`; add `GET /{event_id}/clothing` (`operation_id="listClothing"`, `error_responses(401, 404, 422, 500)`) to `backend/app/api/routers/events.py` with `ownership: Ownership = Ownership.ALL` and `status: Annotated[list[ClothingStatus] | None, Query()] = None`, calling `get_current_participant` inside the handler.
- [X] T018 [US3] Review and commit the T015–T017 cycle under Execution Rules.

## Phase 5: User Story 4 - Participant views one garment's details (Priority: P2)

**Goal**: `GET /api/v1/clothing/{clothing_id}` returning any garment in the caller's event.

**Independent Test**: Read own, other's, other's withdrawn, other-event, and unknown garments.

### Tests for User Story 4 (write first)

- [X] T019 [P] [US4] Have `test-author` add `backend/tests/api/test_get_clothing.py` (seeded rows): own garment → `200` with `isMine` true; another participant's garment → `200` with `isMine` false; another participant's `withdrawn` garment → `200` with `status == "withdrawn"`; garment in another event, unknown ID, and malformed ID → identical `404` bodies; missing/invalid token → `401`; still `200` after `close_event`. Extend `backend/tests/api/test_openapi_contract.py`: operation `getClothing` documents `200`, `401`, `404`, `500`. Run; confirm failure.

### Implementation for User Story 4

- [X] T020 [US4] Have `implementer-be` satisfy T019: add `ClothingService.get(participant, clothing_id)` (`Db.read()`, `get_in_event(s, clothing_id, participant.event_id)` else `NotFoundError`) to `backend/app/services/clothing.py`; create `backend/app/api/routers/clothing.py` (`prefix="/clothing"`, `tags=["clothing"]`) with `GET /{clothing_id}` (`operation_id="getClothing"`, `error_responses(401, 404, 500)`) using `TokenParticipant`; include the router in `backend/app/main.py` like the photos router.
- [X] T021 [US4] Review and commit the T019–T020 cycle under Execution Rules.

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T022 Run the full backend checks; run the [quickstart](quickstart.md) manual scenarios against a fresh SQLite file (`alembic upgrade head`) and record actual results in `specs/011-register-read-clothing/quickstart.md` "Implementation Evidence". Frontend is unchanged; run `cd frontend && pnpm lint && pnpm typecheck && pnpm test` once to confirm no regression and record results.
- [X] T023 Update `specs/011-register-read-clothing/spec.md` Assumptions only if implementation revealed a deviation, then review and commit documentation changes under Execution Rules.

## Dependencies & Execution Order

- Setup (T001) → vocabulary/helpers (T002–T005) → table/repo (T006–T008) → US1+US2 register (T009–T014) → US3 list (T015–T018) → US4 detail (T019–T021) → Polish (T022–T023).
- US4 depends only on Phase 2 (it seeds rows directly). US3 seeds rows too, except its one end-to-end SC-001 test, which needs the register route, so US3 runs after Phase 3. US3 and US4 both extend `test_openapi_contract.py` and `routers/`, so run their cycles sequentially.

## Parallel Opportunities

- T002 ‖ T003 (disjoint test files).
- T009 ‖ T010 ‖ T011 ‖ T012 (four disjoint test files).
- T015 ‖ T016 (disjoint test files).
- Implementation tasks are sequential (one implementer per workspace).

## Implementation Strategy

1. **Foundation**: Phases 1–2 add vocabulary and storage with no visible behavior change.
2. **MVP**: Phase 3 delivers complete, safe registration in one reviewed commit; US1 cannot ship without US2's rules.
3. **Increments**: Phase 4 (list) and Phase 5 (detail) each ship as an independent reviewed commit.
4. Phase 6 reruns everything and records evidence. In the PR description, note that `analysis` is always `null` until the AI feature, and that per-event limits and "who wants this" (C4) remain open decisions.
