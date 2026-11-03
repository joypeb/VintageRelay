---
description: "Task list for 019 AI search"
---

# Tasks: 019 AI Search

**Input**: Design documents from `/specs/020-ai-search/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/search-api.md, quickstart.md

**Tests**: REQUIRED (TDD) — write failing tests first and confirm the expected failure before implementation. Fake AI only (`FakeAnalyzer` via `app.dependency_overrides[get_analyzer]`); no network.

**Organization**: Backend (US1 ranking → US2/US3 interpretation) before the frontend tasks that call it. Frontend screens are verified manually per `docs/rules/dev/frontend/testing.md`; their pure logic is unit-tested.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Verify baseline: `cd backend && uv run pytest -q` and `cd frontend && pnpm test` green on `feat/019-ai-search-speckit` before any change

---

## Phase 2: Foundational (shared search schemas)

No behavior; pure boilerplate via `scaffolder`.

- [X] T002 Create backend/app/schemas/search.py with `MeasurementRange` (`min`, `max` floats, optional sides for ranked search), `SearchConditions` (`category: ClothingCategory | None`, `colors: list[str]`, `measurements: dict[str, MeasurementRange]` keyed by camelCase `Measurements` names, `unrecognized: list[str]`), `SearchInterpretationRequest` (`text: str`), `SearchResultItem` (`clothing: Clothing`, `match_count: int`, `missing_measurements: bool`), `SearchResults` (`items`, `condition_count: int`, `next_cursor: None = None`) using `ApiModel` camelCase like backend/app/schemas/clothing.py

**Checkpoint**: Backend checks green.

---

## Phase 3: User Story 1 — Ranked results from manual conditions (P1) (MVP)

**Goal**: `GET /api/v1/events/{event_id}/clothing/search` ranks other participants' available garments.

**Independent test**: Seed garments with mixed categories, analyses, and measurements; call the endpoint and assert order, `matchCount`, `missingMeasurements`, `conditionCount`.

### Tests (Red first)

- [X] T003 [P] [US1] Red: ranking unit tests in backend/tests/unit/test_search_ranking.py for pure `rank(candidates: list[tuple[Clothing, ClothingAnalysis | None]], conditions) -> list[tuple[Clothing, int, bool]]` (ORM models; returns garment, matchCount, missingMeasurements) in backend/app/services/search.py: repeated colors count once; category is a hard filter; +1 per requested color only when analysis `status == "done"` and `analysis.content_version == clothing.content_version` (pending, failed, older version, no analysis never match); +1 per range containing the value, inclusive, one side may be open; missing value never matches; `missingMeasurements` true only when measurement conditions exist and the garment has none of the requested measurements; order `matchCount` desc, then not-missing before missing, then input order (newest first); zero-point items kept; no conditions keeps input order; `conditionCount = len(colors) + len(measurements)`
- [X] T004 [P] [US1] Red: API tests in backend/tests/api/test_clothing_search.py: caller's own and non-`available` garments excluded; repeatable `color` and `chestMin`/`chestMax`/`totalLengthMax` parsing; `?color=green&color=green` counts once in `matchCount` and `conditionCount`; response shape `{items:[{clothing, matchCount, missingMeasurements}], conditionCount, nextCursor: null}` with `clothing` equal to the Home list object; 422 `VALIDATION_ERROR` for unknown `category`, unknown `color`, non-numeric value, value outside `(0, 120]`, `min > max` (`details.fields[].field` = parameter name); 401 without token; 404 for a token of another event; works after `close_event`

### Implementation

- [X] T005 [US1] Add `analyses_for(s, clothing_ids) -> dict[str, ClothingAnalysis]` to backend/app/repositories/clothing_analysis.py (one batched query, like `photo_repo.photos_for`)
- [X] T006 [US1] Implement pure `rank` and `SearchService.search` in backend/app/services/search.py: candidates from `clothing_repo.list_visible(s, event_id, viewer_id, Ownership.OTHERS, [ClothingStatus.AVAILABLE])` (tuples `(Clothing, display_name, organizer_id)`), analyses via `analyses_for`, colors deduplicated before scoring; build each `items[].clothing` exactly like `ClothingService.list` in backend/app/services/clothing.py does (reuse the `ClothingService._build_response` method and the module function `_to_analysis_schema` with batched `photo_repo.photos_for`; extract a shared helper only if needed to avoid N+1 analysis lookups) (Green for T003)
- [X] T007 [US1] Add `GET /events/{event_id}/clothing/search` to backend/app/api/routers/events.py with `CurrentParticipant` (no closed-event guard) and a query dependency: `category: ClothingCategory | None`, `color: list[str]` validated against `COLOR_VOCABULARY`, `<name>Min`/`<name>Max` read from `request.query_params` for camelCase `Measurements` field names, numbers in `(0, 120]`, `min <= max`, unknown keys ignored; errors in the standard `VALIDATION_ERROR` shape (Green for T004)

**Checkpoint**: `cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`

---

## Phase 4: User Story 2 + 3 — Interpretation and AI failure (P1/P2, backend)

**Goal**: `POST /api/v1/events/{event_id}/search/interpretation` returns validated `SearchConditions`; failures return `503 AI_UNAVAILABLE`.

**Independent test**: Fake returns fixed raw output → validated conditions; fake raising → 503 and a `WARNING ai_call_failed` log without the text.

### Tests (Red first)

- [X] T008 [P] [US2] Red: validation unit tests in backend/tests/unit/test_search_conditions.py for pure `to_search_conditions(raw: SearchInterpretation)` in backend/app/services/search.py: unknown category → `null` and raw word to `unrecognized`; colors outside the 14-color vocabulary dropped and raw value appended to `unrecognized`, duplicates removed; measurement names outside camelCase `Measurements` fields dropped and raw name to `unrecognized`; ranges with `min > max` or outside `(0, 120]` dropped; `min == max` widened to `max(value − 1, 0.1)`..`min(value + 1, 120)` (test values 0.5, 1, 21, 120); empty strings dropped
- [X] T009 [P] [US2] Red: AI unit tests in backend/tests/unit/test_ai_search_interpretation.py: `SearchInterpretation` strict schema (`category: str | null`, `colors: list[str]`, `measurements: list[{name, min, max}]`, `unrecognized: list[str]`, extra keys rejected); `FakeAnalyzer.interpret_search` scripted result and error injection; `HttpxChatCompletionsClient.interpret_search` with an `httpx.MockTransport`: sends text-only user message with the search text wrapped as quoted data, `json_schema` response format, timeout taken from `Settings.ai_search_timeout_seconds` (default 10.0), retries once on 5xx/429/timeout/invalid JSON then raises `AIUnavailableError`; `caplog` shows one INFO record per call with task `search_interpretation`, model ID, outcome, latency_ms, retry count, text length, and token counts when the response has `usage`, and never the search text or raw model output
- [X] T010 [P] [US2] Red: API tests in backend/tests/api/test_search_interpretation.py: 200 with validated conditions; 422 `VALIDATION_ERROR` (`field: "text"`) for missing, whitespace-only, and 201-char text with the fake never called; trimmed 200-char text accepted; works after `close_event`; 401/404 auth; [US3] fake raising `AIUnavailableError` → 503 `AI_UNAVAILABLE` with message "Search could not understand that right now. Choose filters instead."; injected missing-key analyzer (`_MissingKeyAnalyzer`, test app only; production startup still rejects a missing key) → 503; `caplog` has `ai_call_failed` at WARNING with `task="search_interpretation"`, `reason`, `latency_ms` and never contains the search text

### Implementation

- [X] T011 [US2] Add `SearchInterpretation` to backend/app/ai/schemas.py; add `interpret_search(text) -> SearchInterpretation` to the `ClothingAnalyzer` protocol (backend/app/ai/protocols.py), `HttpxChatCompletionsClient` (backend/app/ai/client.py; configurable `ai_search_timeout_seconds: float = 10.0` in backend/app/core/config.py `Settings` next to `ai_analysis_timeout_seconds` (`httpx.Timeout(<value>, connect=5.0)`), same retry and semaphore, prompt per AI features §4 "Model prompt requirements", metadata logging per T009), `FakeAnalyzer` (backend/app/ai/fake.py), and `_MissingKeyAnalyzer` (backend/app/ai/deps.py, raises `AINotConfiguredError`) (Green for T009)
- [X] T012 [US2] Implement `to_search_conditions` and `SearchService.interpret` in backend/app/services/search.py (call outside DB transactions; no caching and nothing persisted (FR-005); on `AIUnavailableError` log WARNING `ai_call_failed` with `task`, `reason`, `latency_ms` and raise the app error) (Green for T008)
- [X] T013 [US3] Add the 503 `AI_UNAVAILABLE` app error to backend/app/domain/errors.py and its 503 description to backend/app/api/errors.py; add `POST /events/{event_id}/search/interpretation` to backend/app/api/routers/events.py with `CurrentParticipant`, text 1–200 chars after trimming, no closed-event guard (Green for T010)

**Checkpoint**: Backend checks green.

---

## Phase 5: Frontend — S1 and S2 (US1–US4)

Pure logic tested (Vitest); screens verified manually at 360–430 px.

### Tests (Red first)

- [X] T014 [P] [US2] Red: frontend/src/lib/search/conditions.test.ts for frontend/src/lib/search/conditions.ts: `validateQuery` (trimmed 1–200 chars, else no request); `parseSearchParams` / `toSearchParams` round trip for `q`, `category`, repeated `color`, `<name>Min`/`<name>Max`, repeated `unrecognized`; invalid URL values ignored; duplicate colors collapse to one; `removeCondition` for category, a color, a measurement; `conditionCount`; `validateFilters` rejects `min > max` and values outside `(0, 120]`; changing category drops ranges not in `measurementFieldsFor(category)`

### Implementation

- [X] T015 [US2] Add types in frontend/src/types/search.ts (`SearchConditions`, `MeasurementRange`, `SearchResults`, `SearchResultItem` reusing `Clothing` from frontend/src/types/clothing.ts) and implement frontend/src/lib/search/conditions.ts (Green for T014)
- [X] T016 [US1] Red first (test-author): frontend/src/lib/validation/search-response.test.ts for `parseSearchConditions` and `parseSearchResults` (zod, same style as frontend/src/lib/validation/clothing-response.ts: reuse its Clothing item schema; invalid body → `ApiError(200, 'UNKNOWN_ERROR', ...)`) and frontend/src/lib/api/search.test.ts (same style as frontend/src/lib/api/clothing.test.ts: encoded event ID, POST body `{ text }`, GET query string from `toSearchParams`, parsed results). Then Green (implementer-fe): add `clothingSearch(eventId, params)` to `queryKeys` and `interpretSearch(eventId)` to `mutationKeys` in frontend/src/lib/api/query-keys.ts; add frontend/src/lib/api/search.ts with `useInterpretSearch(eventId)` (POST) and `useClothingSearch(eventId, conditions)` using `apiFetch` and the patterns in frontend/src/lib/api/
- [ ] T017 [US1] Export `ClothingCard` from frontend/src/components/clothing/HomeClothingGrid.tsx with an optional label slot (Home unchanged)
- [ ] T018 [US2] Implement frontend/src/components/search/SearchScreen.tsx and wire frontend/src/app/events/[eventId]/(tabs)/search/page.tsx (delete SearchPlaceholderScreen): text input → interpretation → `router.replace` with conditions; chips with Astryx `Token` `onRemove`; "Not understood" note; ranked grid with "N/M match" and "No measurements" labels; card → B3; URL with conditions runs only ranked search (no AI); empty and loading states
- [ ] T019 [US3] In SearchScreen, on `AI_UNAVAILABLE` show "Search could not understand that right now. Choose filters instead." with [Choose filters] opening S2
- [ ] T020 [US4] Implement frontend/src/components/search/SearchFiltersSheet.tsx with Astryx `BottomSheet`: category (Top/Outer/Bottom/Other), fixed color list, measurement ranges from `measurementFieldsFor(category)` (all fields when no category), prefilled from current conditions, `validateFilters` messages, [Apply] rewrites the URL; [Edit filters] in S1 opens it
- [ ] T021 Run `/impeccable critique` on S1/S2 within Astryx rules and fix findings

**Checkpoint**: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`

