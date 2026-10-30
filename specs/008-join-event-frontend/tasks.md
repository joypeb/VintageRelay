---

description: "Task list for feature 008-join-event-frontend"
---

# Tasks: Join Event Frontend (Mobile)

**Input**: Design documents from `/specs/008-join-event-frontend/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-join-event.md](contracts/ui-join-event.md), [quickstart.md](quickstart.md)

**Tests**: Required (Constitution II).
- Every behavior's test task comes before the implementation task that covers it.
- Each state reset or guard is implemented in the same cycle as the test that first exercises it, never earlier.
- Run each test and confirm it fails for the expected reason (Red) before implementing.
- Every assertion about **new** behavior must be Red on first run. If one passes, report it as a planning defect.
- **Regression guards** are assertions over unchanged 002/004 behavior. They are labelled `(regression guard)` and may pass on first run.
- Layout at 360–430 px, touch target size, and the native back gesture are verified manually (Constitution III, frontend `testing.md`).

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md). `JoinEventScreen.test.tsx` grows across stories: each story adds a new `describe` block, and only `test-author` edits test files.

**Delegates** (AGENTS.md):
- Each task names its Paseo profile. The orchestrator never edits `frontend/`.
- Every test → implementation cycle ends with a `commit-reviewer` review and then a commit. Never commit a Red state alone.
- Checks for every cycle: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`.
- Implementers follow `frontend/AGENTS.md`:
  - Read `frontend/node_modules/next/dist/docs/` for page `searchParams`.
  - Inspect Astryx components first (`pnpm exec astryx component TextInput`, `Button`, `Badge`, `Card`), including the read-only prop name and `autoCapitalize` support.
- Give every delegate:
  - plan.md, research.md, data-model.md, and contracts/ui-join-event.md
  - `docs/plans/api/04-join-event.md` and `specs/007-join-event/contracts/join-event.openapi.yaml`
  - `docs/rules/dev/common/api-contract.md` and `docs/rules/dev/frontend/`. Don't give them `docs/rules/dev/backend/`.
- **Screen-test mock boundary** (research R10, Constitution IV):
  - `JoinEventScreen.test.tsx` and `app/join/page.test.tsx` mock only `@/lib/api/client` and `next/navigation`:

    ```ts
    const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), replace: vi.fn(), push: vi.fn() }));
    vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
    ```

  - Each test routes `mocks.apiFetch` by `path`:
    - `/entry-codes/…` → lookup
    - `/events/{id}/participants` → join
  - They keep the real `lookupEntryCode`/`joinEvent` and hooks from `@/lib/api/events`. **Do not** mock `@/lib/api/events`, because its hooks call the module-internal functions.
  - "Lookup called with X" means `mocks.apiFetch` was called with path `/entry-codes/X`. "Join called with …" means a call to `/events/e1/participants` whose `init.body` parses to the given JSON.
  - Render through `renderWithClient` and call `localStorage.clear()` in `beforeEach`. Never use real network.
