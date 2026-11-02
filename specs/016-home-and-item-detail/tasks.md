---
description: "Task list for 016 Home grid and item detail"
---

# Tasks: 016 Home Grid and Item Detail

**Input**: Design documents from `/specs/016-home-and-item-detail/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED (TDD, see constitution) - write them first and confirm they FAIL before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `frontend/src/`
- Tests colocate: `frontend/src/**/*.test.{ts,tsx}`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dev environment ready for a frontend-only feature (no backend, no new dependencies)

- [x] T001 Verify dev setup per specs/016-home-and-item-detail/quickstart.md prerequisites in frontend/ (`pnpm install` state, backend reachable with two participants holding available garments)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared data layer every story builds on: types, validation, fetchers, hooks, keys, routes, labels

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundation (REQUIRED - write first) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T002 [P] Red: response parsing tests in frontend/src/lib/validation/clothing-response.test.ts (new file: full `Clothing` with all 8 measurement fields and nulls, list `{items, nextCursor: null}`, withdrawn passthrough, malformed body → `ApiError` 200 `UNKNOWN_ERROR`; register `parseClothing` cases keep passing)
- [x] T003 [P] Red: fetcher and hook tests in frontend/src/lib/api/clothing.test.ts (extend existing file: `listClothing` calls `/events/<encoded>/clothing?ownership=others&status=available`, `getClothing` calls `/clothing/<encoded>`, both select session via `eventId`, rethrow `ApiError` unchanged, mount fires one request and `refetch()` fires another with no timer-driven requests under fake timers)
- [ ] T004 [P] Red: route builder tests in frontend/src/lib/routes.test.ts (extend existing file: `itemDetail(eventId, clothingId)` builds `/events/<encoded>/items/<encoded>`)

### Implementation for Foundation

- [x] T005 Full-`Clothing` zod schemas plus `parseClothingItem`/`parseClothingList` in frontend/src/lib/validation/clothing-response.ts and response types in frontend/src/types/clothing.ts (new file; `RegisteredClothing`/`parseClothing` untouched; depends on T002)
- [x] T006 Query key factories `clothingList`/`clothing` in frontend/src/lib/api/query-keys.ts plus `listClothing`/`getClothing` fetchers and `useClothingListQuery`/`useClothingQuery` hooks in frontend/src/lib/api/clothing.ts (`staleTime: 0` so focus return always re-reads, `refetchOnWindowFocus: true`, no `refetchInterval`; depends on T003 and T005)
- [ ] T007 `itemDetail` path builder in frontend/src/lib/routes.ts (depends on T004)
- [ ] T008 [P] Export `MEASUREMENT_LABELS` and category labels from frontend/src/lib/validation/clothing-form.ts (moved from `ClothingDetailsForm.tsx` local constants; identical English text; covered by the US2 detail test, no dedicated test)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Browse other participants' available garments on Home (Priority: P1)

**Goal**: Two-column newest-first grid of others' available garments on Home with loading, empty, and error states; tapping a card opens the detail

**Independent Test**: Seed other-participant available garments, open Home, verify 3:4 main photos with titles newest-first, tap a card to reach the detail (full tap-through verified once US2 lands; until then the card `href` is asserted), and check empty/error states with no own garments shown

### Tests for User Story 1 (REQUIRED - write first) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T009 [P] [US1] Red: grid tests in frontend/src/components/clothing/HomeClothingGrid.test.tsx (new file: each card shows `photos[0]` with the title below in newest-first order and links to `routes.itemDetail`; title-only cards with no owner name; single-photo item renders one frame; card image error shows the fallback; long titles do not break the two-column layout; empty state inviting registration; error state with [Try again] calling `refetch`; loading skeletons; `isMine === true` items excluded; no session renders no-access with no grid; `UNAUTHENTICATED` error renders no-access taking precedence over cached items; pull action calls the list query `refetch`)

### Implementation for User Story 1

- [ ] T010 [US1] Implement `HomeClothingGrid` in frontend/src/components/clothing/HomeClothingGrid.tsx (scaffolded from the Astryx `product-gallery` template: `Grid columns={2}`, `ClickableCard`, `EmptyState`, `Skeleton`; pull-to-refresh gesture wired to the list query `refetch`; depends on T009)
- [ ] T011 [P] [US4] Red: regression test in frontend/src/components/event/EventHomeScreen.test.tsx (extend existing file: with a populated others-garments list, the event header and "Clothing registered." confirmation still render above the grid; same Red → Green cycle as T012)
- [ ] T012 [US1] Wire the grid into frontend/src/components/event/EventHomeScreen.tsx below the [Register my clothes] button, keeping the event header and "Clothing registered." status untouched (Green for T009 and T011; depends on T010 and T011)

**Checkpoint**: Grid renders with all states; full card tap-through verified once US2 lands

---

## Phase 4: User Story 2 - Inspect another participant's garment on the item detail (Priority: P1)

**Goal**: `items/[itemId]` detail reusing the 014 carousel with all photos in order, category, title, entered measurements in inches, description, owner name with organizer badge, and withdrawn state

**Independent Test**: Open details directly by URL for multi-photo, no-measurement, organizer-owned, and withdrawn garments; verify carousel behavior, exact fields, badge rules, and withdrawn/not-found states. Together with US1 this is the deployable MVP.

### Tests for User Story 2 (REQUIRED - write first) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T013 [P] [US2] Red: detail tests in frontend/src/components/clothing/ClothingDetailScreen.test.tsx (new file: all photos render in order through the carousel; category label, full title, full description; all non-null response measurement fields shown labelled in inches including legacy fields outside the current category, and no measurements section when `measurements` is null; owner name with organizer badge only when `owner.isOrganizer`; withdrawn status shows the withdrawn badge alongside the disabled coming-soon button; 404 shows item not-found copy with a way back Home; `UNAUTHENTICATED` renders no-access; `NETWORK_ERROR` shows the error state and [Try again] refires the request)

### Implementation for User Story 2

- [ ] T014 [US2] Implement `ClothingDetailScreen` in frontend/src/components/clothing/ClothingDetailScreen.tsx (reused `PhotoCarousel` with `{ key: photo.id }` items, `onError` image fallback with no overlay for failed images, shared measurement labels, owner flag from `owner.isOrganizer`, no AI estimates; depends on T013)
- [ ] T015 [P] [US2] Add routing-only server page in frontend/src/app/events/[eventId]/(tabs)/items/[itemId]/page.tsx awaiting Next.js 16 `params` and rendering `ClothingDetailScreen` with `{ eventId, itemId }` (depends on T013)

**Checkpoint**: US1 + US2 together form the deployable MVP: grid to detail end to end

---

## Phase 5: User Story 3 - See that exchange requests are not available yet (Priority: P2)

**Goal**: [Request exchange] visible but disabled with a "Coming soon" note on every detail including withdrawn ones; activating it creates nothing

**Independent Test**: Open any item detail and attempt the request action; the button is disabled with the note and no request or navigation occurs

### Tests for User Story 3 (REQUIRED - write first) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T016 [US3] Red: disabled-request tests in frontend/src/components/clothing/ClothingDetailScreen.test.tsx (extend the US2 file after T013: [Request exchange] is visible, disabled, with the "Coming soon" note; clicking it calls no fetcher and triggers no navigation)

### Implementation for User Story 3

- [ ] T017 [US3] Implement the disabled [Request exchange] button with the "Coming soon" note in frontend/src/components/clothing/ClothingDetailScreen.tsx (depends on T014 and T016; same file as T014, run sequentially)

**Checkpoint**: All P1-P2 stories should now be independently functional

---

## Phase 6: User Story 4 - Keep the event header and registration confirmation on Home (Priority: P3)

**Goal**: Event header and "Clothing registered." confirmation render unchanged alongside the new grid

**Independent Test**: Register clothing, return to Home, and verify the header plus confirmation appear with the populated grid

No implementation task: this story requires no code change (T012 places the grid below existing blocks without touching them). Its regression test T011 runs in the Phase 3 cycle before the wiring it guards, per the Red → Green rule.

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Design review first, then final verification against reviewed content

- [ ] T018 Run `/impeccable critique` on the Home grid and the item detail and resolve findings in frontend/src/components/clothing/
- [ ] T019 Run the full frontend gate in frontend/ (`pnpm lint && pnpm typecheck && pnpm test`) on the critiqued content and fix all findings in frontend/src/
- [ ] T020 [P] Run the backend safety suite in backend/ (`uv run pytest`) to confirm no backend behavior changed
- [ ] T021 Validate specs/016-home-and-item-detail/quickstart.md scenarios 1-4 manually at 360–430 px widths (including pull-to-refresh, 1-photo/10-photo carousel, long titles, overlay focus return, reduced motion) and capture PR screenshots (depends on T019)
- [ ] T022 Mark the 016 row done in docs/plans/features/README.md (Status table) after checking the implementation deviates nowhere from docs/plans/api/06-register-read-clothing.md (depends on T021)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-6)**: All depend on Foundational phase completion
  - Within the one-implementer rule, [P] tasks denote file independence for future parallel staffing
  - Execute sequentially in priority order (US1 → US2 → US3 → US4)
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories; full tap-through completes with US2
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Independently testable via direct URL
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - T016 extends the T013 test file (run after T013); T017 edits the T014 file (run after T014)
- **User Story 4 (P3)**: Test-only (T011); runs in the Phase 3 cycle before the T012 wiring it guards

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Red → Green → Refactor per AGENTS.md)
- Each test task + its implementation task is one delegate cycle: `test-author` → `implementer-fe` → `commit-reviewer` → commit
- T006 consumes T005 parsing output (explicit dependency, not parallel)
- T012 is Green for both T009 and T011
- Story complete before moving to next priority

### Parallel Opportunities

- T002, T003, T004 (different test files) can run in parallel
- T005, T007, T008 (different source files, no inter-dependencies) can run in parallel
- T009, T011, T013 (different test files) can run in parallel once Foundation is done
- T014 and T015 (different files) can run in parallel
- T020 (backend safety) can run in parallel with critique and gate work
- US3 test/implementation must wait for US2's same-file tasks (T013/T014)

---

## Parallel Example: Foundation Tests

```bash
Task: "Red: response parsing tests in frontend/src/lib/validation/clothing-response.test.ts"
Task: "Red: fetcher and hook tests in frontend/src/lib/api/clothing.test.ts"
Task: "Red: route builder tests in frontend/src/lib/routes.test.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Red: detail tests in frontend/src/components/clothing/ClothingDetailScreen.test.tsx"
# then after T013, in parallel:
Task: "Implement ClothingDetailScreen in frontend/src/components/clothing/ClothingDetailScreen.tsx"
Task: "Add routing-only server page in frontend/src/app/events/[eventId]/(tabs)/items/[itemId]/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (grid states verified, card `href` asserted)
4. Complete Phase 4: User Story 2 (full card tap-through verified)
5. **STOP and VALIDATE**: Test US1 + US2 end to end (the deployable MVP)
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Stories 1 + 2 → Test end to end → Deploy/Demo (MVP!)
3. Add User Story 3 → Test independently → Deploy/Demo
4. Add User Story 4 → Regression test green → Deploy/Demo
5. Each story adds value without breaking previous stories

### Single-Implementer Strategy (per AGENTS.md)

Run only one implementer at a time in this workspace: per task, `test-author` (Red) → `implementer-fe` (Green → Refactor) → `commit-reviewer` → commit. Never commit a Red state alone.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- `analysis` is never rendered in this feature (arrives in 018); no test may assert on it
- Grid refresh is focus regain (with `staleTime: 0`) + pull-to-refresh wired to `refetch`; no polling by design
- Detail shows all non-null response measurement fields (legacy-safe), never zeros
- The withdrawn detail keeps the disabled coming-soon button alongside the withdrawn badge
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
