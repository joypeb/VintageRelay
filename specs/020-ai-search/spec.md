# Feature Specification: 019 AI Search

**Feature Branch**: `feat/019-ai-search-speckit`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "019 AI search (backend + frontend). Backend: POST /api/v1/events/{event_id}/search/interpretation turns 1-200 chars of text into SearchConditions (category, colors from the fixed vocabulary, measurement ranges, unrecognized phrases) with the Meta model and server-side validation, 503 AI_UNAVAILABLE on failure; GET /api/v1/events/{event_id}/clothing/search ranks other participants' available garments: category hard filter, +1 per matched color (done analysis of current version only) and per matched measurement range, ties put garments with requested measurements first then newest, returning matchCount, missingMeasurements, conditionCount. Both work after the event closes. Frontend: Search tab (S1) with text input, removable condition chips, "Not understood" note, ranked grid with match labels; Filters sheet (S2) for editing conditions and as the fallback when AI fails. Sources: docs/plans/features/019-ai-search.md, docs/plans/ai-features-v1.md (2, 2.1, 2.4, 4, 5, 7, 8), docs/plans/api/15-search.md, docs/superpowers/specs/2026-11-02-app-flow-redesign-design.md (4.3, 5), docs/flows/screen-flow-v1.md (4.2), docs/flows/mockup-flow-v2.html (screen 4)."

> Roadmap ID is 019; the spec directory is `020-ai-search` because `specs/019-*` was taken by the 019 UI fix.

## Clarifications

### Session 2026-11-03

- Q: Should the query and conditions stay in the URL (`?q=` and filter params) so back navigation from B3 restores results? → A: Yes, keep them in the URL; restoring does not call the AI again (FR-017).
- Q: What is the minimum query length before calling the AI? → A: 1 character after trimming, same as the API limit; no extra client rule.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ranked results from manual conditions (Priority: P1)

A participant chooses a category, colors, and measurement ranges and sees other participants' available garments ordered best match first, each labelled with how many conditions it matched ("2/3 match") and "No measurements" when it lacks every requested measurement.

**Why this priority**: The ranking is regular code that works without AI; it is both the core result and the fallback when AI fails, so it must exist first.

**Independent Test**: Seed an event with garments of mixed categories, colors (analysis done/pending/failed/stale), and measurements; call ranked search with conditions and assert order, `matchCount`, `missingMeasurements`, and `conditionCount`.

**Acceptance Scenarios**:

1. **Given** a category condition, **When** search runs, **Then** garments of other categories are excluded.
2. **Given** color conditions, **When** a garment's current-version analysis is `done` and lists a requested color, **Then** it gains 1 point per matched color; garments with `pending`, `failed`, `stale`, or no analysis never match colors.
3. **Given** a measurement range, **When** the garment's value lies inside it (inclusive), **Then** it gains 1 point; a missing value never matches.
4. **Given** equal points, **When** measurement conditions exist, **Then** garments with any requested measurement come before garments with none, then newest first.
5. **Given** garments with 0 points, **When** results return, **Then** they remain after the matching garments.
6. **Given** no conditions, **When** search runs, **Then** the result equals Home order (newest first) with `conditionCount = 0`.
7. **Given** the caller's own garments or non-available garments, **When** search runs, **Then** they never appear.
8. **Given** the event is closed, **When** search runs, **Then** results still return.

---

### User Story 2 - Natural-language search becomes conditions (Priority: P1)

A participant types "green jacket, chest around 21 inches" and the AI turns it into conditions (Outer, green, chest 20–22). Conditions appear as removable chips, phrases the AI could not map appear in a "Not understood" note, and ranked results load.

**Why this priority**: The headline feature: searching in plain words instead of filling filters.

**Independent Test**: With a fake AI returning fixed conditions, submit text and assert validated conditions; on the frontend, assert chips, note, and that results are requested with those conditions.

**Acceptance Scenarios**:

