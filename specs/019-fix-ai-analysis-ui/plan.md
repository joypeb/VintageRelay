# Implementation Plan: 019 Fix AI Analysis and My Items UI

**Branch**: `feature/019-fix-ai-analysis-ui` | **Date**: 2026-11-03 | **Spec**: specs/019-fix-ai-analysis-ui/spec.md

**Input**: specs/019-fix-ai-analysis-ui/spec.md

## Summary

Fix two live-only bugs from 018 (strict output schema missing `size_label` in `required`; frontend zod rejecting `null` model-info numbers), converge withdrawn garments' `pending` analysis to `failed` inside the withdraw transaction, and polish C1/C4/edit/delete UI at 360–430 px. No new tables, endpoints, dependencies, or response fields.

## Technical Context

**Language/Version**: Python 3.12, FastAPI, SQLAlchemy, SQLite; TypeScript, Next.js 16.4, React 19

**Primary Dependencies**: existing only (pydantic, httpx, TanStack Query 5, zod 4, Astryx 0.7.4)

**Storage**: `clothing_analyses` (unchanged schema)

**Testing**: backend `uv run pytest` (fake analyzer); frontend `vitest` for parsing and rendered-component behavior; manual 360/390/430 px screenshots; one real-model call recorded below

**Target Platform**: Mobile web

**Project Type**: Web application (backend + frontend)

**Performance Goals**: No new requests; polling stops for withdrawn garments

**Constraints**: English UI; Astryx components and token-backed utilities only (frontend/AGENTS.md); no raw hex/px

**Scale/Scope**: 1 backend service line + tests; ~6 frontend components

## Live Verification Record (2026-11-03)

- Before fix: every real call `400 invalid_request_error` — "'required' ... Missing 'size_label'"; all rows `failed`.
- After FR-001 fix (hot-patched dev container): edit → `pending` → `done` in ~18 s; colors `navy/white/red`, pattern `striped`, 4 uncertainties; `modelInfo.latencyMs` 17453, token counts `null`.
- Before FR-003 fix: C1 switched to "Something went wrong" as soon as the analysis became `done`; after fix (worktree frontend on a separate port) C1/C4 render.
- Withdrawn garment: row stayed `pending`; C1 polled `GET .../clothing?ownership=mine` every 5 s indefinitely.

## Constitution Check

- **I. Exchange Integrity**: Withdraw guards (replay, closed, confirmed) unchanged; only an additional `pending → failed` update inside the same transaction. AI still never touches intents/consent. Pass.
- **II. Test-First**: Each task pair starts with a failing test; FR-001/FR-003 already have reproducing tests that were confirmed Red before the fix. Pass.
- **III. Test Scope**: Backend API test for withdraw convergence; frontend unit tests for parse and component structure (status shown, owner block hidden, action order, list items, heading, copy, dialog role); layout (badge truncation, tab bar position) verified manually at 360–430 px per constitution. Pass.
- **IV. Isolated Tests**: Fake analyzer only. Pass.
- **V. Simplicity**: Reuse `analysis_repo.mark_failed`; reuse Astryx `ListItem` (whole row stays one link), `Token` for labels/chips (Badge = counts only), `Dialog`. Pass.

Post-design re-check (after advisor analyze, 10 findings applied): no violations.

## Project Structure

### Documentation (this feature)

```text
specs/019-fix-ai-analysis-ui/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/withdraw-analysis.md
└── tasks.md
```

### Source Code (touched)

```text
backend/app/ai/schemas.py                     # FR-001 (done in worktree)
backend/app/services/clothing.py              # FR-004 withdraw()
backend/tests/unit/test_ai_schemas.py         # FR-002 (done in worktree)
backend/tests/api/test_withdraw_clothing.py   # FR-004/FR-005
backend/tests/services/test_clothing_analysis_job.py  # FR-006 expectation

frontend/src/lib/validation/clothing-response.ts(.test.ts)  # FR-003 (done in worktree)
frontend/src/types/clothing.ts                              # FR-003 (done in worktree)
frontend/src/components/clothing/MyItemsList.tsx(.test.tsx)        # FR-007..009
frontend/src/app/events/[eventId]/layout.tsx                        # FR-010 (closed banner frame)
frontend/src/app/events/[eventId]/(tabs)/layout.tsx                # FR-010
frontend/src/lib/api/clothing.ts (test)                            # SC-003 polling check
frontend/src/components/ui/BottomTabBar.tsx                        # FR-010
frontend/src/components/clothing/MyItemDetailScreen.tsx(.test.tsx) # FR-011..013, FR-017
frontend/src/components/clothing/EstimatedByAI.tsx(.test.tsx)      # FR-014, FR-016
frontend/src/components/clothing/EditClothingForm.tsx(.test.tsx)   # FR-015
docs/plans/api/07-edit-withdraw-clothing.md, specs/018 contract note # docs for FR-004
```

**Structure Decision**: Existing web-app layout (`backend/`, `frontend/`); no new modules.

## Complexity Tracking

None.

## Manual Verification Record (T017/T018, 2026-11-03)

Environment: worktree backend (real `muse-spark-1.3` key via env, isolated DB) + worktree frontend; browser at 360×780 and 390×844.

- Real model: four registrations through the worktree backend all reached `done` (vocabulary colors `navy/white/red`, pattern `striped`, 3–4 "Check in person" notes); latency ~17 s (SC-001).
- C1 (360 px): status labels fully visible ("Available", "Withdrawn"); 100-char title clamps to 2 lines; thumbnails stay 48 px; pending row shows "AI analyzing…" next to the status only; withdrawn row shows no analyzing state (SC-004).
- Withdraw while pending: DB row `failed`; with no pending items C1 made 0 list requests in 16 s (SC-003).
- Tab bar at viewport bottom on short pages, active and closed events (banner on top) (FR-010).
- C4 (390×844, 200-char description, 2 measurements, done analysis): category/status tokens content-width; Edit/Delete directly after measurements and before "Estimated by AI"; colors/tags as chips; notes as a bulleted list (SC-005, FR-011..FR-014).
- Edit: "Edit item" heading (FR-015). Delete dialog: after the open animation, `opacity 1`, `:modal` true, blurred backdrop — the earlier "see-through" report was a mid-animation capture; no change needed (FR-017).
- C1 at 430×932: same as 360 px (labels full, long title 2 lines, thumbnails 48 px).
- Mixed pending: garment A pending + garment B withdrawn while pending → B shows "Withdrawn" with no analyzing state and DB `failed`; C1 kept polling while A was pending, made one more request that observed A `done`, then 0 requests over the next 16 s.
- Long pages (C4, scrolled): sticky tab bar stays at the viewport bottom without covering the last content.
- `pnpm build` (with `NEXT_PUBLIC_API_BASE_URL`) passes; `astryx doctor --built frontend`: 0 fail, 4 warn (pre-existing: theme module/font imports and classNames across older files, e.g. the `(tabs)/layout.tsx` header `className="empty:hidden"` from 015).
- Out of scope, observed: C1 "Register item" stays enabled on a closed event (017 FR-020 gap).
