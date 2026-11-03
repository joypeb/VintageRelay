---
description: "Task list for 018 Background AI clothing analysis"
---

# Tasks: 018 Background AI Clothing Analysis

**Input**: Design documents from `/specs/018-ai-clothing-analysis/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED (TDD) - write failing tests first, confirm FAIL before implementation. No external model calls in tests (fake only).

**Organization**: Backend (migration → client → trigger/job → responses) then frontend.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup + Day-One Check

- [ ] T001 Verify dev setup per quickstart (backend `uv run pytest -q` green, frontend `pnpm install` state)
- [ ] T002 Day-one real-model check: one manual call with a sample photo via Chat Completions (`muse-spark-1.3`, base64 image + json_schema) confirming access, image input, structured output, latency; record access/latency/notes (no key, no bytes) in specs/018-ai-clothing-analysis/plan.md; no code change

---

## Phase 2: Migration + Model (US1/US2/US3 backend foundation)

### Tests (Red first)

- [ ] T003 [P] [US1] Red: migration test in backend/tests/test_migrations.py (extend: `clothing_analyses` table + one-row-per-garment uniqueness)
- [ ] T004 [P] [US1] Red: AI schema tests in backend/tests/unit/test_ai_schemas.py (new: vocab colors enforced, pattern enum, tag/detail caps + empty-drop, message 200-char cap, sizeLabel nullable, strict-flat schema)

### Implementation

- [ ] T005 Implement `clothing_analyses` ORM in backend/app/models/clothing_analysis.py + repository in backend/app/repositories/clothing_analysis.py (replace-pending/get-current/conditional-save-first-wins/mark_failed) + Alembic migration (Green for T003)
- [ ] T006 Implement `backend/app/ai/` (protocols.py `ClothingAnalyzer`, schemas.py Pydantic result, client.py httpx Chat Completions with timeout/retry/semaphore, fake.py scripted analyzer) (Green for T004)

**Checkpoint**: Table + client exist; no trigger wired yet

---

## Phase 3: Trigger + Job (US1/US2/US3 backend)

### Tests (Red first)

- [ ] T007 [US1] Red: trigger tests in backend/tests/api/test_clothing_analysis_trigger.py (new: register returns pending v1 without waiting — fake gated via threading.Event so the job has not completed at assert time; edit bumps version replacing row with new pending; replay edit creates no new row; job tests call the service method directly, not via TestClient BackgroundTasks)
- [ ] T008 [US2/US3] Red: job tests in backend/tests/services/test_clothing_analysis_job.py (new: done saved at same version via single conditional write + rowcount; old-version result discarded; withdrawn discarded; failure sets failed + ai_call_failed log without content; race keeps first done; startup cleanup function marks leftover pending failed when called directly)

### Implementation

- [ ] T009 Wire pending replace into `services/clothing.py` register/edit (same transaction; replay = no-op) + `Clothing.analysis` in `_build_response` (all reads) + `Settings` AI keys (`ai_api_key: SecretStr | None`, no conftest/fixture changes needed) + `get_analyzer` Depends provider in `backend/app/ai/deps.py` (Green for T007)
- [ ] T010 Implement job in backend/app/services/clothing_analysis.py (read version → analyzer outside txn → single conditional write with rowcount first-wins) + `BackgroundTasks.add_task` in routers (register + edit, no client import) + lifespan cleanup before the injected-db early return + production-only key assertion on the `db is None` path (Green for T008)

**Checkpoint**: Backend gate `cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest`

---

## Phase 4: Frontend (US4)

### Tests (Red first)

- [ ] T011 [P] [US4] Red: parse tests in frontend/src/lib/validation/clothing-response.test.ts (extend: analysis pending/done/failed/stale, malformed → ApiError UNKNOWN_ERROR)
- [ ] T012 [P] [US4] Red: polling tests in frontend/src/lib/api/clothing.test.ts (extend: refetchInterval 5000 iff analysis pending) + section tests in new frontend/src/components/clothing/EstimatedByAI.test.tsx (done renders colors/pattern/material/tags/details/size + uncertainties; failed/null renders nothing)

### Implementation

- [ ] T013 Extend analysis schema/type + parse in clothing-response.ts / types/clothing.ts (Green for T011)
- [ ] T014 Add 5 s pending-only polling in lib/api/clothing.ts hooks (Green for T012-polling)
- [ ] T015 Implement `EstimatedByAI` + wire into C1 rows / C4 / B3 with "AI analyzing…" role=status + Estimated section (Green for T012-section)

**Checkpoint**: Frontend gate `cd frontend && pnpm lint && pnpm typecheck && pnpm test` (`pnpm build` with env before PR)

---

## Phase 5: Polish

- [ ] T016 Run `/impeccable critique` on analyzing state + Estimated section, resolve in frontend/src/components/clothing/
- [ ] T017 Full gates (backend + frontend as above) on final content
- [ ] T018 Manual verify: real-model register→pending→done path once (dev key), B3/C4 screenshots 360–430px, record latency in plan.md
- [ ] T019 Update docs in same PR: repo-wide grep for `META_API_KEY` and replace with `AI_API_KEY` (ai-features §2/§7/§10, tech-stack, api README, feature docs — replace or explicitly keep each hit with a reason) + amend ai-integration.md retry allow-list with "invalid model output (analysis only)" + mark 018 done in docs/plans/features/README.md (no deviation from 06/07 response notes, else amend those docs)

---

## Dependencies & Execution Order

- T001 → T002 (manual) → T003/T004 (parallel) → T005/T006 → T007/T008 (parallel) → T009 → T010 → backend gate → T011/T012 (parallel) → T013 → T014 → T015 → frontend gate → T016 → T017 → T018 → T019
- Each test+impl pair is one delegate cycle: `test-author` → `implementer-be`/`implementer-fe` → `commit-reviewer` → commit. Never commit Red alone.
- Single implementer at a time in this workspace.
- Day-one T002 blocks job implementation (confirms surface); fake-based tests do not block on it.