1. **Given** 1–200 characters of text (after trimming), **When** interpretation runs, **Then** the response contains `category` (or none), `colors`, `measurements`, and `unrecognized`.
2. **Given** the AI returns a color outside the 14-color vocabulary or a measurement name not valid for garments, **When** the server validates, **Then** that condition is dropped and its phrase moves to `unrecognized`.
3. **Given** the AI returns a range with `min > max` or a value outside `(0, 120]`, **When** the server validates, **Then** that range is dropped.
4. **Given** a single stated value (`min == max`), **When** the server validates, **Then** it becomes `max(value − 1, 0.1)` to `min(value + 1, 120)`.
5. **Given** empty or over-200-character text, **When** submitted, **Then** a validation error returns and the AI is not called.
6. **Given** the event is closed, **When** interpretation runs, **Then** it still works.
7. **Given** the participant removes a chip, **When** the chip disappears, **Then** results re-rank without another AI call.

---

### User Story 3 - AI failure falls back to manual filters (Priority: P2)

When the AI fails (timeout, error, invalid output after one retry), the participant sees "Search could not understand that right now. Choose filters instead." and a [Choose filters] action that opens the Filters sheet; applying filters produces the same ranking as AI-derived conditions.

**Why this priority**: AI is optional; search must never dead-end.

**Independent Test**: Make the fake AI fail; assert `503 AI_UNAVAILABLE` and a `WARNING` log without the search text; on the frontend, assert the message and that the Filters sheet opens.

**Acceptance Scenarios**:

1. **Given** the model fails twice, **When** interpretation ends, **Then** the response is `503 AI_UNAVAILABLE` (never `500`).
2. **Given** a `503`, **When** S1 shows the error, **Then** [Choose filters] opens S2.
3. **Given** manual filters equal to an AI result, **When** applied, **Then** the ranking is identical.

---

### User Story 4 - Edit conditions in the Filters sheet (Priority: P2)

From S1, [Edit filters] opens S2 prefilled with the current conditions: category (Top/Outer/Bottom/Other), colors (fixed list), and measurement ranges for the chosen category only. [Apply] returns to S1 with re-ranked results.

**Why this priority**: Lets users correct AI interpretations and refine searches without retyping.

**Independent Test**: Open S2 with conditions, change category and a range, apply, assert chips and ranked request updated; measurement fields follow the chosen category.

**Acceptance Scenarios**:

1. **Given** current conditions, **When** S2 opens, **Then** they are prefilled.
2. **Given** a category change, **When** the measurement section updates, **Then** only that category's measurement names are offered and ranges for other names are cleared.
3. **Given** a range with min greater than max, **When** the user applies, **Then** the sheet blocks it with a validation message.

### Edge Cases

- Text with only whitespace → validation error; AI not called.
- Text containing instructions ("ignore previous rules…") → treated as data; output still validated against the closed vocabularies.
- Units other than inches ("55 cm") → reported in `unrecognized`, not converted.
- Unknown `category`/`color`, non-numeric range, value outside `(0, 120]`, or `min > max` sent to ranked search → validation error.
- One side of a range omitted → open-ended range (e.g. `chestMin=20` matches 20 and above).
- Measurement range given without a category, or for a name not used by the chosen category → only garments with that measurement can match it; others count as missing.
- Garment edited after analysis (stale) → its colors do not match until the new analysis is done.
- Token from another event or no token → `404`/`401` per the API contract.
- No candidates at all → empty result with an empty state message.

## Requirements *(mandatory)*

### Functional Requirements

**Interpretation**

