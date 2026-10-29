---

description: "Task list for feature 006-close-event-frontend"
---

# Tasks: Close Event Frontend (Mobile)

**Input**: Design documents from `/specs/006-close-event-frontend/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-close-event.md](contracts/ui-close-event.md), [quickstart.md](quickstart.md)

**Tests**: Required (Constitution II).
- Every behavior's test task comes before the implementation task that covers it.
- Run each test and confirm it fails for the expected reason (Red) before implementing.
- Every assertion about **new** behavior must be Red on first run; if one passes, report it as a planning defect.
- **Regression guards** — assertions over unchanged 004 behavior (organizer gating, closed-event gating, token not rendered, P2 closed rendering) — are labelled `(regression guard)` in the task text and may pass on first run.
- Removing the 004 "coming soon" test (T014) is an intended behavior change (FR-001), not a skipped test.
- Focus movement, native back, and layout at 360–430 px are verified manually (Constitution III, frontend `testing.md`).

**Organization**: Tasks are grouped by user story (US1–US3 from spec.md). `ManageEventScreen.test.tsx` and `events.test.ts` grow across stories; each story adds a new `describe` block, and only `test-author` edits test files.

**Delegates** (AGENTS.md):
- Each task names its Paseo profile. The orchestrator never edits `frontend/`.
- Every test → implementation cycle ends with a `commit-reviewer` review and then a commit. Never commit a Red state alone.
- Test infrastructure with no product behavior goes `scaffolder` → `commit-reviewer` → commit (research R10). `frontend/vitest.setup.ts` is outside the `test-author` and `implementer-fe` allowed paths, so it is an explicit `scaffolder` exception.
- Checks for every cycle: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`.
- Implementers follow `frontend/AGENTS.md`: read the relevant guide in `frontend/node_modules/next/dist/docs/`, and inspect Astryx components first (`pnpm exec astryx component Dialog`, `DialogHeader`, `Banner`, `Button`).
- TanStack Query v5: `cancelQueries`/`invalidateQueries` take a filter object `{ queryKey: queryKeys.event(eventId), exact: true }`; never pass a bare key array (research R3).
- Give every delegate: plan.md, research.md, data-model.md, contracts/ui-close-event.md, `docs/plans/api/03-close-event.md`, `specs/005-close-event/contracts/close-event.openapi.yaml`, `docs/rules/dev/common/api-contract.md`, and `docs/rules/dev/frontend/`. Don't give them `docs/rules/dev/backend/`.
- Work on branch `feature/frontend-close-event` (created from `main`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US3 from spec.md
- **Paths**: all under `frontend/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch, baseline, and test infrastructure the later cycles need (research R4, R8, R10). Dependencies (TanStack Query, Astryx `Dialog`, Zod), routes, `parseEvent`, `EventScreenStatus`, and the closed banner already exist from features 002/004.

- [X] T001 Create branch `feature/frontend-close-event` from `main` and confirm the baseline passes: `cd frontend && pnpm lint && pnpm typecheck && pnpm test` — agent: orchestrator
- [X] T002 Test infrastructure — agent: `scaffolder` → `commit-reviewer` → commit:
  - Create `frontend/src/test/dialog-polyfill.ts`: only when missing on `HTMLDialogElement.prototype`, define `showModal()` and `show()` (set the `open` attribute), `close(returnValue?)` (remove `open`, set `returnValue`, dispatch a `close` event), and `requestClose(returnValue?)` (dispatch a cancelable `cancel` event; if not prevented, call `close(returnValue)`). No other behavior.
  - Import it from `frontend/vitest.setup.ts` after the jest-dom import.
  - In `frontend/src/test/render.tsx`, let `renderWithClient(ui, { queryClient }?)` accept an optional `QueryClient` (default: the existing fresh test client) and return it as `queryClient` alongside the existing result; existing callers stay unchanged.
  - Verify: `pnpm test` stays green with no test changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Timestamp validation, pure helpers, keys, and the close request/mutation that every story uses (R1–R3, R5). Three TDD cycles, F0–F2.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Cycle F0 — parseable timestamps (`lib/validation/event-response.ts`, R1, F06)

- [X] T003 Add to `frontend/src/lib/validation/event-response.test.ts`: a closed event with `closedAt: ''` and with `closedAt: 'not-a-date'` each make `parseEvent` throw `ApiError` with code `UNKNOWN_ERROR` and status 200; `createdAt: ''` and `createdAt: 'not-a-date'` likewise; `closedAt: '2026-10-27T09:00:00Z'` on a closed event still parses — agent: `test-author`
- [X] T004 In `frontend/src/lib/validation/event-response.ts`, require `createdAt` and non-null `closedAt` to satisfy `!Number.isNaN(Date.parse(value))` (data-model.md: "`createdAt` and non-null `closedAt` must be parseable timestamps"). Error message and logging unchanged. Makes T003 pass — agent: `implementer-fe`

### Cycle F1 — pure helpers (`lib/event.ts`, R3, R5)

- [X] T005 Add to `frontend/src/lib/event.test.ts` — agent: `test-author`:
  - "getCloseEventFailure" block: `ApiError(403, 'FORBIDDEN', …)` → `{ kind: 'forbidden' }`; `ApiError(401, 'UNAUTHENTICATED', …)` → `{ kind: 'no-access' }`; `ApiError(404, 'NOT_FOUND', …)` → `{ kind: 'not-found' }`; `ApiError(500, 'INTERNAL_ERROR', 'Server says no.')` → `{ kind: 'dialog', message: 'Server says no.' }`; `ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.')` → `dialog` with that message; `ApiError(200, 'UNKNOWN_ERROR', …)` → `dialog`; `ApiError(409, 'EVENT_CLOSED', …)` → `dialog`; `new Error('x')` → `{ kind: 'dialog', message: 'Something went wrong. Please try again.' }`.
  - "keepClosedEvent" block: `(undefined, active)` → equals active; `(active, active')` → equals `active'`; `(active, closed)` → equals closed; `(closed, closed')` → equals `closed'` (counts may change); `(closed, active)` → returns the **same object** as the previous closed event (data-model.md: "`closed` → `active` | stale read only | **no**"); `(x, deep-equal copy of x)` → returns `x` itself (default referential sharing kept).
- [X] T006 Implement in `frontend/src/lib/event.ts`: `getCloseEventFailure(error: unknown): CloseEventFailure` (type exactly as in data-model.md, message via `getFormErrorMessage`) and `keepClosedEvent(prev: unknown, next: unknown): unknown` (TanStack `structuralSharing` signature; returns `prev` when `prev` is a closed `Event` and `next` is an active `Event`, otherwise `replaceEqualDeep(prev, next)` from `@tanstack/react-query`). Makes T005 pass — agent: `implementer-fe`

### Cycle F2 — keys, close request, mutation, pending, stale-read guard (`lib/api/*`, R1–R3)

- [X] T007 Add to `frontend/src/lib/api/events.test.ts` — agent: `test-author`:
  - "closeEvent" block (mock `@/lib/api/client`): calls `apiFetch('e1', '/events/e1/close', { method: 'POST' }, { timeoutMs: 15000, timeoutMessage: 'The connection timed out. The event may already be closed; check again.' })`; encodes the ID (`'a/b'` → `/events/a%2Fb/close`); returns the parsed event for a valid closed organizer response; rejects with `ApiError` code `UNKNOWN_ERROR` (status 200) when the body is malformed, when `status` is `'active'`, or when `closedAt` is `null`; propagates `ApiError`s from `apiFetch` unchanged.
  - "useCloseEventMutation" block (`renderHook` with one `QueryClient` seeded with active events under `queryKeys.event('e1')` and `queryKeys.event('e2')`):
    - on success the `e1` cache holds the returned closed event and `e1` is invalidated afterwards;
    - an `e1` GET that is in flight when the mutation starts, and one started before the POST resolves and resolving after it with an active event, never replace the closed result;
    - `e2` is neither cancelled nor invalidated (exact filter);
    - on failure the cached `e1` active event is unchanged and `e1` is invalidated;
    - the mutation does not retry (`apiFetch` POST called once on a 500);
    - with the follow-up GET left pending, the mutation already reports success/error (`isSuccess`/`isError`) — it does not wait for the invalidation refetch;
    - `onSuccess`/`onSettled` effects still happen when the hook unmounts before the POST resolves.
  - "useIsCloseEventPending" block: `false` initially; `true` while an `e1` close POST is pending, including in a hook rendered after the first one unmounted (same client); `false` after it settles; unaffected by an `e2` close.
  - "useEventQuery structural sharing" block: with a closed event cached, a refetch that returns an active event leaves the cached data closed.
- [X] T008 Implement — agent: `implementer-fe`:
  - `frontend/src/lib/api/query-keys.ts`: add `mutationKeys = { closeEvent: (eventId: string) => ['events', eventId, 'close'] as const }`.
  - `frontend/src/lib/api/events.ts`: `closeEvent(eventId)` (R1: 15 s timeout, the timeout message above, `parseEvent`, then throw `ApiError(200, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')` unless `status === 'closed'`); `useCloseEventMutation(eventId)` with `mutationKey: mutationKeys.closeEvent(eventId)`, `retry: 0`, `onMutate` → `await cancelQueries({ queryKey: queryKeys.event(eventId), exact: true })`, `onSuccess(event)` → same `cancelQueries` then `setQueryData(queryKeys.event(eventId), event)`, `onSettled` → `void invalidateQueries({ queryKey: queryKeys.event(eventId), exact: true })` (not returned/awaited, R3 F12; callbacks on the hook options so they run after unmount); `useIsCloseEventPending(eventId)` via `useIsMutating({ mutationKey: mutationKeys.closeEvent(eventId), exact: true }) > 0`; add `structuralSharing: keepClosedEvent` to `useEventQuery`. Never log the token or entry code.
  - Makes T007 pass.

**Checkpoint**: close API, cache behavior, pending scope, and failure mapping are tested in isolation.

---

## Phase 3: User Story 1 — Organizer closes the event from M1 (Priority: P1) 🎯 MVP

**Goal**: [Close event] opens H3; confirming closes the event and M1/P2 show the closed state immediately.

**Independent Test**: Create an event, M1 → [Close event] → confirm in H3; M1 shows the closed banner with closure time, the "Closed" label, counts, no [Close event], "Event closed"; P2 shows "Closed" without waiting for a poll (quickstart rows 1–4, 12).

### Cycle US1a — H3 dialog component (R4)

- [X] T009 [US1] Create `frontend/src/components/event/CloseEventDialog.test.tsx` rendering the **real** Astryx `Dialog` (shim from T002; do not mock `@astryxdesign/core/Dialog`) — agent: `test-author`. Props `{ isOpen, onOpenChange, onConfirm, isPending, errorMessage? }` (contracts/ui-close-event.md H3):
  - closed: no dialog in the accessibility tree.
  - open: `getByRole('dialog', { name: 'Close this event?' })` contains exactly the description "Closing ends the exchange corner for everyone. Participants can no longer register clothes or make exchanges. This can't be undone.", does **not** contain the word "proposal", and has a [Close event] button and a [Cancel] button with [Close event] before [Cancel] in DOM order.
  - [Cancel] calls `onOpenChange(false)` and not `onConfirm`; Escape calls `onOpenChange(false)`.
  - [Close event] calls `onConfirm` once.
  - `isPending`: [Close event] and [Cancel] are disabled or `aria-busy`; clicking them and pressing Escape call neither `onConfirm` nor `onOpenChange(false)`.
  - `errorMessage="Server says no."`: shown inside the dialog within a `role="alert"` element; absent when `errorMessage` is undefined.
- [X] T010 [US1] Implement `frontend/src/components/event/CloseEventDialog.tsx` (`'use client'`) with Astryx `Dialog` (`purpose="info"`, so Escape and backdrop dismiss when idle) and `DialogHeader` from `@astryxdesign/core/Dialog` (title only, no close button), description `Text`, `role="alert"` wrapper around an error `Banner` when `errorMessage` is set, destructive full-width [Close event] (`isLoading={isPending}`) above ghost full-width [Cancel]; ignore `onOpenChange(false)` while `isPending`. Makes T009 pass — agent: `implementer-fe`

### Cycle US1b — M1 close flow (cache-connected)

- [X] T011 [US1] Add a "US1 close event" `describe` to `frontend/src/components/event/ManageEventScreen.test.tsx` — agent: `test-author`. In this block, do **not** mock `@/lib/api/events`; mock only `@/lib/api/client` (`apiFetch`, already mocked in the file — restructure mocks so this block uses the real `useEventQuery`/`useCloseEventMutation`, e.g. a separate test file `ManageEventScreen.close.test.tsx` if module-level mocks conflict) and pass one `QueryClient` via `renderWithClient(ui, { queryClient })`. `apiFetch` returns the active organizer event for GET and the closed event for POST:
  - State label (F13): with the active event, M1 shows the text "Active" under the "Manage event" heading; with a closed event (render with the closed event cached), it shows "Closed".
  - Clicking [Close event] opens the dialog "Close this event?" and sends no POST.
  - [Cancel] closes the dialog; no POST; [Close event] still shown on M1.
  - Confirm: exactly one POST to `/events/e1/close`; while pending the confirm button is disabled/busy.
  - After the POST resolves (follow-up GET left pending): dialog gone, the `role="status"` region reads "Event closed", the state label reads "Closed", [Close event] not rendered, counts shown exactly as returned, and the query cache holds the closed event.
  - Reopen reset (F02): first POST rejects with `ApiError(500, 'INTERNAL_ERROR', 'Server says no.')`; [Cancel]; [Close event] again → the reopened dialog has no `role="alert"`.
  - Remount (F04): confirm with the POST left pending, unmount M1, render it again with the same client → [Close event] is disabled/busy and clicking it sends no second POST; `apiFetch` POST calls total 1.
  - (regression guard) Regular participant and closed event: no [Close event] button.
  - (regression guard) The token never appears in the rendered output.
- [X] T012 [US1] Update `frontend/src/components/event/ManageEventScreen.tsx`: remove `showCloseNotice` and the "Closing the event is coming soon." text (R7); add an Astryx `Badge` state label under the heading/event name — `label={closed ? 'Closed' : 'Active'}`, `variant={closed ? 'neutral' : 'success'}`, same as `EventHomeScreen` (FR-009); add `useState` for dialog visibility; [Close event] opens `CloseEventDialog` and calls `mutation.reset()` on open, disabled while `useIsCloseEventPending(eventId)`; H3 gets `isPending` from `useIsCloseEventPending`; confirm calls `mutation.mutate()`; on success close the dialog, set the always-mounted `role="status"` region to "Event closed" (R6), and move focus to the "Manage event" heading (`tabIndex={-1}`, R9). Makes T011 pass — agent: `implementer-fe`
- [X] T013 [US1] (regression guard) Add to `frontend/src/components/event/EventHomeScreen.test.tsx` (or a new `EventHomeScreen.cache.test.tsx` if the file's module-level `useEventQuery` mock conflicts): with the real `useEventQuery`, `apiFetch` mocked, and one `QueryClient` passed to `renderWithClient`, render P2 with an active event, then `queryClient.setQueryData(queryKeys.event('e1'), closedEvent)` (as `useCloseEventMutation` does) → P2 shows "Closed" and no [Register my clothes] before any further GET resolves. Expected to pass against existing 004 code — agent: `test-author`
- [X] T014 [US1] In `frontend/src/components/event/ManageEventScreen.test.tsx`, delete the 004 test "announces that closing is coming soon without making a request" — superseded by T011 (spec FR-001) — agent: `test-author` (same commit as T012)

**Checkpoint**: US1 demoable end to end against the real backend.

---

## Phase 4: User Story 2 — Closure failures are recoverable (Priority: P1)

**Goal**: Failures never show a false closed state; each failure has a clear message and next action; a server-confirmed closed state takes precedence.

**Independent Test**: Simulate connection failure, 500, malformed 200, 401, 403, 404 during confirm, plus a closed reload after a failure; verify message, remaining state, and retry (quickstart rows 5, 5b, 7, 8).

### Tests for User Story 2 (REQUIRED - write first) ⚠️

- [ ] T015 [US2] Add a "US2 close failures" `describe` to the cache-connected M1 test file from T011 — agent: `test-author`:
  - `NETWORK_ERROR`, `INTERNAL_ERROR` (server message "Server says no."), and `UNKNOWN_ERROR` (POST returns an active event): with the follow-up GET returning the **active** event, the dialog stays open with the message in `role="alert"`, M1 still shows [Close event] behind it and no "Event closed"; confirming again sends a second POST (retry).
  - `FORBIDDEN`: dialog closes; M1 shows "Only the organizer can manage this event." with [Back to home] linking to `/events/e1`; no counts.
  - `UNAUTHENTICATED`: "You haven't joined this event on this device." with [Join with entry code] and [Go to start].
  - `NOT_FOUND`: "This event could not be found." with [Go to start].
  - Precedence after failure (F05): POST rejects with `NETWORK_ERROR` and the follow-up GET returns the **closed** event → dialog and error disappear and the closed state is shown (no [Close event]).
  - Precedence while open (F05): with H3 open and idle, the event query receives a closed event (`setQueryData` or a resolved poll) → the dialog closes.

### Implementation for User Story 2

- [ ] T016 [US2] In `frontend/src/components/event/ManageEventScreen.tsx`: derive `getCloseEventFailure(mutation.error)` when `mutation.isError`; `dialog` → pass `errorMessage` to `CloseEventDialog`; `forbidden` → render the existing non-organizer view; `no-access`/`not-found` → render `EventScreenStatus` with that kind; close the dialog for screen-level kinds. Render H3 only when `isDialogOpen && !isClosed(event)`, and when the event becomes closed while the dialog is open or the mutation is in error, close the dialog and call `mutation.reset()` (R5). Move focus per R9. Makes T015 pass — agent: `implementer-fe`

**Checkpoint**: All FR-007 mappings and closed-state precedence verified.

---

## Phase 5: User Story 3 — Already-closed event is handled gracefully (Priority: P2)

**Goal**: A repeated or stale close shows the closed state with the server's original closure time, never an error.

**Independent Test**: Two tabs on M1; close in A, confirm in B → B shows the closed state with A's closure time (quickstart row 6).

### Tests for User Story 3 (REQUIRED - write first) ⚠️

- [ ] T017 [US3] Add a "US3 already closed" `describe` to the cache-connected M1 test file — agent: `test-author`:
  - M1 showing an active event; the POST resolves with a closed event whose `closedAt` is `'2026-10-27T09:00:00Z'` (earlier than "now"): no error, "Event closed" status, and the cache holds that event's `closedAt` unchanged.
  - (regression guard) The query result switches from active to closed via a poll with no dialog open: [Close event] disappears without any user action.

### Implementation for User Story 3

- [ ] T018 [US3] Adjust `frontend/src/components/event/ManageEventScreen.tsx` only if a non-guard T017 case fails. If every case passes on first run, record in the commit message that US3 is covered by US1/US2 behavior (no code change) — agent: `implementer-fe`

**Checkpoint**: All stories complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T019 Run `cd frontend && pnpm exec astryx doctor --built` and fix any findings in `CloseEventDialog.tsx` and `ManageEventScreen.tsx` — agent: `implementer-fe`
- [ ] T020 Run the full suites and record the actual results: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`, and `cd backend && uv run ruff format --check --no-cache . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest` (backend unchanged; confirms nothing regressed) — agent: orchestrator
- [ ] T021 Manual verification per quickstart.md rows 1–12 at 360 px and 430 px (no horizontal scroll, touch targets ≥ 44×44 px, English copy, focus targets per R9, native back gesture, one POST under throttling, tap count and seconds for SC-001, no token/entry code in console) and record results in the PR description — agent: orchestrator with the user
- [ ] T022 Run `pr-reviewer` on `main..HEAD` before creating the PR (AGENTS.md "Code Review") — agent: `pr-reviewer`

---

## Dependencies & Execution Order

- **T001 → T002** (test infra) → **F0 (T003–T004)** → **F1 (T005–T006)** → **F2 (T007–T008)** (F2 imports `keepClosedEvent`; F0 tightens the schema `closeEvent` relies on).
- **US1**: US1a (T009–T010) needs T002 only and may start after it; US1b (T011–T014) needs F2 and US1a.
- **US2 (T015–T016)** needs US1b (same test file and screen).
- **US3 (T017–T018)** needs US1b; run after US2 because both edit the same test file.
- **Polish** after all stories.

## Parallel Opportunities

- Only one implementer per workspace at a time (AGENTS.md). No task is marked `[P]`: every cycle depends on the previous one or shares `ManageEventScreen.*`.
- With a second Paseo workspace, US1a (T009–T010, new files only) can run alongside F0–F2 once T002 is merged.

### Parallel example: second workspace

```text
workspace A: T002 (scaffolder) → commit
             T003 → T004 → commit;  T005 → T006 → commit;  T007 → T008 → commit
workspace B (after T002): test-author T009 → implementer-fe T010 → commit-reviewer → commit
then A (after merging B): T011–T014 → T015–T016 → T017–T018
```

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 → organizer can close the event and every screen shows it. Demoable on its own.
2. **+ US2**: recoverable failures, screen-level states, and closed-state precedence (completes the P1 scope).
3. **+ US3**: repeated/stale closes confirmed by tests.
4. Polish, full checks, manual verification, PR review.
