# Feature Specification: 019 Fix AI Analysis and My Items UI

**Feature Branch**: `feature/019-fix-ai-analysis-ui`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "019 Fix AI analysis and My items UI (backend + frontend). Follow-up fixes for 017/018 found in live verification on 2026-11-03: (1) the analysis output schema sent to the model in strict mode omitted `size_label` from required, so every real call was rejected and all analyses failed; (2) the frontend rejected `null` token counts in `analysis.modelInfo`, so any garment with a done analysis broke My items, item detail, and Home; (3) a withdrawn garment's analysis stays pending forever, so My items shows 'AI analyzing…' and polls every 5 s forever; (4) UI issues at 360–430 px on C1, C4, the edit form, and the delete confirmation. Sources: specs/017-my-items-edit-delete, specs/018-ai-clothing-analysis, docs/rules/dev/common/api-contract.md, docs/flows/screen-flow-v1.md."

## Clarifications

### Session 2026-11-03 (orchestrator decisions)

- Q: Feature number? → A: 019, per user decision. The planned AI search (`docs/plans/features/019-ai-search.md`) and later plans are remapped to the next free spec number when they are specified.
- Q: Scope? → A: Per user decision: the two critical bugs, withdrawn-garment analysis convergence, and the listed C1/C4/edit/delete UI improvements. Photo storage location outside the data volume is out of scope.
- Q: How does a withdrawn garment's pending analysis converge? → A: Withdrawal marks the garment's still-pending analysis `failed` in the same transaction. Rationale: one server-side change covers every client; `failed` already means "no estimates, no analyzing state" in 018, and the in-flight job already discards results for withdrawn garments. This amends 018's edge case "Withdraw does not touch the analysis row synchronously".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - AI estimates actually appear after registration or edit (Priority: P1)

A participant registers or edits a garment with the real model configured. Within the analysis time, the item detail shows the "Estimated by AI" section instead of silently hiding it because every analysis failed.

**Why this priority**: Without this fix the whole 018 feature never produces a result in a real environment.

**Independent Test**: Verify that the output contract sent to the model lists every result field as required (automated), then register a garment against the real model once and see `done` with estimates (manual, recorded).

**Acceptance Scenarios**:

1. **Given** the analysis output contract, **When** it is sent to the model in strict mode, **Then** every result field, including the nested uncertainty fields, is listed as required.
2. **Given** a model response without the size label field, **When** it is validated, **Then** it counts as an invalid structure (retry, then `failed`) rather than being silently accepted.
3. **Given** a registered garment with photos and a configured model, **When** the analysis completes, **Then** the detail shows the estimated colors, pattern, tags, details, and "Check in person" notes.

---

### User Story 2 - Screens keep working once an analysis is done (Priority: P1)

A participant opens My items, their item detail, or Home after one of the listed garments has a completed analysis, and the screen renders normally instead of "Something went wrong."

**Why this priority**: Once US1 works, every done analysis would otherwise break three main screens.

**Independent Test**: Parse a garment whose analysis has `modelInfo` token counts and latency equal to `null` (automated) and open C1/C4/Home with a done garment (manual).

**Acceptance Scenarios**:

1. **Given** a garment whose analysis model info has `null` latency or token counts, **When** the app reads it, **Then** the garment is accepted and shown.
2. **Given** a garment whose analysis model info omits those fields, **When** the app reads it, **Then** it is still accepted.

---

### User Story 3 - Withdrawn garments stop "analyzing" (Priority: P1)

A participant deletes (withdraws) a garment while its analysis is still pending. My items shows the withdrawn badge without "AI analyzing…", and the app stops refreshing every 5 seconds.

**Why this priority**: The current behavior shows a false state forever and polls the server indefinitely.

**Independent Test**: Withdraw a garment with a pending analysis and read it back (automated); open My items afterwards and confirm no analyzing text and no further periodic refresh (manual).

**Acceptance Scenarios**:

