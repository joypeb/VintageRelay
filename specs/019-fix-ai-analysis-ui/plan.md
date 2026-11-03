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
