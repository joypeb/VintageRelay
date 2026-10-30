# Tasks: Clothing Category, Title, and Measurements

**Input**: Design documents from `specs/013-clothing-category-measure/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contract delta](contracts/clothing-category-measure.md), [quickstart.md](quickstart.md), and `.specify/memory/constitution.md`.

**Tests**: Required. Every production behavior change follows test-author Red → implementer-be Green → Refactor. Every test is written and confirmed failing before the implementation task that introduces its behavior. Never delete or skip failing tests; genuinely unimplemented cases use `xfail(reason=...)`.

**Organization**: Category, title, and measurements land together because they share one request schema, one migration, and one response mapping. US1+US2+US3 (register with new fields and reject invalid ones) form one cycle: shipping registration without its rejection rules would violate Constitution I. US4 (reads) follows as an independent cycle reading seeded rows. Photo handling from 012 is not touched by any task.

**Blocking prerequisite**: 012-backend merged. Every task below assumes the post-012 schema (`photos.clothing_id`/`position`, `photoIds[1..10]`, `photos[]` responses, no `clothes.photo_id`). If 012-backend is not merged, stop after T001.

## Format: `[ID] [P?] [Story] Description`

- Paths are relative to the repository root. `[P]` marks test-author work on disjoint files that may run together; it never permits parallel production implementers in one workspace.
- Do not add category list filtering, a `clothing_measurements` table or JSON column, a `ClothingSummary` schema, pagination changes, per-event limits, or frontend changes.

## Execution Rules

The orchestrator writes Spec Kit artifacts only. Before each delegation, call Paseo `list_profiles`, read notes, and pass the selected profile's provider/model/modeId/thinkingOptionId/featureValues to `create_agent`. Required profiles: `test-author`, `implementer-be`, `commit-reviewer`; a missing profile stops that cycle. Use this feature's workspace, one implementer at a time; delegates must not delegate.

Each prompt includes the task IDs/text, allowed paths, this feature's artifacts, `AGENTS.md`, `docs/rules/dev/common/api-contract.md`, `docs/rules/dev/common/testing.md`, `docs/rules/dev/backend/` (all), and `docs/plans/api/06-register-read-clothing.md`. Test authors may edit `backend/tests/**` only; implementers may edit only the named paths under `backend/app/**` and `backend/alembic/**`. Reviewers are read-only. No dependency changes.

Each **review** task closes its cycle: run focused tests and the full backend checks, have the orchestrator rerun them, then obtain a fresh `commit-reviewer` OCR delegate review (`ocr delegate preview --format json`, `ocr delegate rule --format json <paths>`) of the exact commit content in the same workspace, with English findings (severity, file/line, trigger/impact, fix) and coverage. Resolve Critical/High findings, rerun checks, obtain re-review, then commit the green cycle. Never commit Red alone; do not create empty commits. PR work needs a separate `pr-reviewer` and is not authorized by this list.

**Log assertions**: filter `caplog.records` to application loggers (`record.name.startswith("app.")`); format filtered records with both `JsonFormatter` and `TextFormatter` from `backend/app/core/logging.py` when checking for raw values.

**Seeding**: list/detail tests insert `Clothing` rows directly through the `db` fixture (plus `add_participant` and photo rows with `clothing_id` NULL per the 012 shape from `backend/tests/conftest.py`), with explicit `title`, `category`, and measurement columns, so they do not depend on the register route.

Full backend checks:

```bash
cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

## Phase 1: Setup

- [X] T001 Verify branch `specs/013-clothing-category-measure` and `.specify/feature.json` pointing to `specs/013-clothing-category-measure`; verify 012-backend is merged and the worktree is rebased onto it (`clothes.photo_id` gone, `photos.clothing_id` present — confirmed on `origin/main` `5586cd7`, rebased); 013 migration `down_revision` is `c9f3e2a4b1d7`; run the full backend checks and record the baseline in `specs/013-clothing-category-measure/quickstart.md` under "Implementation Evidence" (ruff 97 formatted, ruff check pass, mypy 41 files pass, pytest 356 passed). Gate passed — proceeding.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `ClothingCategory` enum and the `clothes` columns, before any route behavior changes.

- [X] T002 [P] Have `test-author` extend `backend/tests/unit/test_clothing_enums.py` with `ClothingCategory` values exactly `top`, `outer`, `bottom`, `other` in `backend/app/domain/enums.py`. Run; confirm failure from the missing name. (Red confirmed, Green via T004.)
- [X] T003 [P] Have `test-author` extend `backend/tests/test_migrations.py`: after `upgrade head`, table `clothes` has columns `title` (String(100), non-null), `category` (String(16), non-null), `measure_total_length`, `measure_chest`, `measure_shoulder`, `measure_sleeve`, `measure_waist`, `measure_hem`, `measure_inseam`, `measure_thigh` (all nullable); a `category` outside `top|outer|bottom|other` is rejected by the check constraint; `downgrade` to 012's backend revision `c9f3e2a4b1d7` (attach_photos_to_clothes) removes the added columns. Run; confirm failure.
- [X] T004 Have `implementer-be` satisfy T002–T003: add `ClothingCategory` `StrEnum` to `backend/app/domain/enums.py`; add the ten columns plus `CheckConstraint("category IN ('top','outer','bottom','other')")` to `Clothing` in `backend/app/models/clothing.py`; add an Alembic revision under `backend/alembic/versions/` with `down_revision = "c9f3e2a4b1d7"` creating them in `upgrade()` and dropping them in `downgrade()`.
- [X] T005 Review and commit the T002–T004 cycle under Execution Rules. (Reviewed twice; committed as `7bde920`. M1 tracked as T018, non-blocking.)

**Checkpoint**: Vocabulary and storage exist; no endpoint behavior changed.

## Phase 3: User Stories 1, 2, 3 - Register with category/title/measurements; reject invalid input (Priority: P1) 🎯 MVP

**Goal**: `POST /api/v1/events/{event_id}/clothing` accepts `category`, trimmed `title`, and optional category-grouped `measurements`, rejects every invalid combination with `422` and no garment, and logs `title_length` + `category` without text.

**Independent Test**: As a joined participant, register with all new fields and get them back verbatim; register without measurements and get `measurements: null`; then run the full rejection matrix and confirm no garment is created by any rejected request.

### Tests for User Stories 1, 2, 3 (write first)

- [X] T006 [P] [US1] Have `test-author` extend `backend/tests/api/test_register_clothing.py` (shared with US2): upload photos via the existing route first (011 pattern), then update the existing cases to the new required schema (`photoIds`, `category`, `title`) and add: register with `{"photoIds": [...], "category": "top", "title": "  Green denim jacket  ", "description": "Cropped, M", "measurements": {"chest": 21.0, "sleeve": 24.5}}` → `201` with exact extended `Clothing` keys (adds `category`, `title`, `measurements`), title stored trimmed, unentered dimensions `null`; register with category `outer` and `{"totalLength": 28.0, "shoulder": 18.5}` → `201` (tops group shared); register with category `bottom` and no `measurements` → `201` with `measurements is None`; register with `"measurements": {}` → `201` with `measurements is None`. Run; confirm failure.
- [X] T007 [P] [US3] Have `test-author` extend `backend/tests/api/test_register_clothing_rejections.py` (assert `clothes` row count unchanged after every case via `count_rows`; update the existing cases to the new required schema first): `422 VALIDATION_ERROR` with `details.fields` for missing `category`, missing `title`, unknown category (reason `invalid`), whitespace-only title and 101-char title (reasons `required`/`too_long`), title with control characters (reason `invalid_characters`), a top-level unknown field (reason `unknown_field`), `sleeve` on `bottom` and `waist` on `top` (reason `invalid` on `measurements.<name>`), any measurements on `other` (reason `invalid` on `measurements`), `0`/negative/`> 120`/non-numeric values, unknown key inside `measurements` (reason `unknown_field`); one 422 case also without a token (validation before auth). Run; confirm failure.
- [X] T008 [P] [US1] Have `test-author` extend `backend/tests/services/test_register_clothing.py`: successful registration emits one `clothing_registered` record with extras exactly `clothing_id`, `event_id`, `description_length`, `title_length`, `category`; title and description text absent from both formatters' output. Run; confirm failure.
- [X] T009 [P] [US1] Have `test-author` extend `backend/tests/api/test_openapi_contract.py`: operation `registerClothing` request schema has required `title`, `category` (enum `top|outer|bottom|other`), optional `measurements` object with the 8 named numeric fields and `additionalProperties: false`; response schema requires `category`, `title`, `measurements`. Run; confirm failure.

### Implementation for User Stories 1, 2, 3

- [X] T010 [US1] Have `implementer-be` satisfy T006–T009: add `Measurements` (`total_length`, `chest`, `shoulder`, `sleeve`, `waist`, `hem`, `inseam`, `thigh`: each `float | None = None`, `gt=0`, `le=120`; `{}` normalized to `None`) and extend `ClothingCreate` (`title: str = Field(min_length=1, max_length=100)` with `reject_control_characters`, `category: ClothingCategory`, `measurements: Measurements | None = None`) plus a validator enforcing the tops/bottoms/`other` key groups (emitting dotted field paths like `measurements.sleeve` so the contract's `details.fields` shape holds), in `backend/app/schemas/clothing.py`; extend `Clothing` with `category`, `title`, `measurements`; store the new columns in `ClothingService.register` in `backend/app/services/clothing.py` and map them in `_build_response` (measurements object with nulls, or `None`); add `title_length` and `category` to the `clothing_registered` log extras. Photo/event/closure logic unchanged.
- [X] T010b Have `implementer-be` fix the dotted-field conversion in `backend/app/api/errors.py` (apply `to_camel` per dot-separated segment so `measurements.sleeve` stays lowercase while top-level `photo_ids` → `photoIds` is unchanged); the only remaining full-suite failures must be the Phase-4 seed scope.
- [X] T011 [US1] Review and commit the T006–T010 cycle under Execution Rules. (Reviewed; Low findings #1/#4/#5 fixed with re-review; committed as `db91c58`.)

**Checkpoint**: Registration with new fields is complete and safe; MVP deliverable.

## Phase 4: User Story 4 - Browse and open garments with new fields (Priority: P2)

**Goal**: List and detail responses include `category`, `title`, and `measurements` for every garment.

**Independent Test**: Seed garments in several categories with and without measurements; list and detail show the new fields with null-vs-absent semantics intact.

### Tests for User Story 4 (write first)

- [X] T012 [P] [US4] Have `test-author` extend `backend/tests/api/test_list_clothing.py` (seeded rows per Execution Rules with explicit `title`, `category`, and measurement columns — update the existing seeds to the new non-null columns first — including one row with all-NULL measures): each item carries the exact `category`, trimmed `title`, and `measurements` (entered values round-trip, unentered are `null`, all-NULL row returns `measurements: null`). Run; confirm failure.
- [X] T013 [P] [US4] Have `test-author` extend `backend/tests/api/test_get_clothing.py` (seeded rows; update the existing seeds to the new non-null columns first): detail returns `category`, `title`, and `measurements` with the same semantics. Run; confirm failure.

### Implementation for User Story 4

- [X] T014 [US4] Read path verified by T012/T013 Green: both test-authors confirmed the shared `_build_response` already returns the new fields, so no service change was needed. No production code touched.
- [X] T014b [US4] Have `test-author` update the `Clothing(...)` seeds in `backend/tests/services/test_clothing_repository.py` to the new non-null schema (explicit `title`/`category`; measures may stay NULL) and confirm the file is Green. Production code untouched.
- [X] T015 [US4] Review and commit the T012–T014 cycle under Execution Rules. (Reviewed; no findings; committed as `eab8595`.)

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T016 Run the full backend checks; run the [quickstart](quickstart.md) manual scenarios against a fresh SQLite file (`alembic upgrade head` past 012) and record actual results in `specs/013-clothing-category-measure/quickstart.md` "Implementation Evidence". Frontend is unchanged; run `cd frontend && pnpm lint && pnpm typecheck && pnpm test` once to confirm no regression and record results. (Backend 404 passed; frontend lint 0 errors/13 pre-existing warnings, typecheck pass, 434 tests passed; manual 15/15 + clean logs.)
- [X] T017 Update `specs/013-clothing-category-measure/spec.md` Assumptions only if implementation revealed a deviation, then review and commit documentation changes under Execution Rules. (Reviewed; no Critical/High. Fixed review Low: FR-002 + edge case now state control-character rejection. Committed with T018 test.)
- [X] T018 [P] Have `test-author` address M1 from the T005 review: extend `backend/tests/test_migrations.py` with a backfill value assertion — upgrade to `c9f3e2a4b1d7`, insert a legacy `clothes` row without `title`/`category`, upgrade to head, then assert `title == description` and `category == 'other'`. Confirm Green (migration code itself is unchanged; covered by T017 review). (Green, 404-suite.)

## Dependencies & Execution Order

- Setup (T001) → vocabulary/storage (T002–T005) → US1+US2+US3 register (T006–T011) → US4 reads (T012–T015) → Polish (T016–T017).
- US4 seeds rows directly through the `db` fixture, so it depends only on Phase 2, but it runs after Phase 3 so one review cycle covers the shared `_build_response` mapping.
- T014 is expected to confirm T010's mapping; if list/detail tests fail for a read-path reason, fix it there, never by weakening the tests.

## Parallel Opportunities

- T002 ‖ T003 (disjoint test files).
- T006 ‖ T007 ‖ T008 ‖ T009 (four disjoint test files).
- T012 ‖ T013 (disjoint test files).
- Implementation tasks are sequential (one implementer per workspace).

## Implementation Strategy

1. **Foundation**: Phases 1–2 add vocabulary and storage with no visible behavior change. T001 gates everything on the 012-backend merge.
2. **MVP**: Phase 3 delivers complete, safe registration with the new fields in one reviewed commit; US1/US2 cannot ship without US3's rules.
3. **Increment**: Phase 4 (reads) ships as an independent reviewed commit.
4. **Polish**: Phase 5 reruns everything and records evidence. Note in the PR that `analysis` stays `null`, `photos[]` handling is 012's, and title/measurements never appear in logs.