- **FR-001**: System MUST accept search text of 1–200 characters after trimming from an event participant and return search conditions: category (or none), colors, measurement ranges, and unrecognized phrases.
- **FR-002**: System MUST send only the search text to the AI, wrapped as untrusted data, never garment data or IDs.
- **FR-003**: System MUST validate AI output: drop colors outside the 14-color vocabulary and measurement names outside the garment measurement names (moving their phrases to unrecognized), drop ranges with min > max or values outside (0, 120], and widen a single value to ±1 inch, bounded to `[0.1, 120]`.
- **FR-004**: System MUST retry a failed AI call once (timeout, server error, rate limit, invalid output) and then answer `503 AI_UNAVAILABLE` with the message "Search could not understand that right now. Choose filters instead."
- **FR-005**: System MUST NOT cache or store interpretations or search text.
- **FR-006**: System MUST log AI task, model ID, outcome, latency, retry count, and token counts when available, and failures as `WARNING` `ai_call_failed`, without logging the search text (lengths only).

**Ranked search**

- **FR-007**: System MUST rank other participants' available garments in the caller's event (the Home candidate set) using: category hard filter; +1 per requested color present in a `done` analysis of the garment's current content version; +1 per measurement range containing the garment's value.
- **FR-008**: System MUST order by match count descending, then (when measurement conditions exist) garments having any requested measurement before those having none, then newest first; zero-point garments stay in the list.
- **FR-009**: System MUST return per garment the garment summary, `matchCount`, and `missingMeasurements`, plus a top-level `conditionCount` (each color and each range counts as 1) and `nextCursor = null`.
- **FR-010**: System MUST count a repeated color once (for points and `conditionCount`) and MUST reject unknown categories or colors, non-numeric or out-of-range values, and min > max with a validation error.
- **FR-011**: System MUST compute results per request with regular code and never use AI for ranking.
- **FR-012**: Both endpoints MUST work after the event closes and enforce participant authentication and event membership.

**Frontend**

- **FR-013**: The Search tab (S1) MUST provide a text input, show interpreted conditions as removable chips, show unrecognized phrases in a "Not understood" note, and show ranked results in the Home grid card style with "N/M match" and "No measurements" labels; a card opens the item detail (B3).
- **FR-014**: Removing a chip or applying filters MUST re-run ranked search without calling the AI again.
- **FR-015**: On AI failure, S1 MUST show the failure message and a [Choose filters] action that opens S2.
- **FR-016**: The Filters sheet (S2) MUST offer category, the fixed color list, and measurement ranges for the chosen category, prefilled from current conditions, and apply them to S1.
- **FR-017**: S1 MUST keep the query and conditions in the page address so back navigation from an item detail restores the same results without another AI call.

### Key Entities

- **Search conditions**: category (optional), colors (from the fixed vocabulary), measurement ranges by name (inches, min/max), unrecognized phrases. Transient, never stored.
- **Ranked result item**: an existing garment summary plus match count and missing-measurements flag.
- **Clothing analysis** (existing, from 018): its status and colors for the current content version drive color matching.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A participant goes from typing a query to seeing ranked results in one submit, typically within a few seconds. The expected worst-case budget (not a hard deadline) is about 25 seconds: two attempts bounded by the configurable 10-second timeout, a 1-second retry wait, and a 2-second wait for a free AI slot, after which the participant sees results or the fallback message.
- **SC-002**: Removing a chip or applying filters updates results without any AI call.
- **SC-003**: With AI disabled, a participant can still reach ranked results through filters in at most two taps from the error.
- **SC-004**: For the same conditions, AI-derived and manual searches return identical rankings.
- **SC-005**: Ranking tests cover the hard filter, points, tie order, unanalyzed/stale colors, and missing measurements, and all pass.
- **SC-006**: Returning from an item detail to S1 shows the same query, chips, and results.

## Assumptions

- The 018 AI client, its fake, and `clothing_analyses` are reused; the interpretation call uses a 10 s timeout and 1 retry per the proposed call policy.
- Minimum query length is 1 character after trimming (API limit); no extra client-side minimum.
- Query and conditions live in the URL (`?q=` plus filter params) to restore results on back navigation (FR-017).
- Event sizes are small, so ranking over the full candidate set per request is acceptable; no pagination.
- Out of scope: search history, saved searches, AI ranking, pagination.
- Measurement names and per-category fields follow the existing `Measurements` schema and the frontend `measurementFieldsFor` helper.
