# Implementation Plan: 019 AI Search

**Branch**: `feat/019-ai-search-speckit` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/020-ai-search/spec.md`

## Summary

Two backend endpoints and the S1/S2 screens. Interpretation reuses the 018 AI client with a new text-only `interpret_search` call; pure validation turns model output into `SearchConditions`; failures map to `503 AI_UNAVAILABLE`. Ranked search loads the Home candidate set plus batched analyses and ranks in pure Python. The frontend keeps the query and conditions in the URL, renders chips with Astryx `Token`, the filters sheet with Astryx `BottomSheet`, and results with the existing Home `ClothingCard`. Details: [research.md](research.md).

## Technical Context

**Language/Version**: Python 3.14 (backend), TypeScript / Next.js App Router (frontend)

**Primary Dependencies**: FastAPI, SQLAlchemy, Pydantic, httpx (existing); React, TanStack Query, Astryx (existing). No new dependencies.

**Storage**: SQLite via SQLAlchemy; no schema changes.

**Testing**: pytest with fresh SQLite per test and `FakeAnalyzer` via `dependency_overrides[get_analyzer]`; Vitest + Testing Library for pure frontend logic.

**Target Platform**: Mobile web (360–430 px), Linux container backend.

**Project Type**: Web application (backend + frontend).

**Performance Goals**: Interpretation bounded by a 20 s timeout + 1 retry (client waits up to 50 s); ranked search in-memory over one event's garments.

**Constraints**: AI sees only the search text; ranking is regular code; never log search text; closed events allowed.

**Scale/Scope**: Neighborhood events (tens to low hundreds of garments); no pagination.

## Constitution Check

| Principle | Status |
|---|---|
| I. Exchange integrity | Pass — read-only feature; AI only interprets text, never ranks or touches intents |
| II. Test-first | Pass — tasks pair each test task before its implementation |
| III. Test scope by risk | Pass — ranking/validation unit + API tests; frontend pure helpers tested, screens manual |
| IV. Isolated tests | Pass — `FakeAnalyzer`, SQLite in `tmp_path` |
| V. Simplicity | Pass — reuses AI client, `list_visible`, `Clothing` schema, `ClothingCard`; Python ranking; URL as state |

Post-design re-check: Pass. No complexity tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/020-ai-search/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/search-api.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
backend/app/
├── ai/protocols.py, client.py, fake.py, deps.py, schemas.py   # + interpret_search, SearchInterpretation
├── domain/errors.py                                           # + AI_UNAVAILABLE (503)
├── api/errors.py                                              # + 503 description
├── api/routers/events.py                                      # + 2 routes, query dependency
├── repositories/clothing_analysis.py                          # + analyses_for
├── schemas/search.py                                          # new: request/conditions/results
└── services/search.py                                         # new: to_search_conditions, rank, SearchService
backend/tests/
├── unit/ (search conditions, ranking)
└── api/ (interpretation, ranked search)

frontend/src/
├── lib/search/conditions.ts (+ .test.ts)                      # URL <-> conditions, chips, S2 validation
├── lib/api/search.ts                                          # useInterpretSearch, useClothingSearch
├── components/clothing/HomeClothingGrid.tsx                   # export ClothingCard + label slot
├── components/search/SearchScreen.tsx, SearchFiltersSheet.tsx # replace SearchPlaceholderScreen
└── app/events/[eventId]/(tabs)/search/page.tsx

docs/plans/api/15-search.md, docs/plans/ai-features-v1.md (§4 if deviated), docs/plans/features/README.md  # keep plans true
```

**Structure Decision**: Existing `backend/` + `frontend/` layout; new code goes into the existing layers (router → service → repository) and `lib/` + `components/` folders. Backend tasks precede the frontend tasks that call them.

## Complexity Tracking

None.