---

## Phase 6: Polish

- [ ] T022 [P] Update docs/plans/api/15-search.md (`items[].clothing` is the Home `Clothing` object; unknown query keys ignored) and docs/plans/ai-features-v1.md §4 if the implementation deviates; mark 019 done in docs/plans/features/README.md
- [ ] T023 Run full checks: backend `uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`; frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- [ ] T024 Manual quickstart scenario (specs/020-ai-search/quickstart.md) at 360–430 px

---

## Dependencies

- T002 → all. US1 backend (T003–T007) → US2/US3 backend (T008–T013) (shared `services/search.py` and router).
- Frontend T014–T020 after T007 and T013. T016 → T018–T020. T017 → T018.
- Polish after all stories.

## Implement Cycles (one green commit each)

1. T002 (scaffolder)
2. Red T003+T004 → Green T005–T007
3. Red T009 → Green T011
4. Red T008+T010 → Green T012–T013
5. Red T014 → Green T015
6. Red T016 tests → Green T016
7. T017–T021 (implementer-fe, manual verification), one commit per task or small group
8. T022–T024

Never commit a Red state; Red tests of a cycle stay uncommitted until its Green tasks pass.

## Parallel Opportunities

- Red tests within a cycle: T003 ∥ T004; T008 ∥ T010.
- Backend and frontend run in separate Paseo workspaces only after the backend contract is merged into the branch; otherwise sequential (one implementer per workspace).

## Implementation Strategy

1. MVP: Phase 3 (ranked search) — usable as the manual-filter fallback.
2. Add interpretation (Phase 4), then the screens (Phase 5).
3. Each cycle: `test-author` (Red) → `implementer-be`/`implementer-fe` (Green → Refactor) → `commit-reviewer` → commit. T002 via `scaffolder` (boilerplate). T016 follows Red → Green (response parsers and fetchers). T017–T021 are UI-only screens (manual verification) and go to `implementer-fe` without `test-author`.