1. **Given** a garment with a pending analysis, **When** the owner withdraws it, **Then** the analysis becomes `failed` in the same change and no estimates are shown.
2. **Given** a garment whose analysis is already `done` or `failed`, **When** it is withdrawn, **Then** the analysis is left unchanged.
3. **Given** an analysis call already in flight, **When** the garment is withdrawn and the result arrives later, **Then** it is discarded and the analysis stays `failed`.
4. **Given** an already-withdrawn garment, **When** delete is repeated, **Then** it still replays with no changes, as in 017.

---

### User Story 4 - My items list is readable at a glance (Priority: P2)

A participant scans My items on a 360–430 px phone and can read each row's title, full status badge, and analysis state without truncation or run-together text, with the tab bar at the bottom of the screen.

**Why this priority**: C1 is the owner's workspace; cramped rows hide the status the owner needs.

**Independent Test**: Open C1 at 360 px and 430 px with available, withdrawn, and analyzing rows; compare against the acceptance scenarios.

**Acceptance Scenarios**:

1. **Given** a row with a pending analysis, **When** C1 renders at 360 px, **Then** the status label text ("Available", "Confirmed", "Withdrawn") is fully visible and the row shows only the short "AI analyzing…" state on its own line (the longer helper text appears only on detail screens).
2. **Given** a typical title (up to about 30 characters), **When** C1 renders at 360 px, **Then** the title takes no more than two lines.
3. **Given** a short page (empty list or one row), **When** any tab screen renders, **Then** the tab bar sits at the bottom of the viewport, not directly under the content.

---

### User Story 5 - My item detail puts owner actions and status first (Priority: P2)

A participant opens their own garment and immediately sees its status and the Edit/Delete actions without scrolling past the AI section, while the AI estimates stay compact and readable.

**Why this priority**: Owners open C4 mainly to manage the garment; the current layout hides the actions about two screens down.

**Independent Test**: Open C4 at 390 px for a garment with a done analysis; check status, action position, AI layout, and note separation.

**Acceptance Scenarios**:

1. **Given** an own garment, **When** C4 renders, **Then** its status ("Available", "Confirmed", "Withdrawn") is shown, as already required by 017 FR-015.
2. **Given** an own garment, **When** C4 renders, **Then** the "Offered by <me>" owner block is not shown.
3. **Given** a garment with a done analysis, **When** C4 renders at 390 px, **Then** [Edit] and [Delete] (or the confirmed lock note) appear before the "Estimated by AI" section.
4. **Given** a done analysis, **When** the AI section renders on C4 or B3, **Then** colors and style tags appear as compact inline chips, and each "Check in person" note is a separate list item.
5. **Given** a withdrawn garment, **When** C4 renders, **Then** Edit and Delete are not offered.

---

### User Story 6 - Edit and delete flows are clear (Priority: P3)

A participant editing a garment knows which screen they are on, sees correct copy after saving, and gets a clear, accessible delete confirmation.

**Why this priority**: Polish; the flows already work.

**Independent Test**: Open the edit form, save, and open the delete confirmation at 390 px with a screen reader tree check.

**Acceptance Scenarios**:

1. **Given** the edit form, **When** it renders, **Then** it shows a page heading "Edit item".
2. **Given** an edit was just saved and analysis restarted, **When** "AI analyzing…" shows, **Then** its helper text does not mention registration (for example, "Analysis runs in the background.").
3. **Given** the delete confirmation is open, **When** it renders, **Then** it has an opaque surface that clearly separates it from the page, and it is exposed to assistive technology as a modal dialog with its title as the label.

---

### Edge Cases

- What if a withdrawn garment's analysis is `pending` because the job never ran (for example, missing key in a dev setup)? Withdrawal still marks it `failed`.
- What if the event is closed and the garment is already withdrawn? Delete replays without touching the analysis (017 replay rule).
- What if withdrawal of an available garment is rejected (closed event or confirmed garment)? The analysis is untouched.
- What if a title is very long (100 characters)? The C1 row truncates it with an ellipsis after two lines; C4 shows it in full.
- What if a done analysis has no colors or tags? Those chip groups are omitted, as before.
- What if C4 shows a confirmed garment? The lock note takes the action slot above the AI section.

