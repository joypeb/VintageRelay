---
description: "Task list for 017 My items edit/delete"
---

# Tasks: 017 My Items Edit/Delete

**Input**: Design documents from `/specs/017-my-items-edit-delete/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED (TDD) - write failing tests first, confirm FAIL before implementation.

**Organization**: Grouped by user story; backend before frontend per feature doc.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 list, US2 detail+delete, US3 edit, US4 redirect
- Include exact file paths

## Path Conventions

- Backend: `backend/app/`, `backend/tests/api/`, `backend/tests/unit/`
- Frontend: `frontend/src/`, colocated `*.test.ts(x)`

---

## Phase 1: Setup

- [ ] T001 Verify dev setup per specs/017-my-items-edit-delete/quickstart.md in backend (`uv run pytest -q` baseline) and frontend (`pnpm install` state)

---

## Phase 2: Backend PATCH (US3 backend)

### Tests (Red first)

- [ ] T002 [P] [US3] Red: schema unit tests in backend/tests/unit/test_clothing_update_schema.py (optional fields, duplicate photoIds rejected, empty body rejected, category/measurement mismatch rejected, null/{} clears)
- [ ] T003 [US3] Red: PATCH API tests in backend/tests/api/test_edit_clothing.py (owner edit title bumps contentVersion + updatedAt; identical replay no bump; photo reorder keeps order + drop detaches + 409 leaves order untouched single-transaction; other garment photo 409; unknown photo 404; cross-event garment/token 404; same-event non-owner 403; missing/invalid token 401; withdrawn 409; confirmed 409; closed+withdrawn and closed+confirmed both 409 EVENT_CLOSED (event-state before feature-state); closed 409 with replay-unchanged 200; invalid category/measurement 422 with details.fields `measurements.<name>`; log clothing_updated fields + no title/description text)

### Implementation

- [ ] T004 [US3] Implement `ClothingUpdate` in backend/app/schemas/clothing.py (reuse ClothingCreate validators, validation-first 422), `edit()` in backend/app/services/clothing.py (validation->ownership same-event 403/cross-event 404->replay->event/confirmed/withdrawn->NULL-staged photo replace->version bump->_build_response, log clothing_updated with changed_fields+photo_count), PATCH route in backend/app/api/routers/clothing.py, new domain errors + api/errors.py mapping with per-endpoint messages (Green for T002+T003)

**Checkpoint**: PATCH works with replay and reorder; no analysis/invalidation yet

---

## Phase 3: Backend DELETE (US2 backend)

### Tests (Red first)

- [ ] T005 [US2] Red: DELETE API tests in backend/tests/api/test_withdraw_clothing.py (owner withdraw 204 available->withdrawn; repeat 204; repeat after close 204; same-event non-owner 403; cross-event 404; missing 404; missing/invalid token 401; confirmed 409 with withdraw message; closed available 409 EVENT_CLOSED; envelope shape per api-contract; log clothing_withdrawn fields)

### Implementation

- [ ] T006 [US2] Implement `withdraw()` in backend/app/services/clothing.py (ownership->replay withdrawn->event active->confirmed check->status=withdrawn, log clothing_withdrawn), DELETE route in backend/app/api/routers/clothing.py (Green for T005)

**Checkpoint**: Backend PATCH+DELETE complete; run `cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest`

---

## Phase 4: Frontend foundation (blocks C1/C4/edit)

### Tests (Red first)

- [ ] T007 [P] Red: fetcher/key tests in frontend/src/lib/api/clothing.test.ts (extend: `listClothing(eventId, 'mine')` calls `?ownership=mine`, `updateClothing` sends PATCH, `deleteClothing` sends DELETE, keys include ownership)
- [ ] T008 [P] Red: update-body + error tests in frontend/src/lib/validation/clothing-form.test.ts (extend: `buildUpdateClothingBody` whole-list/whole-object, reuse `mapClothingServerFieldErrors` for 409/422 codes)

### Implementation

- [ ] T009 Implement `listClothing` ownership param, `updateClothing`, `deleteClothing` + `useMyItemsQuery`/`useUpdateClothingMutation`/`useDeleteClothingMutation` in frontend/src/lib/api/clothing.ts and key factories in frontend/src/lib/api/query-keys.ts with ownership in key + invalidation of list(mine)+detail on PATCH/DELETE (Green for T007)
- [ ] T010 Implement `buildUpdateClothingBody` in frontend/src/lib/validation/clothing-form.ts (Green for T008)
- [ ] T011 Red: queue initial-state tests in frontend/src/lib/photo/queue.test.ts (new: `initialReadyPhotos(serverPhotos)` returns ready items preserving order/urls without File) + implement loosen `file?: File` + factory in frontend/src/lib/photo/queue.ts and accept `initialPhotos` in frontend/src/components/clothing/PhotoUploadScreen.tsx

**Checkpoint**: Foundation ready

---

## Phase 5: US1 C1 list

### Tests (Red first)

- [ ] T012 [US1] Red: list tests in frontend/src/components/clothing/MyItemsList.test.tsx (new: rows with main photo/title/badge newest-first, row links to C4, empty with [Register item], loading, error with retry, no others' garments)

### Implementation

- [ ] T013 [US1] Implement `MyItemsList` + replace frontend/src/app/events/[eventId]/(tabs)/my-items/page.tsx placeholder (routing-only wrapper), add `routes.myItems/myItemDetail/myItemEdit` in frontend/src/lib/routes.ts (Green for T012)

---

## Phase 6: US2 C4 detail + delete

### Tests (Red first)

- [ ] T014 [US2] Red: detail/delete tests in frontend/src/components/clothing/MyItemDetailScreen.test.tsx (new: full detail with Edit/Delete, delete confirm flow calls DELETE then navigates C1, confirmed locked with guidance, withdrawn badge, closed-event actions disabled, 404 + unauthenticated states, Requests placeholder hidden/empty for 020)

### Implementation

- [ ] T015 [US2] Implement `MyItemDetailScreen` in frontend/src/components/clothing/MyItemDetailScreen.tsx + routing-only frontend/src/app/events/[eventId]/(tabs)/my-items/[itemId]/page.tsx (Green for T014; include empty "Requests" placeholder for 020)

---

## Phase 7: US3 C2 edit + US4 redirect

### Tests (Red first)

- [ ] T016 [US3] Red: edit tests in frontend/src/components/clothing/EditClothingForm.test.tsx or extend MyItemDetail flow (prefill photos as ready + fields, save sends PATCH, invalid maps errors, success shows "Saved." on C4)
- [ ] T017 [US4] Red: redirect test in frontend/src/components/clothing/PhotoUploadScreen.test.tsx (extend: register success navigates to myItems with registered flag, Home no longer shows confirmation)

### Implementation

- [ ] T018 [US3] Implement frontend/src/app/events/[eventId]/(tabs)/my-items/[itemId]/edit/page.tsx (routing-only) reusing PhotoUploadScreen + ClothingDetailsForm prefilled; [Save] -> updateClothing -> C4 with "Saved." (Green for T016)
- [ ] T019 [US4] Move registration success to C1 with "Clothing registered." (PhotoUploadScreen navigate change) and remove status from frontend/src/components/event/EventHomeScreen.tsx (Green for T017)

---

## Phase 8: Polish

- [ ] T020 Run `/impeccable critique` on C1/C4/edit and resolve findings in frontend/src/components/clothing/
- [ ] T021 Run full gates: `cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest`; `cd frontend && pnpm lint && pnpm typecheck && pnpm test` (`pnpm build` before PR); fix in source files
- [ ] T022 Validate quickstart scenarios at 360–430px and capture PR screenshots
- [ ] T023 Amend docs/plans/api/07-edit-withdraw-clothing.md with 017 deferral note (skip analysis + invalidation, counts 0, re-enabled in 018/020) + mark 017 done in docs/plans/features/README.md

---

## Dependencies & Execution Order

- T001 -> T002/T003 (parallel different files) -> T004 -> T005 -> T006 -> backend gate -> T007/T008 (parallel) -> T009/T010/T011 -> T012 -> T013 -> T014 -> T015 -> T016/T017 (parallel different files) -> T018/T019 -> T020 -> T021 -> T022 -> T023
- Each test+impl pair is one delegate cycle: `test-author` -> `implementer-be`/`implementer-fe` -> `commit-reviewer` -> commit. Never commit Red alone.
- Backend (T002-T006) before frontend that calls it.
- Single implementer at a time in this workspace.
