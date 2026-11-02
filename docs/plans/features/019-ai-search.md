# 019 — AI Search

**Area:** Backend + Frontend · **Depends on:** [016](016-home-and-item-detail.md), [018](018-ai-clothing-analysis.md) · **Next:** [020](020-exchange-requests.md) · Common steps: [README](README.md#3-spec-kit-run-same-for-every-feature)

## 1. Feature

Participants search in plain words ("green jacket, chest around 21 inches"). The AI only turns the text into conditions (category, colors, measurement ranges); regular code ranks other participants' available garments so the best matches come first. If the AI fails, the participant picks the same conditions manually.

## 2. Scope

**Backend**
- `POST /api/v1/events/{event_id}/search/interpretation` per [AI features §4](../ai-features-v1.md#4-search-interpretation): text 1–200 chars → `SearchConditions` (`category`, `colors`, `measurements` ranges, `unrecognized`); server-side validation (vocabularies, ranges, single value widened to ±1 inch); `503 AI_UNAVAILABLE` on failure. Reuses the 018 AI client.
- `GET /api/v1/events/{event_id}/clothing/search` per [API 15](../api/15-search.md): category hard filter, +1 per matched color (only from a `done` analysis of the current version) and per matched measurement range, ties put garments with requested measurements first, then newest; `matchCount`, `missingMeasurements`, `conditionCount`.
- Both allowed after the event closes (reading only).

**Frontend**
- S1 Search tab (replaces the 015 placeholder): text input → interpretation → removable chips and a "Not understood" note → ranked results in the Home grid card style with "2/3 match" and "No measurements" labels; card → B3.
- S2 Filters bottom sheet: category, colors (fixed list), measurement ranges for the chosen category; used to edit AI chips and as the fallback on AI failure ("Choose filters").

**Out:** search history or saved searches, AI ranking, pagination.

## 3. References

| Document | Sections |
|---|---|
| [AI features](../ai-features-v1.md) | 2 Call policy; 2.1 Color vocabulary; 2.4 `SearchConditions`; 4 Search interpretation; 5 Guardrails; 7 Failure handling; 8 Logging |
| [API 15 Ranked search](../api/15-search.md) | All |
| [API 06](../api/06-register-read-clothing.md) | `ClothingSummary`, `Measurements` names per category |
| [App flow redesign](../../superpowers/specs/2026-11-02-app-flow-redesign-design.md) | 4.3 Search ranking; 5 Search API split, color vocabulary, ±1 inch |
| [Screen flow](../../flows/screen-flow-v1.md) | 4.2 S1, S2; 5 AI failure flow |
| [Mockup v2](../../flows/mockup-flow-v2.html) | Screen 4 |
| [Backend AI integration](../../rules/dev/backend/ai-integration.md) | Closed vocabularies, AI never ranks IDs, 503 handling |
| [API contract](../../rules/dev/common/api-contract.md) | `AI_UNAVAILABLE`, validation error shape, `EVENT_CLOSED` (not used for search) |
| [Frontend error handling](../../rules/dev/frontend/error-handling.md) | AI failure → manual filters |

## 4. Existing Code

- 018: AI client and fake in `backend/app/ai/`, `clothing_analyses` model.
- `backend/app/repositories/clothing.py` `list_visible` (candidate set), `backend/app/schemas/clothing.py` `Measurements`, `domain/enums.py` `ClothingCategory`.
- Frontend: Home grid card from 016, `lib/validation/clothing-form.ts` `measurementFieldsFor`, `lib/api/` query patterns, 015 `search/page.tsx` placeholder.

## 5. Already Decided

- Category is a hard filter; other conditions score 1 point each; unmeasured items rank lower; unanalyzed items never match colors; zero-point items stay after matches.
- Two endpoints; AI only interprets text and never sees garment data or IDs.
- 14-color vocabulary; a single stated measurement becomes ±1 inch; inches only.
- AI failure shows an error and opens manual filters.

## 6. Open Questions for Clarify

- Keep the query and conditions in the URL (`?q=` and filter params) so back navigation restores results?
- Minimum query length before calling the AI (1 char per API limits, or more)?

## 7. Spec Kit Run

**Specify input**

```text
019 AI search (backend + frontend).
Backend: POST /api/v1/events/{event_id}/search/interpretation turns 1-200 chars of text into SearchConditions (category, colors from the fixed vocabulary, measurement ranges, unrecognized phrases) with the Meta model and server-side validation, 503 AI_UNAVAILABLE on failure; GET /api/v1/events/{event_id}/clothing/search ranks other participants' available garments: category hard filter, +1 per matched color (done analysis of current version only) and per matched measurement range, ties put garments with requested measurements first then newest, returning matchCount, missingMeasurements, conditionCount. Both work after the event closes.
Frontend: Search tab (S1) with text input, removable condition chips, "Not understood" note, ranked grid with match labels; Filters sheet (S2) for editing conditions and as the fallback when AI fails.
Sources: docs/plans/features/019-ai-search.md, docs/plans/ai-features-v1.md (2, 2.1, 2.4, 4, 5, 7, 8), docs/plans/api/15-search.md, docs/superpowers/specs/2026-11-02-app-flow-redesign-design.md (4.3, 5), docs/flows/screen-flow-v1.md (4.2), docs/flows/mockup-flow-v2.html (screen 4).
```

**Plan research (explorer):** reuse of the 018 AI client for a text-only task; efficient ranking over the candidate set (in Python vs. SQL, event sizes are small); query-param parsing for `<name>Min`/`<name>Max`; Astryx chip and bottom sheet components.

## 8. Done When

- Typing a query shows interpreted chips and ranked results; editing chips re-ranks without another AI call.
- With the AI disabled (fake failure), the error appears and manual filters produce the same ranking.
- Ranking unit tests cover hard filter, points, tie order, unanalyzed colors, and missing measurements.
- Backend and frontend checks pass.
