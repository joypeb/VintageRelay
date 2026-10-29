---

description: "Task list for feature 004-read-event-frontend"
---

# Tasks: Read Event Frontend (Mobile)

**Input**: Design documents from `/specs/004-read-event-frontend/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-screens.md](contracts/ui-screens.md), [quickstart.md](quickstart.md)

**Tests**: Required (Constitution II).
- Every behavior's test task comes before the implementation task that covers it.
- Run each test and confirm it fails for the expected reason (Red) before implementing.
- No new test listed here may pass on first run. If one does, report it as a planning defect. Moved tests (T018) and kept H2 assertions are the only exceptions; they must still pass after refactoring.
- UI-only wiring with no logic (route `page.tsx`/`layout.tsx` files, the event `error.tsx`) has no automated test. It is verified manually at 360–430 px (Constitution III, frontend `testing.md`).

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md). `EventHomeScreen.test.tsx` and `ManageEventScreen.test.tsx` grow across stories; each story adds a new `describe` block, and only `test-author` edits test files.

**Delegates** (AGENTS.md):
- Each task names its Paseo profile. The orchestrator never edits `frontend/`.
- Every test → implementation cycle ends with a `commit-reviewer` review and then a commit. Boilerplate goes `scaffolder` → `commit-reviewer` → commit. Never commit a Red state alone.
- Checks for every cycle: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`.
- Implementers follow `frontend/AGENTS.md`: read the relevant guide in `frontend/node_modules/next/dist/docs/`, and use Astryx components (`pnpm exec astryx component <Name>`) for `Banner`, `Card`/`ClickableCard`, `Badge`, `Skeleton`.
- Give every delegate: plan.md, research.md, data-model.md, contracts/ui-screens.md, `specs/003-read-event/contracts/read-event.openapi.yaml`, `docs/rules/dev/common/api-contract.md`, and `docs/rules/dev/frontend/`. Don't give them `docs/rules/dev/backend/`.
- Work on branch `feature/frontend-read-event` (created from `main`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 from spec.md
- **Paths**: all under `frontend/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Boilerplate with no behavior. No tests; `scaffolder` → `commit-reviewer` → commit.

- [X] T001 Create `frontend/src/lib/api/query-keys.ts` exporting `queryKeys = { event: (eventId: string) => ['events', eventId] as const }` exactly as in `docs/rules/dev/frontend/data-fetching.md` §3 (only the `event` key; R1) — agent: `scaffolder`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Client timeout message, routes, session presence, date formatting, response validation, the event query, and the screen-state mapper, which every story uses (R1–R5, R7, R9). Five TDD cycles, F1–F5.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Cycle F1 — per-call timeout message (`lib/api/client.ts`, R2)

- [X] T002 Update tests — agent: `test-author`:
  - `frontend/src/lib/api/client.test.ts`: the existing timeout case changes to: with `{ timeoutMs: 15000 }` and no `timeoutMessage`, a `DOMException('t', 'TimeoutError')` rejects with `ApiError(0, 'NETWORK_ERROR', 'The connection timed out. Please try again.')`. Add: with `{ timeoutMs: 15000, timeoutMessage: 'Custom.' }` it rejects with message `'Custom.'`.
  - `frontend/src/lib/api/events.test.ts`: `createEvent` must call `apiFetch(null, '/events', { method: 'POST', body: JSON.stringify(body) }, { timeoutMs: 15000, timeoutMessage: "The connection timed out. Your event may have been created; if you don't see it, create it again." })`.
- [X] T003 Add optional `timeoutMessage?: string` to `apiFetch` options in `frontend/src/lib/api/client.ts` (default `'The connection timed out. Please try again.'`), and pass the create-specific message from `createEvent` in `frontend/src/lib/api/events.ts`. H1 behavior is unchanged. Makes T002 pass — agent: `implementer-fe`

### Cycle F2 — routes, session presence, date (`lib/routes.ts`, `lib/session.ts`, `lib/utils/date.ts`)

- [X] T004 [P] Add to `frontend/src/lib/routes.test.ts`: `routes.manageEvent('e1')` returns `/events/e1/manage`, and `routes.manageEvent('a/b')` returns `/events/a%2Fb/manage` — agent: `test-author`
- [X] T005 [P] Add to `frontend/src/lib/session.test.ts` a "hasEventSession" block: `true` after `saveEventSession('e1', { participantToken: 't1', participantId: 'p1' })`; `false` for an unknown event, invalid JSON, or an empty `participantToken` — agent: `test-author`
- [X] T006 [P] Write `frontend/src/lib/utils/date.test.ts` for `formatDateTime(iso, locale = 'en-US', timeZone?)`: `formatDateTime('2026-10-27T09:00:00Z', 'en-US', 'UTC')` returns `'Oct 27, 2026, 9:00 AM'`; with `'Asia/Seoul'` it returns `'Oct 27, 2026, 6:00 PM'` (`dateStyle: 'medium'`, `timeStyle: 'short'`, R9). Compare after replacing `\s` with a plain space, because some ICU versions put U+202F before AM/PM — agent: `test-author`
- [X] T007 Implement `routes.manageEvent(eventId)` in `frontend/src/lib/routes.ts` (encode with `encodeURIComponent`), `hasEventSession(eventId): boolean` (= `getEventSession(eventId) !== null`) in `frontend/src/lib/session.ts`, and `formatDateTime` in `frontend/src/lib/utils/date.ts` using `Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone })`. Makes T004–T006 pass — agent: `implementer-fe`

### Cycle F3 — response validation (`lib/validation/event-response.ts`, R3)

- [X] T008 Write `frontend/src/lib/validation/event-response.test.ts` for `parseEvent(data: unknown): Event`. Use a valid organizer fixture (`me.participantId === organizerParticipantId`, `stats: { participantCount: 1, availableClothingCount: 0, confirmedExchangeCount: 0 }`) and a valid regular fixture (`stats: null`, `me.isOrganizer: false`). It covers — agent: `test-author`:
  - Both fixtures return an equal `Event`; a closed fixture (`status: 'closed'`, `closedAt: '2026-10-27T09:00:00Z'`) is accepted.
  - Each of these throws `ApiError` with `status 200`, `code 'UNKNOWN_ERROR'`, message `'Something went wrong. Please try again.'`: `null`; missing `name`; `status: 'archived'`; `status: 'closed'` with `closedAt: null`; organizer with `stats: null`; a negative or non-integer count; `me` missing `displayName`.
- [X] T009 Implement `frontend/src/lib/validation/event-response.ts`: Zod `eventSchema` mirroring `src/types/event.ts` (counts `z.number().int().nonnegative()`), refinements "`status === 'closed'` ⇒ `closedAt` is a string" and "`me.participantId === organizerParticipantId` ⇒ `stats !== null`", and `parseEvent` that throws the `ApiError` above on failure. No `as` casts. Makes T008 pass — agent: `implementer-fe`

### Cycle F4 — event query (`lib/api/events.ts`, R1)

- [X] T010 Add to `frontend/src/lib/api/events.test.ts` (mock `./client`) — agent: `test-author`:
  - "getEvent": calls `apiFetch('e1', '/events/e1', {}, { timeoutMs: 15000 })` and returns the parsed `Event`; `getEvent('a/b')` uses path `/events/a%2Fb`; a malformed body rejects with `ApiError` code `UNKNOWN_ERROR`.
  - "shouldRetryEventQuery(failureCount, error)": returns `false` for `ApiError` codes `UNAUTHENTICATED`, `NOT_FOUND`, and `UNKNOWN_ERROR` with status 200; for `NETWORK_ERROR` and `INTERNAL_ERROR` returns `true` when `failureCount < 1` and `false` at `1`.
  - "useEventQuery" (via `renderHook` with a `wrapper` that provides a fresh `QueryClient({ defaultOptions: { queries: { retry: false } } })`): with `{ enabled: false }` it never calls `apiFetch`; with `{ enabled: true }` it resolves to the event; the query uses `queryKeys.event('e1')`.
  - "eventRefetchInterval(query)": returns `30000` when `query.state.data` is undefined or `status: 'active'`, and `false` when `status: 'closed'` (`data-fetching.md` §4 "stop polling once state can no longer change").
- [X] T011 Implement in `frontend/src/lib/api/events.ts`: `getEvent(eventId)` (`apiFetch<unknown>(eventId, `/events/${encodeURIComponent(eventId)}`, {}, { timeoutMs: 15_000 })` → `parseEvent`), exported `shouldRetryEventQuery` and `eventRefetchInterval`, and `useEventQuery(eventId, { enabled })` with `queryKey: queryKeys.event(eventId)`, `refetchInterval: eventRefetchInterval`, `retry: shouldRetryEventQuery`. Makes T010 pass — agent: `implementer-fe`

### Cycle F5 — screen state and organizer helpers (`lib/event.ts`, R4, R5)

- [X] T012 Write `frontend/src/lib/event.test.ts` — agent: `test-author`:
  - `isOrganizer(event)` is `true` iff `event.me.participantId === event.organizerParticipantId`; `isClosed(event)` is `true` iff `status === 'closed'`.
  - `getEventScreenState({ hasSession, data, error, isPending })`, first match wins:
    - `hasSession: false` → `{ kind: 'no-access' }` (even with data or error).
    - error `ApiError(401, 'UNAUTHENTICATED', …)` → `no-access`, also when stale `data` is present.
    - error `ApiError(404, 'NOT_FOUND', …)` → `{ kind: 'not-found' }`.
    - data present (with or without a later `NETWORK_ERROR`) → `{ kind: 'ready', event }`.
    - error `ApiError(500, 'INTERNAL_ERROR', 'Server message.')`, no data → `{ kind: 'error', message: 'Server message.' }`; a non-`ApiError` → message `'Something went wrong. Please try again.'`.
    - no data, no error → `{ kind: 'loading' }`.
- [X] T013 Implement `frontend/src/lib/event.ts` with `isOrganizer`, `isClosed`, and `getEventScreenState` returning the discriminated union in data-model.md §4. Messages come from `getFormErrorMessage`. Makes T012 pass — agent: `implementer-fe`

**Checkpoint**: Foundation ready. Run the checks; commit F1–F5 separately after `commit-reviewer` (T001 with F1 is fine if reviewed together).

---

## Phase 3: User Story 1 — Participant sees the event home (Priority: P1) 🎯 MVP

**Goal**: P2 loads the event and shows the banner (name, Active/Closed badge, "You: {name}" + "(Organizer)"), the organizer-only Manage card, and [Register my clothes].

**Independent Test**: quickstart §3 rows 1 and 3. With `useEventQuery` mocked, organizer data shows the card; regular data does not; pending shows a skeleton and no event name.

### Tests for User Story 1 (REQUIRED - write first) ⚠️

- [X] T014 [US1] Write `frontend/src/components/event/EventHomeScreen.test.tsx`, block "US1 home". Seed `localStorage` with `saveEventSession('e1', …)`; mock `@/lib/api/events` `useEventQuery` to return controlled `{ data, error, isPending, isFetching, refetch }`; render with `renderWithClient`. It covers — agent: `test-author`:
  - Organizer, active: heading with the exact event name; text "Active"; text "You: Mina (Organizer)"; a link "Manage event" to `/events/e1/manage` with text "View QR, entry code, and event counts"; a link "Register my clothes" to `/events/e1/my-items/new`.
  - Regular participant ("Joon", `stats: null`): "You: Joon" without "(Organizer)"; no "Manage event" link; no count text.
  - Pending: an element with `aria-busy="true"` and no event name text.
  - `useEventQuery` was called with `('e1', { enabled: true })`.
  - The rendered output never contains the token `t1`.

### Implementation for User Story 1

- [X] T015 [US1] Implement `frontend/src/components/event/EventHomeScreen.tsx` (`'use client'`, prop `eventId`): mount guard with `useSyncExternalStore` (as `EventCreatedScreen`), `hasEventSession` after mount, `useEventQuery(eventId, { enabled: hasSession })`, `getEventScreenState`. `loading` → Astryx `Skeleton` inside an `aria-busy="true"` region; `ready` → contracts/ui-screens.md "P2 Home" using Astryx `Heading`, `Badge`, `Text`, `ClickableCard` (or `Card` + link) for "Manage event" gated by `isOrganizer`, and `Button` "Register my clothes" → `routes.newItem`. Other states may render `null` until US4. Makes T014 pass — agent: `implementer-fe`
- [X] T016 [US1] Replace the placeholder in `frontend/src/app/events/[eventId]/(tabs)/page.tsx` with a server component that awaits `params: Promise<{ eventId: string }>` and renders `<EventHomeScreen eventId={eventId} />` — agent: `implementer-fe`

**Checkpoint**: H2 [Go home] → real P2 (spec US1 scenario 5). Commit T014–T016 as one cycle after `commit-reviewer`.

---

## Phase 4: User Story 2 — Organizer opens the manage screen (Priority: P1)

**Goal**: M1 shows the shared share card, three counts, [Refresh], and a placeholder [Close event] for the organizer; non-organizers see "Only the organizer can manage this event."

**Independent Test**: quickstart §3 rows 2, 3, 9.

### Cycle US2a — extract `EventShareCard` (R8)

- [X] T017 [P] [US2] Write `frontend/src/components/event/EventShareCard.test.tsx` by moving the QR, entry code, copy success, and manual-fallback cases from `EventCreatedScreen.test.tsx`, rendering `<EventShareCard name entryCode entryUrl />` directly: QR `role="img"` named "QR code to join {name}" with `QRCodeSVG` `value` exactly `entryUrl`; exact entry code visible; "Copy link" → `writeText(entryUrl)` and "Link copied" inside `role="status"`; rejected or missing clipboard → read-only textbox with `entryUrl` and "Copy this link manually." — agent: `test-author`
- [X] T018 [US2] Update `frontend/src/components/event/EventCreatedScreen.test.tsx`: remove the moved copy cases; keep heading, event name, share text, notice, links, no-data guidance, no-token assertions, and keep asserting the QR (`role="img"`) and entry code are present (now via the card) — agent: `test-author`
- [X] T019 [US2] Create `frontend/src/components/event/EventShareCard.tsx` (`'use client'`) by moving the QR (keep the fixed-color comment from H2), entry code, copy state `idle | copied | manual`, and fallback from `EventCreatedScreen.tsx`; make H2 render `<EventShareCard {...share} />`. No behavior change. Makes T017–T018 pass — agent: `implementer-fe`

### Cycle US2b — M1 screen

- [X] T020 [US2] Write `frontend/src/components/event/ManageEventScreen.test.tsx`, block "US2 manage" (same mocking approach as T014; mock `qrcode.react`) — agent: `test-author`:
  - Organizer, active, stats `{ participantCount: 3, availableClothingCount: 0, confirmedExchangeCount: 2 }`: heading "Manage event"; the event name; the share card (QR img + entry code); "Participants" 3, "Available garments" 0, "Confirmed exchanges" 2 shown exactly; link "Back to home" → `/events/e1`.
  - "Refresh" calls `refetch` once; while `isFetching` it is busy (`aria-busy="true"`) and not clickable again.
  - "Close event" is visible; clicking it shows "Closing the event is coming soon." and makes no `apiFetch`/mutation call.
  - Regular participant: "Only the organizer can manage this event."; link "Back to home" → `/events/e1`; no count labels, no QR, no entry code.
  - The rendered output never contains the token `t1`.
- [X] T021 [US2] Implement `frontend/src/components/event/ManageEventScreen.tsx` (`'use client'`, prop `eventId`) per contracts/ui-screens.md "M1 Manage event": same mount guard/session/query/state pattern as P2; non-organizer view gated by `isOrganizer`; `EventShareCard`; counts as label/value pairs; `Button` "Refresh" (`isLoading` while `isFetching`); danger `Button` "Close event" toggling an inline `role="status"` notice; link "Back to home". Create `frontend/src/app/events/[eventId]/(tabs)/manage/page.tsx` (server, awaits `params`). Makes T020 pass — agent: `implementer-fe`

**Checkpoint**: US1 + US2 = demoable MVP (create → home → manage/share). Commit US2a and US2b separately after `commit-reviewer`.

---

## Phase 5: User Story 3 — Closed event is clearly marked (Priority: P2)

**Goal**: The event layout shows "This event has ended." with the local closure time; P2 shows "Closed" and hides [Register my clothes]; M1 keeps counts and hides [Close event].

**Independent Test**: quickstart §3 row 8.

### Tests for User Story 3 (REQUIRED - write first) ⚠️

- [X] T022 [P] [US3] Write `frontend/src/components/event/EventClosedBanner.test.tsx` (mock `useEventQuery`, mock `@/lib/utils/date` `formatDateTime` to return `'Oct 27, 2026, 6:00 PM'`, seed session) — agent: `test-author`:
  - Closed event (`closedAt: '2026-10-27T09:00:00Z'`): shows "This event has ended." and "Closed Oct 27, 2026, 6:00 PM"; `formatDateTime` was called with `'2026-10-27T09:00:00Z'`.
  - Active event, pending, error, and no session: renders nothing (empty container); with no session `useEventQuery` gets `enabled: false`.
  - H2 itself is unchanged: `EventCreatedScreen.test.tsx` keeps rendering from the device snapshot without any query (no new assertion needed there).
- [X] T023 [P] [US3] Add "US3 closed" blocks — agent: `test-author`:
  - `EventHomeScreen.test.tsx`: closed event shows "Closed" (not "Active") and no "Register my clothes" link.
  - `ManageEventScreen.test.tsx`: closed organizer event still shows the three counts and no "Close event" button.

### Implementation for User Story 3

- [X] T024 [US3] Implement `frontend/src/components/event/EventClosedBanner.tsx` (`'use client'`, prop `eventId`; mount guard + `hasEventSession` + `useEventQuery`; Astryx `Banner` status `warning`, title "This event has ended.", description `Closed ${formatDateTime(closedAt)}`), and create `frontend/src/app/events/[eventId]/layout.tsx` (server; awaits `params`, renders `<EventClosedBanner eventId />` then `children`). Makes T022 pass — agent: `implementer-fe`
- [X] T025 [US3] Update `EventHomeScreen.tsx` (badge "Closed", hide [Register my clothes] when `isClosed`) and `ManageEventScreen.tsx` (render [Close event] only when active). Makes T023 pass — agent: `implementer-fe`

**Checkpoint**: Commit T022–T025 as one cycle after `commit-reviewer`.

---

## Phase 6: User Story 4 — Missing or invalid access is handled (Priority: P2)

**Goal**: P2 and M1 show no-access, not-found, and error states with next actions; no request is sent without a device record.

**Independent Test**: quickstart §3 rows 4–7.

### Tests for User Story 4 (REQUIRED - write first) ⚠️

- [X] T026 [US4] Add "US4 states" blocks to `EventHomeScreen.test.tsx` and `ManageEventScreen.test.tsx` (same cases in each) — agent: `test-author`:
  - No session record: shows "You haven't joined this event on this device." with links "Join with entry code" → `/join` and "Go to start" → `/`; `useEventQuery` called with `enabled: false`.
  - Error `ApiError(401, 'UNAUTHENTICATED', 'x')`: same guidance.
  - Error `ApiError(404, 'NOT_FOUND', 'x')`: "This event could not be found." and link "Go to start" → `/`.
  - Error `ApiError(500, 'INTERNAL_ERROR', 'Server message.')` without data: `role="alert"` containing "Server message."; "Try again" calls `refetch` once.
  - Error `ApiError(200, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')` without data (malformed result, FR-014): `role="alert"` with that message and "Try again".
  - Error `ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.')` with previous data: still shows the event (stale data kept).

### Implementation for User Story 4

- [X] T027 [US4] Create `frontend/src/components/event/EventScreenStatus.tsx` rendering the `no-access`, `not-found`, and `error` states per contracts/ui-screens.md "Shared states" (Astryx `Banner`/`Text` + `Button`s; error region `role="alert"`, [Try again] `isLoading` while fetching), and use it in `EventHomeScreen.tsx` and `ManageEventScreen.tsx`. Makes T026 pass — agent: `implementer-fe`
- [X] T028 [P] [US4] UI-only, no automated test: create `frontend/src/app/events/[eventId]/error.tsx` (client) modeled on `frontend/src/app/error.tsx`: "Unable to load this screen.", [Retry] via the `retry` prop, [Home] → `routes.eventHome(eventId)` using `useParams`, `logger.error` — agent: `scaffolder`

**Checkpoint**: Commit T026–T027 as one cycle and T028 as a boilerplate commit, each after `commit-reviewer`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T029 Run `cd frontend && pnpm exec astryx doctor --built` and fix any findings in the touched components — agent: `implementer-fe`
- [X] T030 Run the full suites and record the actual results: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`, and `cd backend && uv run ruff format --check --no-cache . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest` (backend unchanged; confirms nothing regressed) — agent: orchestrator
- [ ] T031 Manual verification per quickstart.md §3 rows 1–10 at 360 px and 430 px (no horizontal scroll, touch targets ≥ 44×44 px, English copy, no token/entry code in console) and record results in the PR description — agent: orchestrator with the user
- [ ] T032 Run `pr-reviewer` on `main..HEAD` before creating the PR (AGENTS.md "Code Review") — agent: `pr-reviewer`

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational F1–F5 (T002–T013)** → user stories.
- **US1 (T014–T016)** needs F2–F5.
- **US2** needs F2–F5; US2a (T017–T019) is independent of US1; US2b (T020–T021) reuses US1's screen pattern, so run after US1.
- **US3** needs US1 and US2b (it changes both screens).
- **US4** needs US1 and US2b; independent of US3 except that both edit the same screen files — run US3 then US4 sequentially.
- **Polish** after all stories.

## Parallel Opportunities

- Only one implementer per workspace at a time (AGENTS.md). `[P]` marks tasks that touch different files and could be authored together within one cycle:
  - F2: T004, T005, T006 (one `test-author` run writing three files).
  - US2a: T017 alongside US1's T014 if a second workspace is used.
  - US3: T022 and T023.
  - T028 can be scaffolded any time after T001.

### Parallel example: Foundational F2

```text
test-author: T004 (routes.test.ts) + T005 (session.test.ts) + T006 (utils/date.test.ts)
→ implementer-fe: T007
→ commit-reviewer → commit
```

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 → real P2 after creation. Demoable on its own.
2. **+ US2**: organizer manage/share screen (completes the P1 scope).
3. **+ US3**: closed banner and disabled actions.
4. **+ US4**: robust no-access/not-found/error handling.
5. Polish, full checks, manual verification, PR review.