## Requirements *(mandatory)*

### Functional Requirements

**Analysis contract (US1)**

- **FR-001**: The analysis output contract sent to the model MUST list every result field as required, including nested uncertainty fields; a missing size label MUST be treated as an invalid structure.
- **FR-002**: A regression check MUST fail if any result field is ever left out of the required list.

**Response parsing (US2)**

- **FR-003**: The app MUST accept analysis model info whose latency and token counts are `null` (the server contract: fields are always present, `null` when unknown); the client additionally tolerates absent fields defensively.

**Withdrawal convergence (US3)**

- **FR-004**: Withdrawing an available garment MUST mark its analysis `failed` in the same transaction when, and only when, that analysis is `pending`.
- **FR-005**: The withdrawal replay, closed-event, and confirmed-garment rules from 017 MUST stay unchanged; rejected or replayed withdrawals MUST NOT touch the analysis.
- **FR-006**: An in-flight analysis for a withdrawn garment MUST NOT overwrite the `failed` row (existing discard rule kept).

**My items list (US4)**

- **FR-007**: C1 rows MUST show the full status label text at 360–430 px.
- **FR-008**: C1 rows MUST show only the short "AI analyzing…" state, on its own line, without squeezing the title or status label; the whole row (photo, title, status) MUST stay one navigation target to C4.
- **FR-009**: C1 row titles MUST wrap to at most two lines, truncating with an ellipsis beyond that.
- **FR-010**: The bottom tab bar MUST sit at the bottom of the viewport on short pages (active and closed events, including the closed-event banner), without covering content on long pages.

**My item detail (US5)**

- **FR-011**: C4 MUST show the garment status.
- **FR-012**: C4 MUST NOT show the owner block for the viewer's own garment.
- **FR-013**: C4 MUST place [Edit]/[Delete], or the confirmed lock note, before the "Estimated by AI" section; withdrawn garments MUST NOT offer Edit/Delete.
- **FR-014**: The "Estimated by AI" section (shared by B3 and C4) MUST show colors and style tags as inline chips and each "Check in person" note as a separate list item.

**Edit and delete (US6)**

- **FR-015**: The edit form MUST show the heading "Edit item".
- **FR-016**: The "AI analyzing…" helper text on detail screens MUST be neutral to registration vs. edit ("Analysis runs in the background.").
- **FR-017**: The delete confirmation MUST use an opaque surface and be exposed as a modal dialog labeled by its title.
- **FR-018**: All new UI text MUST be in English.

### Key Entities

- **Analysis row**: unchanged from 018; withdrawal now converges a `pending` row to `failed`.
- **My items row**: photo, title (max two lines), full status badge, analysis state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the real model configured, a newly registered garment with photos reaches a done analysis with visible estimates on the first attempt (verified once manually and recorded).
- **SC-002**: My items, item detail, and Home render without an error state for garments with a done analysis whose model info has numeric, `null`, or absent latency/token values.
- **SC-003**: After withdrawing a garment with a pending analysis, My items shows no "AI analyzing…" for it; a withdrawn garment never keeps My items refreshing — if it was the only pending item, periodic refreshes stop within 10 seconds; if other items are still pending, refreshes continue only until those finish.
- **SC-004**: At 360 px and 430 px, no C1 status badge is truncated and no row title exceeds two lines.
- **SC-005**: On C4 at a 390 × 844 viewport for a garment with one photo, a description up to 200 characters, two measurements, and a done analysis, Edit and Delete appear before the AI estimates and are reachable without scrolling past any AI content.
- **SC-006**: Backend and frontend checks pass.

## Assumptions

- The two critical fixes (FR-001/FR-002, FR-003) were made in the working tree during verification with reproducing tests; this feature reviews and commits them through the normal cycle.
- B3 (shared detail) keeps its owner block; only the own-garment view (C4) hides it.
- Photo reorder/replace in the edit UI stays deferred (017).
- Photo storage outside the data volume, the analysis timeout headroom, and stale-version wasted model calls are out of scope.
- Interface language is English; layouts verified at 360–430 px with screenshots.
