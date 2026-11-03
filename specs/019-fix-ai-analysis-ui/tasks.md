# Tasks: 019 Fix AI Analysis and My Items UI

**Input**: specs/019-fix-ai-analysis-ui/ (spec.md, plan.md, research.md, data-model.md, contracts/withdraw-analysis.md, quickstart.md)

**Tests**: Required (constitution II). Each cycle = test-author (Red) → implementer-be/fe (Green → Refactor) → commit-reviewer → commit. Layout-only items (badge width, tab bar position) are verified manually at 360–430 px per constitution III.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [ ] T001 Baseline: `cd backend && uv run pytest -q` and `cd frontend && pnpm test` on branch feature/019-fix-ai-analysis-ui (working tree already holds the US1/US2 fixes)

---

## Phase 2: US1 — AI estimates actually appear (P1) 🎯 MVP

**Goal**: Real model calls succeed. **Independent test**: schema regression test + one real-model call recorded in plan.md.

- [ ] T002 [US1] Red (done in working tree, confirmed failing before fix): `test_json_schema_requires_every_property_for_strict_mode` in backend/tests/unit/test_ai_schemas.py asserts `set(schema["required"]) == set(schema["properties"])` for the root and each `$defs` entry; `test_size_label_is_nullable` no longer accepts a missing `size_label`. Add (advisor A6): an explicit assertion that a payload without `size_label` raises `ValidationError`
- [ ] T003 [US1] Green (done in working tree): `size_label: str | None` (no default) in backend/app/ai/schemas.py; commit-reviewer reviews T002+T003 together, then commit

---

## Phase 3: US2 — Screens keep working once analysis is done (P1)

**Goal**: `null` model-info numbers parse. **Independent test**: parse test with `latencyMs: 17453, promptTokens: null, completionTokens: null`.

- [ ] T004 [US2] Red (done in working tree, confirmed failing before fix): "parses done analysis with null token counts as the backend sends them" in frontend/src/lib/validation/clothing-response.test.ts. Add (advisor A6): a case with `latencyMs: null` too; keep the existing omitted-fields case (`modelInfo: { modelId }`)
- [ ] T005 [US2] Green (done in working tree): `latencyMs`, `promptTokens`, `completionTokens` use `.nullish()` in frontend/src/lib/validation/clothing-response.ts and `?: number | null` in frontend/src/types/clothing.ts; commit-reviewer reviews T004+T005, then commit

---

## Phase 4: US3 — Withdrawn garments stop "analyzing" (P1)

**Goal**: Withdraw converges `pending` → `failed`. **Independent test**: API test reading the garment after DELETE.

- [ ] T006 [US3] Red: in backend/tests/api/test_withdraw_clothing.py add tests: (a) register (analysis `pending`), DELETE → 204, GET detail → `analysis.status == "failed"`, `features is None`; (b) analysis already `done` (complete via fake analyzer or set row) then DELETE → stays `done`; (c) replay DELETE on withdrawn (also after close) and rejected DELETE (closed event, confirmed garment) leave the analysis row unchanged (status, updated_at); (d) a garment whose analysis is already `failed`, and one with no analysis row, withdraw fine and stay unchanged. In backend/tests/services/test_clothing_analysis_job.py add a gated in-flight test: start `run_clothing_analysis` with a gated FakeAnalyzer (threading.Event), withdraw via the API while it waits, release the gate, assert the row stays `failed` with `features` null. Check backend/tests/services/test_clothing_analysis_job.py `test_withdrawn_garment_result_discarded` (~line 110-135): if it withdraws through the service and asserts the row stays `pending`, update the expectation to `failed` (spec change per FR-004/FR-006) and keep asserting the late result is discarded
- [ ] T007 [US3] Green: in `ClothingService.withdraw` (backend/app/services/clothing.py ~line 400) capture `now = self.clock()` once, use it for `updated_at`, and call `analysis_repo.mark_failed(s, clothing.id, clothing.content_version, now)` after setting `status = withdrawn`, inside the same `db.write()` transaction; replay/closed/confirmed paths unchanged
- [ ] T008 [P] [US3] Docs: note the withdraw side effect in docs/plans/api/07-edit-withdraw-clothing.md (withdraw processing rules) and replace the 018 edge case "Withdraw does not touch the analysis row synchronously" with a pointer to 019 in specs/018-ai-clothing-analysis/spec.md; in specs/018-ai-clothing-analysis/contracts/clothing-analysis.md change `modelInfo` notation from optional (`latencyMs?` etc.) to always-present nullable numbers (`latencyMs: number | null` …) per api-contract null rule (advisor A5)

---

## Phase 5: US4 — My items list readable (P2)

**Goal**: Full badge, ≤2-line title, separated analyzing state, tab bar at bottom. **Independent test**: component test for structure; manual screenshots at 360/430 px for widths.

