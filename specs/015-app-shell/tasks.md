# Tasks: 015 App Shell — Landing Event List and Bottom Tabs

**Input**: Design documents from `/specs/015-app-shell/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED (TDD, see constitution) - write them first and confirm they FAIL before implementation. UI-only screens are verified manually per `docs/rules/dev/frontend/testing.md`; each such phase states why.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. Delegation per task cycle: test task → Paseo `test-author` (Red), implementation task → Paseo `implementer-fe` (Green → Refactor), then `commit-reviewer` → commit. Pure boilerplate with no behavior may run `scaffolder` → `commit-reviewer` → commit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm clean starting point on the feature branch

- [X] T001 Verify branch `impeccable-init-feature-015` is up to date with `origin/main` and `PRODUCT.md` plus `specs/015-app-shell/` are committed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Session storage and route builders every story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Test session extensions in `frontend/src/lib/session.test.ts` (savedAt ordering newest-first, legacy records without savedAt sort last, `removeEventSession` deletes only its key)
- [X] T003 Implement `savedAt` schema field plus `listAllEventSessions` and `removeEventSession` in `frontend/src/lib/session.ts` (depends on T002)
- [X] T004 [P] Test `search`, `trades`, `myItems` builders in `frontend/src/lib/routes.test.ts` (path shape and `encodeURIComponent` of event IDs)
- [X] T005 [P] Implement `search`, `trades`, `myItems` builders in `frontend/src/lib/routes.ts` (depends on T004)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Returning participant reopens a joined event (Priority: P1) 🎯 MVP

**Goal**: Landing shows "Your events" (name + Active/Closed, newest first); tapping opens the event home; dead entries are removed; Create/Join remain

**Independent Test**: Seed two sessions, load `/`, verify list content/order/navigation; revoke one session, reload, verify it disappears (see `quickstart.md` scenario 1)

### Tests for User Story 1 (REQUIRED - write first) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T006 [US1] Component test for `YourEventsList` in `frontend/src/components/event/YourEventsList.test.tsx` (renders names and Active/Closed states newest-first; removes entries whose query fails with `UNAUTHENTICATED`/`NOT_FOUND`; retains transiently failing entries with unknown state plus retry; wrap in `renderWithClient` with `vi.mock` of `frontend/src/lib/api/events.ts`, query by role/text, interact via `userEvent`)

### Implementation for User Story 1

- [X] T007 [US1] Implement `YourEventsList` in `frontend/src/components/event/YourEventsList.tsx` (one non-polled query per session via `useQueries`, terminal 401/404 handling with `shouldRetryEventQuery`, transient failures retained with unknown state and retry, client-only behind mounted check; depends on T002, T003, T006)
- [X] T008 [US1] Wire "Your events" section above Create/Join actions in `frontend/src/components/event/LandingScreen.tsx` (depends on T007)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Navigating inside an event with bottom tabs (Priority: P2)

**Goal**: Every in-event screen except Created/share shows Home | Search | Trades | My items with highlight; Search/Trades show "Coming soon"; My items placeholder links to the registration form

**Independent Test**: Open each in-event route, verify tab presence/order/highlight and placeholder content (see `quickstart.md` scenario 2); no automated test for the static placeholder content (UI-only, verified manually with screenshots); closed-state guards covered by T010

### Tests for User Story 2 (REQUIRED - write first) ⚠️

- [X] T009 [US2] Unit test for tab-active derivation in `frontend/src/components/ui/BottomTabBar.test.ts(x)` (pathname → active tab for home, search, trades, my-items and nested paths)

- [X] T010 [US2] Test closed-event guards in `frontend/src/components/ui/ClosedEventGuards.test.ts(x)` (tabs stay readable, Manage menu entry and `[+ Register item]` hidden when status is closed; Red first)

### Implementation for User Story 2

- [X] T011 [US2] Implement `BottomTabBar` in `frontend/src/components/ui/BottomTabBar.tsx` (Astryx `TabList`/`Tab` with `href` links, `layout="fill"`, `size="lg"`; depends on T009)
- [X] T012 [US2] Create tab layout with header-menu slot in `frontend/src/app/events/[eventId]/(tabs)/layout.tsx` (depends on T011)
- [X] T013 [P] [US2] Create Search "Coming soon" page in `frontend/src/app/events/[eventId]/(tabs)/search/page.tsx` (static UI, verified manually; depends on T012)
- [X] T014 [P] [US2] Create Trades "Coming soon" page in `frontend/src/app/events/[eventId]/(tabs)/trades/page.tsx` (static UI, verified manually; depends on T012)
- [X] T015 [P] [US2] Create My items placeholder page in `frontend/src/app/events/[eventId]/(tabs)/my-items/page.tsx` (`[+ Register item]` links to the existing registration form and is hidden when the event is closed, covered by T010; static UI otherwise, verified manually; depends on T012)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Organizer opens event management from the header menu (Priority: P3)

**Goal**: Manage event reachable from a header menu for organizers only; Home has no Manage card

**Independent Test**: Open the event as organizer (menu entry present, opens management) and as non-organizer (no entry); Home shows no Manage card (see `quickstart.md` scenario 3); closed event hides the entry (quickstart scenario 4)

### Tests for User Story 3 (REQUIRED - write first) ⚠️

- [X] T016 [US3] Unit test for organizer-menu visibility rule in `frontend/src/components/ui/EventHeaderMenu.test.tsx` (`me.participantId === organizerParticipantId` and event status active shows the entry, hidden otherwise including closed events), update `frontend/src/components/event/EventHomeScreen.test.tsx` (replace the obsolete Manage-card expectation with the new Home behavior), and extend tab-active derivation tests in `frontend/src/components/ui/BottomTabBar.test.ts(x)` (manage route → no tab highlighted)

### Implementation for User Story 3

- [X] T017 [US3] Implement `EventHeaderMenu` in `frontend/src/components/ui/EventHeaderMenu.tsx` (Astryx `MoreMenu`, `presentation="adaptive"`, single Manage item, hidden when the event is closed; depends on T016)
- [X] T018 [US3] Wire header menu into `frontend/src/app/events/[eventId]/(tabs)/layout.tsx` (header slot deferred from T012), define manage-route active-tab behavior in `frontend/src/components/ui/BottomTabBar.tsx` (no tab highlighted on manage), and remove the Manage card block in `frontend/src/components/event/EventHomeScreen.tsx` (depends on T017)

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification, design review, and PR readiness

- [X] T019 Run full frontend checks in `frontend/package.json` (`cd frontend && pnpm lint && pnpm typecheck && pnpm test` — verified by orchestrator 2026-11-02: 0 errors, typecheck pass, 574/574)
- [X] T020 [P] Run `quickstart.md` scenarios 1–4 end to end including the closed-event pass (verified manually 2026-11-02 on worktree build :3002 + isolated backend :8001: landing list/order/dead-cleanup, tabs/placeholders, organizer menu navigation, closed-state hiding)
- [X] T021 [P] Verify `frontend/src/components/event/LandingScreen.tsx` and `frontend/src/components/ui/BottomTabBar.tsx` at 360–430 px widths with screenshots and run `/impeccable critique` on both (6 screenshots captured; critique 31/40 Good, snapshot persisted; degraded single-context run)

---

## Phase 7: Critique Follow-ups (from T021, scope approved 2026-11-02: all)

**Purpose**: Fix the 5 critique findings; tab-bar docking first

- [X] T022 [P] Dock the tab bar in `frontend/src/components/ui/BottomTabBar.tsx` and/or `frontend/src/app/events/[eventId]/(tabs)/layout.tsx` (sticky bottom + `env(safe-area-inset-bottom)` padding; UI-only, verified manually at 390 px with a long page)
- [X] T023 Test landing loading state in `frontend/src/components/event/YourEventsList.test.tsx` (pending queries render a skeleton/loading indicator in the list region, no pop-in of the section; Red first)
- [X] T024 [P] Closed-aware empty-state copy in `frontend/src/components/clothing/MyItemsPlaceholderScreen.tsx` ("Register your first item" hidden or reworded when closed; update any exact-copy assertions)
- [X] T025 [P] Fix doubled accessible tab names in `frontend/src/components/ui/BottomTabBar.tsx` (diagnosed as Astryx aria-hidden sizer artifact, no app fix; documented in review)
- [X] T026 [P] Render the header landmark only with the menu in `frontend/src/app/events/[eventId]/(tabs)/layout.tsx` (empty:hidden hides it; removed from a11y tree when empty)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Tab layout hosts the US3 header menu slot; independently testable
- **User Story 3 (P3)**: Depends on the `(tabs)/layout.tsx` header slot from US2 (T012) - Must wire into the US2 layout; independently testable once wired

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Pure logic and helpers before components
- Shared chrome (layout, tab bar) before placeholder pages
- US3 menu must exist before the Home Manage card is removed
- Story complete before moving to next priority

### Parallel Opportunities

- T004/T005 (route builders) can run in parallel with T002/T003 (session) - different files
- T013/T014/T015 (placeholder pages) can run in parallel once T012 lands - different files
- T020/T021 (manual validation, critique) can run in parallel once implementation is done
- US1 and US2 implementation can proceed in parallel after Foundational (different files; US3 must wait for the T012 slot)

---

## Parallel Example: Foundational Phase

```bash
# Test tasks for the foundation together (different files):
Task: "Test session extensions in frontend/src/lib/session.test.ts"
Task: "Test search, trades, myItems builders in frontend/src/lib/routes.test.ts"

# Implementation follows each test (same files, sequential per file):
Task: "Implement savedAt plus listAllEventSessions and removeEventSession in frontend/src/lib/session.ts (depends on T002)"
Task: "Implement search, trades, myItems builders in frontend/src/lib/routes.ts (depends on T004)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently (quickstart scenario 1)
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Demo (MVP!)
3. Add User Story 2 → Test independently → Demo
4. Add User Story 3 → Test independently → Demo
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each test→implement cycle following `commit-reviewer` review
- No backend changes in any task; `git status` at PR time must show only `frontend/` and `specs/` paths
- Static placeholder pages (T013–T015) carry no automated tests for their content by intent: UI-only, verified manually with screenshots per `docs/rules/dev/frontend/testing.md`; their closed-state guards are covered by T010
- If implementation deviates from `docs/plans/api/` or the AI features doc, update those docs in the same PR per the feature-plans README
