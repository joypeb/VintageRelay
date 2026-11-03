# Research: 019 AI Search

Codebase research delegated to the Paseo `explorer` profile (2026-11-03). Findings condensed into decisions.

## R1. Reuse the 018 AI client for text-only interpretation

- **Decision**: Add `interpret_search(text: str) -> SearchInterpretation` to the existing `ClothingAnalyzer` protocol (`backend/app/ai/protocols.py`), `HttpxChatCompletionsClient` (`backend/app/ai/client.py`), `FakeAnalyzer` (`backend/app/ai/fake.py`), and `_MissingKeyAnalyzer` (`backend/app/ai/deps.py`, raises `AINotConfiguredError`). Same Chat Completions call with `response_format` `json_schema` (strict), text-only user message wrapping the search text as quoted data, a configurable timeout `Settings.ai_search_timeout_seconds` (default 10 s, connect 5 s), 1 retry on timeout/connect/429/5xx/invalid output, and the shared semaphore. Injected through the existing `get_analyzer` dependency so tests override it the same way.
- **Rationale**: One client, one fake, one override point; no new dependency.
- **Alternatives**: A separate `SearchInterpreter` protocol and dependency — more wiring for one method.

## R2. Raw model output vs. API `SearchConditions`

- **Decision**: The model returns `SearchInterpretation` (strict schema in `backend/app/ai/schemas.py`): `category: str | null`, `colors: list[str]`, `measurements: list[{name: str, min: number, max: number}]`, `unrecognized: list[str]`. Measurements are a list because strict JSON schema cannot express an open map. A pure function `to_search_conditions(raw)` builds the API `SearchConditions`: unknown category → `null` and the word to `unrecognized`; unknown colors and measurement names → dropped and the raw value appended to `unrecognized`; ranges with `min > max` or outside `(0, 120]` dropped; `min == max` widened to `max(value − 1, 0.1)`..`min(value + 1, 120)`; empty strings dropped.
- **Rationale**: Keeps the model schema simple and puts every guardrail in testable regular code (AI features §4 step 3, §5).
- **Alternatives**: Let the model return the final map — loses validation control.

## R3. `AI_UNAVAILABLE` error

- **Decision**: Add `AIUnavailableAppError` (503, `AI_UNAVAILABLE`, message "Search could not understand that right now. Choose filters instead.") to `backend/app/domain/errors.py` and its 503 description in `backend/app/api/errors.py`. The search service catches `AIUnavailableError` (including `AINotConfiguredError`) and raises it, logging `WARNING ai_call_failed` with `task=search_interpretation`, `reason`, `latency_ms` (pattern from `backend/app/services/clothing_analysis.py`). Text length only, never the text.
- **Rationale**: Contract code already exists in `api-contract.md` and frontend `error-codes.ts`; backend lacked the mapping (would otherwise become 500).

## R4. Candidate set and ranking location

- **Decision**: Rank in Python. Candidates from `clothing_repo.list_visible(s, event_id, viewer_id, Ownership.OTHERS, [ClothingStatus.AVAILABLE])` (already newest first). Add `analyses_for(s, clothing_ids) -> dict[str, ClothingAnalysis]` to `backend/app/repositories/clothing_analysis.py` (batched like `photo_repo.photos_for`). A pure `rank(candidates: list[tuple[Clothing, ClothingAnalysis | None]], conditions)` in `backend/app/services/search.py` (colors deduplicated first) computes points and a stable sort by `(-matchCount, missingMeasurements)` so `createdAt desc` from the query is kept for ties.
- **Rationale**: Event sizes are small; pure Python is trivial to unit-test for every ranking rule. No SQL scoring.
- **Color freshness**: a color matches only when `analysis.status == "done"` and `analysis.content_version == clothing.content_version`. 018 keeps one row per garment (`replace_pending` deletes the old one), so "stale" is never persisted; the version check covers it.

## R5. Response item shape

- **Decision**: `items[].clothing` is the same `Clothing` object Home returns (`GET /events/{id}/clothing`), built the same way `ClothingService.list` builds them (`ClothingService._build_response` instance method, batched photos and analyses) in `backend/app/services/clothing.py`. Update `docs/plans/api/15-search.md` to say so in the same PR.
- **Rationale**: Home and the frontend `ClothingCard` already use `Clothing` (`photos[0].url`); API 06's `ClothingSummary` (`photoUrl`) is not implemented anywhere. Reusing avoids a second schema and a second card.
- **Alternatives**: New `ClothingSummary` schema — extra code and a card fork for no user value.

## R6. Query parameter parsing

- **Decision**: A FastAPI dependency reads `category` and repeatable `color` with `Query()`, and builds the ranges from `request.query_params` keys `<name>Min`/`<name>Max` where `<name>` is a camelCase `Measurements` field (`totalLength`, `chest`, `shoulder`, `sleeve`, `waist`, `hem`, `inseam`, `thigh`). Values validated as numbers in `(0, 120]` and `min <= max`; failures raise the standard `VALIDATION_ERROR` with `details.fields[].field` naming the parameter. Unknown query keys are ignored (HTTP convention).
- **Rationale**: Names come from the one `Measurements` source; no 16 hand-written parameters.

## R7. Closed events and auth

- **Decision**: Both routes use `CurrentParticipant` (`backend/app/api/deps.py`; 401 / 404 for another event) and do not call the closed-event guard.

## R8. Frontend structure

- **Decision**:
  - `frontend/src/lib/search/conditions.ts` (pure; types live in `frontend/src/types/search.ts`): `parseSearchParams(URLSearchParams)`, `toSearchParams(q, conditions)`, `removeCondition`, `conditionCount`, and range validation for S2. Unit-tested with Vitest.
  - `frontend/src/lib/api/search.ts`: `useInterpretSearch` (mutation, POST) and `useClothingSearch(eventId, params)` (query keyed by the condition params) via `apiFetch` and TanStack Query, with zod response parsers in `frontend/src/lib/validation/search-response.ts`, like existing `lib/api` modules.
  - `frontend/src/components/search/SearchScreen.tsx` replaces `SearchPlaceholderScreen`; `SearchFiltersSheet.tsx` uses Astryx `BottomSheet`; chips use Astryx `Token` with `onRemove`. Results reuse `ClothingCard`, exported from `HomeClothingGrid.tsx` with an optional label slot for "N/M match" and "No measurements".
  - URL is the single source of state: `?q=&category=&color=&<name>Min=&<name>Max=&unrecognized=`. Submitting text calls interpretation, then `router.replace` with the conditions; loading a URL with conditions runs only ranked search (no AI). Chip removal and S2 Apply rewrite the URL.
  - S2 measurement fields come from `measurementFieldsFor(category)` (`frontend/src/lib/validation/clothing-form.ts`); with no category, the union of all fields is shown.
- **Rationale**: URL state satisfies FR-017 with no extra store; pure helpers carry the non-trivial logic and get tests; screens are verified manually per testing rules.