- [ ] T009 [US4] Red: in frontend/src/components/clothing/MyItemsList.test.tsx assert a pending row shows the status label text ("Available"/"Withdrawn") and "AI analyzing…" as separate elements, does NOT render the long helper sentence in the row, and the whole row (including the photo and status) stays inside the single link to C4 (keep existing navigation assertions at MyItemsList.test.tsx:106-109); in frontend/src/lib/api/clothing.test.ts (or the hook test that covers `refetchInterval`) assert list polling is off when the only formerly pending item now has `status: "withdrawn"` with analysis `failed`, and on while any other item is `pending`; in frontend/src/components/clothing/EstimatedByAI.test.tsx assert the pending helper reads "Analysis runs in the background." and never "Registration is complete" (FR-016)
- [ ] T010 [US4] Green: frontend/src/components/clothing/MyItemsList.tsx — keep the whole row as one link (do NOT move photo/status into `ListItem.startContent`/`endContent`, which sit outside the anchor); inside: photo | title clamped to 2 lines over a second line with the status as an Astryx `Token` and the short "AI analyzing…" text; no helper sentence in rows; frontend/src/components/clothing/EstimatedByAI.tsx helper copy → "Analysis runs in the background."
- [ ] T011 [US4] UI-only (no automated test; verified manually per constitution III): tab bar pinned to viewport bottom on short pages — full-viewport-height column covering the enclosing frontend/src/app/events/[eventId]/layout.tsx (closed-event banner) and frontend/src/app/events/[eventId]/(tabs)/layout.tsx with content growing, keeping `sticky bottom-0` in frontend/src/components/ui/BottomTabBar.tsx; Astryx layout component or token-backed utilities only

---

## Phase 6: US5 — My item detail: status and actions first (P2)

**Goal**: C4 shows status, hides own owner block, actions before AI section; AI section chips and note list. **Independent test**: component tests below.

- [ ] T012 [US5] Red: in frontend/src/components/clothing/MyItemDetailScreen.test.tsx assert (a) an available garment shows "Available" (status rendered as a Token, not Badge); (b) "Offered by" is not rendered; (c) the Edit link and Delete button appear before the "Estimated by AI" heading in document order (done analysis); (d) confirmed lock note appears before "Estimated by AI"; (e) withdrawn garment shows no Edit/Delete. In frontend/src/components/clothing/EstimatedByAI.test.tsx assert each uncertainty message is its own `listitem` and colors/style tags render inside a group per field (one element per value). Keep frontend/src/components/clothing/ClothingDetailScreen.test.tsx expectations for B3 owner block
- [ ] T013 [US5] Green: frontend/src/components/clothing/MyItemDetailScreen.tsx — always render the status as an Astryx `Token` (category label too, replacing `Badge`), remove owner block, move actions/lock note above `EstimatedByAI`, no actions for withdrawn; frontend/src/components/clothing/EstimatedByAI.tsx — colors and style tags as wrapped inline Astryx `Token` chips, uncertainties as a semantic list inside the "Check in person" banner

---

## Phase 7: US6 — Edit and delete flows clear (P3)

**Goal**: Edit heading, accessible opaque delete dialog. **Independent test**: component tests below + manual dialog screenshot.

- [ ] T014 [US6] Red: frontend/src/components/clothing/EditClothingForm.test.tsx asserts a level-1 heading "Edit item"; frontend/src/components/clothing/MyItemDetailScreen.test.tsx asserts that after clicking Delete a `dialog` role named "Delete this item?" is present (expected to already pass — record as existing coverage, not a Red; modality and opacity are browser-verified in T017)
- [ ] T015 [US6] Green: add `Heading level={1}` "Edit item" in frontend/src/components/clothing/EditClothingForm.tsx; inspect the delete `Dialog` surface at 390 px (compare frontend/src/components/event/CloseEventDialog.tsx) and, only if see-through, make it opaque via Dialog props/theme tokens in frontend/src/components/clothing/MyItemDetailScreen.tsx

---

## Phase 8: Polish & Verification

- [ ] T016 Full checks (also run the changed area's checks before every commit): `cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest` and `cd frontend && pnpm lint && pnpm typecheck && pnpm test`
- [ ] T017 `cd frontend && pnpm build && pnpm exec astryx doctor --built .next` (advisor A10); English-copy review of all new UI text (FR-018)
- [ ] T018 Manual quickstart (specs/019-fix-ai-analysis-ui/quickstart.md) at 360/390/430 px with screenshots (C1 all three statuses + 100-char title at 360 and 430; tab bar on short/long pages for active and closed events; C4 at 390×844 with the SC-005 fixture; delete dialog modality/opacity; polling single and mixed pending), plus one real-model register → `done`; record results in plan.md
- [ ] T019 pr-reviewer review, then PR

---

## Dependencies

- T002→T003, T004→T005, T006→T007 (backend); T009→T010; T012→T013; T014→T015. US1–US3 independent. US4/US5/US6 share EstimatedByAI.tsx and MyItemDetailScreen.tsx → run frontend phases sequentially (one implementer per workspace).
- T008 parallel with any frontend phase. T016–T019 last.

## Parallel Example

Backend (T006→T007) can run in a separate workspace while frontend T009→T015 run here.

## Implementation Strategy

MVP = US1 + US2 (already green in working tree; review and commit first). Then US3, then UI polish US4 → US5 → US6.