- Work on branch `feature/frontend-join-event` (created from `main`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 from spec.md
- **Paths**: all under `frontend/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch and baseline. Dependencies (TanStack Query, Astryx, Zod), `apiFetch`, `eventSchema`, `session.ts`, `routes.join()`/`routes.eventHome()`, and `renderWithClient` already exist from features 002/004/006. No test infrastructure is needed.

- [X] T001 Create branch `feature/frontend-join-event` from `main` and confirm the baseline passes: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`. Then run `commit-reviewer` on the `specs/008-join-event-frontend/` documents and commit them (`.specify/feature.json` is gitignored) — agent: orchestrator → `commit-reviewer`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Response normalization, types, validation, response parsing, failure mapping, and API functions/hooks that every story uses (R2, R3, R6, R7). There are five TDD cycles, F0–F4.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Cycle F0 — unreadable successful bodies (`lib/api/client.ts`, R2, R9)

- [X] T002 [P] Add to `frontend/src/lib/api/client.test.ts`, with `fetch` mocked — agent: `test-author`:
  - A `200` response whose body is `'{"participantToken":"SECRET-TOKEN","entryCode":"K7P3QX"'` (invalid JSON) makes `apiFetch` reject with `ApiError`, `status` 200, `code` `'UNKNOWN_ERROR'`, and message `'Something went wrong. Please try again.'`.
  - The rejection's `message` and `String(error)` contain neither `SECRET-TOKEN` nor `K7P3QX`.
  - A `201` with an empty body behaves the same.
  - (regression guard) `204` still resolves `undefined`, valid JSON still resolves the parsed body, and non-2xx error handling is unchanged.
- [X] T003 In `frontend/src/lib/api/client.ts`, wrap the 2xx `res.json()` in try/catch and throw `new ApiError(res.status, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')` on failure. Do not keep or log the parser error. This makes T002 pass — agent: `implementer-fe`

### Cycle F1 — join input validation (`lib/validation/join.ts`, R1, R7)

- [X] T004 [P] Create `frontend/src/lib/validation/join.test.ts` — agent: `test-author`:
  - `readInitialCode(value: string | string[] | undefined): string | null`:
    - `'K7P3QX'` → `'K7P3QX'`
    - `' k7p3qx '` → `'k7p3qx'` (trimmed, case unchanged)
    - `['AB', 'CD']` → `'AB'`
    - `undefined`, `''`, `'   '`, and `[]` → `null`
  - `validateEntryCode(raw)`:
    - `'  k7p3qx '` → `{ ok: true, value: 'k7p3qx' }`
    - `''` and `'   '` → `{ ok: false, message: 'Enter the entry code.' }`
  - `validateDisplayName(raw)`:
    - `' Joon '` → `{ ok: true, value: 'Joon' }`
    - exactly 1 and exactly 30 code points after trimming are accepted, including 30 emoji (code points, not UTF-16 units)
    - `''`, `'   '`, and 31 characters → `{ ok: false, message: 'Enter a display name of 1–30 characters.' }`
    - `'Jo\non'` and `'Jo\ton'` → `{ ok: false, message: 'Remove line breaks and tabs.' }`
  - `mapJoinServerFieldErrors(details)`:
    - `{ fields: [{ field: 'displayName', reason: 'too_long' }] }` → `fieldErrors.displayName === 'Enter a display name of 1–30 characters.'`, `formError: null`
    - `reason: 'required'` behaves the same
    - `reason: 'invalid_characters'` → `'Remove line breaks and tabs.'`
    - `{ field: 'entryCode', reason: 'required' }` → `fieldErrors.entryCode === 'Enter the entry code.'`
    - an unknown field or reason → `formError: 'Something went wrong. Please try again.'`
    - `null` or a malformed `details` → `{ fieldErrors: {}, formError: 'Something went wrong. Please try again.' }`
- [X] T005 Implement `frontend/src/lib/validation/join.ts` with the four functions above. Reuse `DISPLAY_NAME_MAX` (30) from `@/lib/validation/event`, count code points with `[...value].length`, and detect control characters with `/\p{Cc}/u`. Export `JoinField = 'entryCode' | 'displayName'` and `JoinFieldErrors`. This makes T004 pass — agent: `implementer-fe`

### Cycle F2 — response parsing (`lib/validation/event-response.ts`, R2)

- [X] T006 [P] Add to `frontend/src/lib/validation/event-response.test.ts` — agent: `test-author`:
  - "parseEventPreview" block:
    - `{ eventId: 'e1', name: 'Mangwon Swap', status: 'active' }` parses, and so does `status: 'closed'`.
    - Each of these throws `ApiError` with code `UNKNOWN_ERROR` and status 200: missing `eventId`, `eventId: ''`, `status: 'open'`, a non-string `name`, and `null`.
  - "parseJoinSession(data, eventId)" block:
    - A valid non-organizer session for `'e1'` returns `{ event, participantToken }`. Valid means `me.isOrganizer: false`, `me.participantId: 'p2'`, `organizerParticipantId: 'p1'`, `stats: null`, and `participantToken: 'tok'`.
    - Each of these throws `UNKNOWN_ERROR` (status 200):
      - `participantToken: ''` or a missing `participantToken`
      - `event.id: 'e2'` while expecting `'e1'`
      - `me.isOrganizer: true`
      - `me.participantId: ''`
      - `me.participantId === organizerParticipantId` (`'p1'`) with stats present and `isOrganizer: false`
      - a non-null `stats`
      - a malformed `event`
- [X] T007 Implement `parseEventPreview` and `parseJoinSession` in `frontend/src/lib/validation/event-response.ts`, and add `EventPreview` and `JoinEventRequest` types to `frontend/src/types/event.ts`. Follow data-model.md "EventSession (existing) — join result": reuse `eventSchema`, then check token non-empty, `event.id === eventId`, `isOrganizer === false`, a non-empty `participantId` that differs from `organizerParticipantId`, and `stats === null`. Never log the payload. This makes T006 pass — agent: `implementer-fe`

### Cycle F3 — failure mapping (`lib/event.ts`, R6)

- [X] T008 [P] Add to `frontend/src/lib/event.test.ts` — agent: `test-author`:
  - "getLookupFailure" block:
    - `ApiError(404, 'NOT_FOUND', "We couldn't find an event with this code. Check the code and try again.")` → `{ kind: 'codeField', message: <that message> }`
    - `ApiError(500, 'INTERNAL_ERROR', 'Server says no.')` → `{ kind: 'form', message: 'Server says no.' }`
    - `ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.')` → `form` with that message
    - `ApiError(429, 'UNKNOWN_ERROR', 'Please try again shortly.')` → `form`
    - `new Error('x')` → `{ kind: 'form', message: 'Something went wrong. Please try again.' }`
  - "getJoinFailure" block:
    - `ApiError(409, 'DISPLAY_NAME_TAKEN', 'This display name is already taken.', { field: 'displayName' })` → `{ kind: 'displayNameField', message: 'This display name is already taken.' }`
    - `ApiError(409, 'EVENT_CLOSED', …)` → `{ kind: 'closed' }`
    - `ApiError(404, 'NOT_FOUND', 'Not here.')` → `{ kind: 'codeNotFound', message: 'Not here.' }`
    - `ApiError(422, 'VALIDATION_ERROR', …, { fields: [{ field: 'displayName', reason: 'too_long' }] })` → `{ kind: 'fields', fieldErrors: { displayName: 'Enter a display name of 1–30 characters.' }, formError: null }`
    - `INTERNAL_ERROR`, `NETWORK_ERROR`, and `UNKNOWN_ERROR` (status 200) → `form` with the server message
    - `new Error('x')` → `form` with the generic message
- [X] T009 Implement `getLookupFailure` and `getJoinFailure` (types exactly as in data-model.md "Failure mappings") in `frontend/src/lib/event.ts`, using `getFormErrorMessage` and `mapJoinServerFieldErrors`. This makes T008 pass — agent: `implementer-fe`

### Cycle F4 — API functions and hooks (`lib/api/*`, R2–R4)

- [X] T010 Add to `frontend/src/lib/api/events.test.ts` — agent: `test-author`:
  - "lookupEntryCode" block, mocking `@/lib/api/client`:
    - It calls `apiFetch(null, '/entry-codes/K7P3QX', {}, { timeoutMs: 15000 })` (first argument `null`, so no `Authorization` header).
    - It URL-encodes the code (`'a/b c'` → `/entry-codes/a%2Fb%20c`).
    - It returns the parsed preview.
    - A malformed body rejects with `UNKNOWN_ERROR` (status 200).
    - `ApiError`s from `apiFetch` propagate unchanged.
  - "joinEvent" block:
    - `joinEvent('e1', { entryCode: 'k7p3qx', displayName: 'Joon' })` calls `apiFetch(null, '/events/e1/participants', { method: 'POST', body: JSON.stringify({ entryCode: 'k7p3qx', displayName: 'Joon' }) }, { timeoutMs: 15000, timeoutMessage: 'The connection timed out. Please try again. If your display name is now taken, choose a different one.' })`.
    - It encodes the event ID.
    - It returns `{ event, participantToken }` for a valid response.
    - It rejects with `UNKNOWN_ERROR` when `event.id` differs or `me.isOrganizer` is true.
    - `ApiError`s propagate unchanged.
  - "useEntryCodePreviewQuery" block, using `renderHook` + `renderWithClient`'s client:
    - With `null` it is idle and `apiFetch` is not called.
    - With `'K7P3QX'` it calls `apiFetch` once for `/entry-codes/K7P3QX` and exposes the preview.
    - On a rejection it does not retry (called once).
    - After rerendering with `null` it exposes no data.
    - After a **completed** lookup, unmounting, and remounting with the same code, it calls `apiFetch` again (`staleTime: 0`). Do not assert on a remount while a lookup is still pending; research R3 notes that the pending request is reused.
  - "useIsEntryCodeLookupPending" block, with one client:
    - It is `false` initially.
    - It is `true` while a lookup for `'AAA'` is pending, **including after** the `useEntryCodePreviewQuery` consumer rerenders with `null`.
    - It is `false` after `'AAA'` settles.
  - "useJoinEventMutation" block: a 500 rejection calls `apiFetch` once (`retry: 0`).
- [X] T011 Implement in `frontend/src/lib/api/query-keys.ts` and `frontend/src/lib/api/events.ts` — agent: `implementer-fe`:
  - `queryKeys.entryCodePreview = (code: string) => ['entry-codes', code] as const` and `queryKeys.entryCodePreviews = () => ['entry-codes'] as const`
  - `lookupEntryCode(code)` and `joinEvent(eventId, body)` per contracts/ui-join-event.md (15 s timeouts, the join timeout message above, `parseEventPreview`/`parseJoinSession`)
  - `useEntryCodePreviewQuery(code: string | null)`: `enabled: code !== null`, `retry: 0`, `staleTime: 0`, `gcTime: 0`, `refetchOnWindowFocus: false`
  - `useIsEntryCodeLookupPending()`: `useIsFetching({ queryKey: queryKeys.entryCodePreviews() }) > 0`
  - `useJoinEventMutation()`: `mutationFn: ({ eventId, body }) => joinEvent(eventId, body)`, `retry: 0`
  - Never log the code, token, or body.
  - This makes T010 pass.

**Checkpoint**: The join API, validation, normalization, and failure mapping are tested in isolation.

---

## Phase 3: User Story 1 — Visitor joins from the event QR link (Priority: P1) 🎯 MVP

**Goal**: A join link opens P1 with the code prefilled, the preview loads automatically, and a valid name joins and replaces P1 with P2.

**Independent Test**: Open the H2 join link in a fresh profile, see the event name and "Active", enter a name, and tap [Join]. P2 opens as a participant, and Back doesn't return to the form (quickstart rows 1, 2, 13, 16).

### Tests for User Story 1 (REQUIRED - write first) ⚠️

- [X] T012 [US1] Create `frontend/src/components/event/JoinEventScreen.test.tsx` using the screen-test mock boundary above, with a "US1 join from link" `describe` — agent: `test-author`. Render `<JoinEventScreen initialCode="K7P3QX" />`, with the lookup resolving `{ eventId: 'e1', name: 'Mangwon Swap', status: 'active' }`:
  - The "Entry code" field shows `K7P3QX`, and the lookup is called once with `K7P3QX` without any click. While it is pending, [Find event] is busy or disabled.
  - After it resolves: the heading "Join event", the text "Mangwon Swap", and the text "Active" are shown, the "My display name" field has focus, and a [Join] button is shown.
  - Entering `' Joon '` and clicking [Join] sends one join to `/events/e1/participants` with body `{ entryCode: 'K7P3QX', displayName: 'Joon' }` and no `Authorization` header (first `apiFetch` argument `null`). While it is pending, [Join] is busy, a second click sends nothing, and the "Entry code" field is read-only.
  - On resolution with a valid non-organizer session for `e1`:
    - `getEventSession('e1')` returns `{ participantToken, participantId: event.me.participantId }` with no `share`.
    - The test `QueryClient` holds the returned event under `queryKeys.event('e1')`.
    - `router.replace('/events/e1')` is called once, and `router.push` is not called.
  - Pressing Enter in the display name field submits the join.
  - With `vi.spyOn(session, 'isStorageAvailable').mockReturnValue(false)`, clicking [Join] shows "This browser can't save your event access. Turn off private browsing or try another browser." in a `role="alert"` element and sends no join.
  - When `saveEventSession` throws after a successful join, the screen shows "You joined, but this browser couldn't keep your event access. Free up browser storage or open a regular (non-private) window, then join again with a different display name." and does not navigate.
  - An empty name or a 31-character name shows "Enter a display name of 1–30 characters." and sends no join.
  - The participant token never appears in the rendered output.
- [X] T013 [P] [US1] Create `frontend/src/app/join/page.test.tsx` using the same mock boundary — agent: `test-author`:
  - Await `JoinPage({ searchParams: Promise.resolve({ code: ' K7P3QX ' }) })` and render the result with `renderWithClient`. The "Entry code" field shows `K7P3QX` and a lookup for `/entry-codes/K7P3QX` is made.
  - With `{}` the field is empty and no lookup is made.
  - The text "coming soon" is absent.

### Implementation for User Story 1

- [X] T014 [US1] Implement `frontend/src/components/event/JoinEventScreen.tsx` (`'use client'`, props `{ initialCode: string | null }`) and `frontend/src/app/join/page.tsx` — agent: `implementer-fe`:
  - The page is a server component: `searchParams: Promise<{ code?: string | string[] }>` → `readInitialCode` → `<JoinEventScreen initialCode={…} />`. Remove the `ComingSoonScreen` import from this page only.
  - The screen follows data-model.md "P1 view state" for the `lookingUp`, `active`, and `joining` views only, with elements and copy exactly as in contracts/ui-join-event.md.
  - Use `useEntryCodePreviewQuery(submittedCode)` and `useJoinEventMutation()`.
  - On [Join]: if pending, return; validate the name; check `isStorageAvailable()`; then call `mutate`.
  - On success, in order:
    1. `saveEventSession(event.id, { participantToken, participantId: event.me.participantId })`, wrapped in try/catch that sets the session-save-failure message and logs `'join session save failed'`
    2. `queryClient.setQueryData(queryKeys.event(event.id), event)`
    3. `router.replace(routes.eventHome(event.id))`
  - Focus the display name input when the active view appears.
  - Use the `Badge` state label as in `EventHomeScreen`. Field errors use `TextInput` `status` with `statusVariant="detached"`; the form error uses the `role="alert"` span pattern from `CreateEventScreen`.
  - Do **not** implement code editing, failure mapping, or the closed and already-joined views yet. Those belong to later cycles.
  - This makes T012 and T013 pass.
- [X] T015 [US1] (regression guard) Add to `frontend/src/components/event/EventHomeScreen.cache.test.tsx`: after `saveEventSession('e1', { participantToken: 't', participantId: 'p2' })` and seeding `queryKeys.event('e1')` with a non-organizer active event (`stats: null`), P2 renders the event name, "Active", and no manage card before any GET resolves — agent: `test-author` (same commit as T014)

**Checkpoint**: The MVP is demoable: QR link → P1 → P2.

---

## Phase 4: User Story 2 — Visitor joins by typing the entry code (Priority: P1)

**Goal**: Code entry with [Find event], trimming, empty-code validation, serialized lookups, and clearing the preview when the code is edited.

**Independent Test**: S0 → [Join with entry code], type the code in lowercase with spaces, tap [Find event], then edit the code (quickstart rows 4–6, 18).

### Tests for User Story 2 (REQUIRED - write first) ⚠️

- [X] T016 [US2] Add a "US2 typed code" `describe` to `frontend/src/components/event/JoinEventScreen.test.tsx`, rendering with `initialCode={null}` — agent: `test-author`:
  - (regression guard, already established by T013/T014) The screen shows an empty "Entry code" field, a [Find event] button, no "My display name" field, and no lookup call.
  - Clicking [Find event] with `''` or `'   '` shows "Enter the entry code." and makes no lookup call. Typing in the field afterwards removes that message.
  - Typing `'  k7p3qx '` and clicking [Find event] calls the lookup once with `k7p3qx`, then shows the preview. Pressing Enter in the code field does the same.
  - Double-clicking [Find event] while the lookup is pending calls it once.
  - After the preview, typing in the code field removes the event name, "Active", and "My display name", and shows [Find event] again.
  - Stale result: start a lookup for `'AAA'` that stays pending, then edit the code to `'BBB'`:
    - [Find event] is busy or disabled, and clicking it makes no `'BBB'` lookup while `'AAA'` is pending.
    - Resolve `'AAA'` → the `'AAA'` event name is never shown, and [Find event] becomes enabled.
    - Clicking it then looks up `'BBB'`.
    - At no point are two lookups pending at once.
  - A failed lookup followed by [Find event] with the same code calls the lookup a second time (retry).

### Implementation for User Story 2

- [X] T017 [US2] Extend `frontend/src/components/event/JoinEventScreen.tsx` with the `codeEntry` view — agent: `implementer-fe`:
  - [Find event] validates with `validateEntryCode`, and is busy/disabled while `useIsEntryCodeLookupPending()`. If the value equals `submittedCode` and the query errored, call `refetch()`; otherwise set `submittedCode`.
  - The form submits [Find event] when there is no preview.
  - Code `onChange` sets `submittedCode` to `null` and clears the code field error only. The other resets come in later cycles with their tests.
  - This makes T016 pass.

**Checkpoint**: Both entry paths (QR and typed) work.

---

## Phase 5: User Story 3 — Lookup and join problems are explained and recoverable (Priority: P1)

**Goal**: Every failure shows a message with a next action. P2 is reached only after a validated success.

**Independent Test**: Simulate an unknown code, a closed preview, a closed event on join, a taken name, a 422, a 404 on join, network failure, 500, an invalid 2xx, and an unreadable 2xx (quickstart rows 6–11, 15).

### Tests for User Story 3 (REQUIRED - write first) ⚠️

- [X] T018 [US3] Add a "US3 failures" `describe` to `frontend/src/components/event/JoinEventScreen.test.tsx` — agent: `test-author`:
  - Lookup `NOT_FOUND` with the server message "We couldn't find an event with this code. Check the code and try again." → the message is shown on the "Entry code" field, the code is kept, and there is no display name field.
  - Lookup `NETWORK_ERROR` and `INTERNAL_ERROR` ('Server says no.') → the message is in `role="alert"`, the code is kept, and [Find event] retries.
  - A closed preview (`status: 'closed'`) → the screen shows "Mangwon Swap", "Closed", and "This event has ended. You can no longer join." inside a `role="status"` element, plus a [Go to start] link to `/`. There is no "My display name" field, no [Join], and no join request.
  - Join `DISPLAY_NAME_TAKEN` ('This display name is already taken.') → the message is on "My display name", the typed name is kept, [Join] is enabled, and a second click sends a second join.
  - Join `EVENT_CLOSED` → the closed view from the case above, and the element containing "This event has ended. You can no longer join." has focus.
  - Join `NOT_FOUND` ('Not here.') → the preview is cleared, [Find event] is shown, and "Not here." is shown on "Entry code".
  - Join `VALIDATION_ERROR` with `details.fields` `[{ field: 'displayName', reason: 'too_long' }]` → "Enter a display name of 1–30 characters." is on the name field. With an unknown field, "Something went wrong. Please try again." appears in `role="alert"`.
  - Join `NETWORK_ERROR` (the timeout message), `INTERNAL_ERROR`, and a 2xx body failing `parseJoinSession` (participant ID equal to the organizer ID) → the message is in `role="alert"`, the code and name are kept, [Join] retries, and `router.replace` is not called.
  - Editing the display name clears its field error and the form error.
  - Name error reset on code edit: join `DISPLAY_NAME_TAKEN` → edit the code → [Find event] → the active view for the new preview shows no error on "My display name".
  - Editing the code after a form error clears the form error. Editing the code after a join `EVENT_CLOSED` returns to code entry with no closed message.
  - No secrets in logs:
    - Spy on `console.error` and `console.warn`, with the participant token `'SECRET-TOKEN'` and code `'K7P3QX'`.
    - Run the success flow and these failures: lookup network failure, join 500, join rejecting with `new Error('boom')`, and the session-save failure.
    - Neither string appears in any logged argument (stringify each argument, including `Error` messages).

### Implementation for User Story 3

- [X] T019 [US3] In `frontend/src/components/event/JoinEventScreen.tsx` — agent: `implementer-fe`:
  - Map lookup errors with `getLookupFailure` and join errors with `getJoinFailure`:
    - `codeField`/`displayNameField`/`fields` → field errors
    - `closed` → `closedOverride = true`
    - `codeNotFound` → `submittedCode = null` + code error
    - `form` → `formError`
  - Render the `closed` view per data-model.md precedence. The message goes in `role="status"`, with [Go to start] → `routes.landing()`. When the view is reached through `closedOverride`, focus the message (`tabIndex={-1}`).
  - Add the edit resets from data-model.md transitions. Name `onChange` clears the name error and `formError`. Code `onChange` also clears `formError`, the name error, and `closedOverride`.
  - Log only non-`ApiError` failures (`'entry code lookup failed'`, `'join event failed'`).
  - This makes T018 pass.

**Checkpoint**: All FR-008 mappings, the closed-state announcement, and log secrecy are verified.

---

## Phase 6: User Story 4 — Device already joined this event (Priority: P2)

**Goal**: A device that already holds access for the previewed event is sent to P2 instead of joining again, including when access appeared after the form was shown.

**Independent Test**: Join, then reopen the join link on the same device. Also join in another tab while the form is open (quickstart rows 3, 17).

### Tests for User Story 4 (REQUIRED - write first) ⚠️

- [X] T020 [US4] Add a "US4 already joined" `describe` to `frontend/src/components/event/JoinEventScreen.test.tsx` — agent: `test-author`:
  - With `saveEventSession('e1', { participantToken: 't', participantId: 'p1' })` set before rendering and an active preview for `e1` → the screen shows "Mangwon Swap" and "You've already joined this event on this device.", plus a [Go to event home] link to `/events/e1`. There is no "My display name" field, no [Join], and no join request.
  - The same with a closed preview → the already-joined notice is shown, not the closed join message.
  - A stored session for a different event (`e9`) → the normal active view.
  - A stored value that fails session validation (for example `localStorage.setItem('vr:event:e1', '{}')`) → the normal active view.
  - Submit-time re-check (FR-010):
    1. Show the active view with no stored session, and enter "Joon" first.
    2. Then call `saveEventSession('e1', { participantToken: 'other', participantId: 'p9' })` without causing a rerender, simulating another tab.
    3. Click the existing [Join] button.
    4. No join request is sent, the already-joined notice is shown, and the stored session still has token `'other'`.
  - Override reset on code edit: after the submit-time case, edit the code to `'BBB'` and click [Find event], with the lookup returning an active event `e2` for which no session is stored. The normal active view with "My display name" and [Join] appears, and the already-joined notice is absent.

### Implementation for User Story 4

- [X] T021 [US4] In `frontend/src/components/event/JoinEventScreen.tsx` — agent: `implementer-fe`:
  - Render the `alreadyJoined` view when a preview exists and (`alreadyJoinedOverride` or `hasEventSession(preview.eventId)`). This follows data-model.md precedence: after `closedOverride`, before `active`. [Go to event home] → `routes.eventHome(preview.eventId)`.
  - In the [Join] handler, call `hasEventSession(preview.eventId)` immediately before `mutate`. If it returns true, set `alreadyJoinedOverride` and return.
  - Code `onChange` clears `alreadyJoinedOverride`.
  - This makes T020 pass.

**Checkpoint**: All stories are complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T022 Run `cd frontend && pnpm exec astryx doctor --built` and fix any findings in `JoinEventScreen.tsx` — agent: `implementer-fe`
- [ ] T023 Run the full suites and the production build, and record the actual results — agent: orchestrator:
  - `cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  - `cd backend && uv run ruff format --check --no-cache . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest` (the backend is unchanged; this confirms nothing regressed)
- [ ] T024 Manual verification per quickstart.md rows 1–19 at 360 px and 430 px, recording the results in the PR description — agent: orchestrator with the user. Check:
  - no horizontal scroll, touch targets ≥ 44×44 px, and English copy
  - focus moves to the name field, and to the closed message after a join `EVENT_CLOSED`
  - native Back after joining doesn't reopen the form
  - one POST, and at most one pending GET, under throttling
  - taps and seconds for SC-001/SC-002
  - no token, entry code, or response body in the browser console
  - Attach screenshots of P1 (code entry, active, closed, already joined) at both widths.
- [ ] T025 Run `pr-reviewer` on `main..HEAD` before creating the PR (AGENTS.md "Code Review") — agent: `pr-reviewer`

---

## Dependencies & Execution Order

- **Setup**: T001 comes first.
- **Foundational**:
  - F0 (T002–T003), F1 (T004–T005), and F2 (T006–T007) are independent of each other.
  - F3 (T008–T009) imports `mapJoinServerFieldErrors`, so it needs F1.
  - F4 (T010–T011) needs F2.
- **US1 (T012–T015)** needs all of Phase 2.
- **US2 (T016–T017)**, **US3 (T018–T019)**, and **US4 (T020–T021)** each need US1, because they share `JoinEventScreen.*`. Run them in order US2 → US3 → US4: each later cycle extends the code `onChange` resets introduced earlier.
- **Polish** comes after all stories.

## Parallel Opportunities

- The `[P]` test tasks T002, T004, T006, and T008 touch different test files and can be drafted in parallel. Their implementation cycles still run one implementer at a time per workspace (AGENTS.md).
- T013 (page test) can be written alongside T012.
- With a second Paseo workspace, F0 → F1 → F3 can run in workspace A while F2 → F4 run in workspace B, merging before US1. Run `commit-reviewer` separately in each workspace.

### Parallel example: second workspace

```text
workspace A: T002 → T003 → commit;  T004 → T005 → commit;  T008 → T009 → commit
workspace B: T006 → T007 → commit;  T010 → T011 → commit
then (merged): T012–T015 → T016–T017 → T018–T019 → T020–T021 → T022–T025
```

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1. A QR link visitor can join and land on P2, and this is demoable on its own.
2. **+ US2**: the typed-code path from S0 and from P2's "not joined" guidance, with serialized lookups.
3. **+ US3**: recoverable failures for every server error, closed-state announcement, and log secrecy. This completes the P1 scope.
4. **+ US4**: the already-joined guard, including the submit-time re-check.
5. Polish, full checks and build, manual verification with screenshots, and PR review.
