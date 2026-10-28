---

description: "Task list for feature 002-create-event-frontend"
---

# Tasks: Create Event Frontend (Mobile)

**Input**: Design documents from `/specs/002-create-event-frontend/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-screens.md](contracts/ui-screens.md), [quickstart.md](quickstart.md)

**Tests**: Required (Constitution II).
- Every behavior's test task comes before the implementation task that covers it.
- Run each test and confirm it fails for the expected reason (Red) before implementing.
- No test listed here may pass on first run. If one does, report it as a planning defect.
- UI-only screens with no logic (S0 landing, placeholders, error boundaries) have no automated test. They are verified manually at 360–430 px (Constitution III, frontend `testing.md`).

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md). `CreateEventScreen.test.tsx` grows across US1, US3, and US4. Each story adds a new `describe` block, and only `test-author` edits it.

**Delegates** (AGENTS.md):
- Each task names its Paseo profile. The orchestrator never edits `frontend/`.
- Every test → implementation cycle ends with a `commit-reviewer` review and then a commit. Boilerplate goes `scaffolder` → `commit-reviewer` → commit. Never commit a Red state alone.
- Checks for every cycle: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`.
- Implementers follow `frontend/AGENTS.md`: read the relevant guide in `frontend/node_modules/next/dist/docs/`, and use Astryx templates/components (`pnpm exec astryx build|template|component <Name>`).
- Give every delegate: plan.md, research.md, data-model.md, contracts/ui-screens.md, `docs/rules/dev/common/api-contract.md`, and `docs/rules/dev/frontend/`. Don't give them `docs/rules/dev/backend/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 from spec.md
- **Paths**: all under `frontend/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, config, types, and boilerplate modules with no behavior. There are no tests here; the work goes `scaffolder` → `commit-reviewer` → commit (one commit for T001–T009).

- [ ] T001 Run `cd frontend && pnpm add @tanstack/react-query@^5.105.0 zod@^4.6.7 qrcode.react@^4.2.0`, updating `frontend/package.json` and `frontend/pnpm-lock.yaml`. Add nothing else (research R1) — agent: `scaffolder`
- [ ] T002 [P] Set `compiler.removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false` in `frontend/next.config.ts`, exactly as in `docs/rules/dev/frontend/logging.md` §1 — agent: `scaffolder`
- [ ] T003 [P] Keep `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` in `frontend/.env.example`. Reword its comment to say the value is the backend origin only, and that `apiFetch` adds `/api/v1` (R2) — agent: `scaffolder`
- [ ] T004 [P] Create `frontend/src/types/event.ts` with `EventStatus = 'active' | 'closed'`, `CreateEventRequest { name: string; organizerDisplayName: string }`, `EventMe`, `EventStats`, `Event`, and `EventSession { event: Event; participantToken: string }`. Fields must match data-model.md §1 exactly (`createdAt: string`, `closedAt: string | null`, `stats: EventStats | null`) — agent: `scaffolder`
- [ ] T005 [P] Create `frontend/src/lib/logger.ts` with `logger.warn(msg, ctx?)` and `logger.error(msg, err?, ctx?)` prefixed `[vr]`, as in `logging.md` §1 — agent: `scaffolder`
- [ ] T006 [P] Create `frontend/src/lib/api/error-codes.ts`. It exports a literal union `ErrorCode` that copies the shared codes listed in `docs/rules/dev/common/api-contract.md` §7 (both tables, as `error-handling.md` §1 requires) and adds the normalization-only `NETWORK_ERROR` and `UNKNOWN_ERROR`. Don't invent any other codes; create-event (001) defines no feature-specific codes — agent: `scaffolder`
- [ ] T007 [P] Create `frontend/src/lib/env.ts`, which reads `process.env.NEXT_PUBLIC_API_BASE_URL` literally and throws `NEXT_PUBLIC_API_BASE_URL is not set` if it is missing. It exports `env = { apiBaseUrl } as const`. Also add `test.env: { NEXT_PUBLIC_API_BASE_URL: 'http://api.test' }` to `frontend/vitest.config.mts` so modules that import `env` load in tests — agent: `scaffolder`
- [ ] T008 Set up the query client and test helper (agent: `scaffolder`):
  - Add `QueryClientProvider` to `frontend/src/app/providers.tsx`. Create the client once per mount with `useState`, using defaults `queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true }` and `mutations: { retry: 0 }`. Keep the existing `Theme` and `LinkProvider`.
  - Create `frontend/src/test/render.tsx`. It exports `renderWithClient(ui)`, which renders inside a fresh `QueryClient` with `queries.retry: false` and `mutations.retry: false`, plus the Astryx `Theme`.
- [ ] T009 [P] Create the root error boundaries `frontend/src/app/error.tsx` (client: [Retry] → `reset`, [Home] → `/`, `logger.error`), `frontend/src/app/not-found.tsx`, and `frontend/src/app/global-error.tsx` (client, own `<html><body>`). Copy is English and uses Astryx components (`error-handling.md` §3) — agent: `scaffolder`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Session storage, the API client, error normalization, and routes, which every story uses (R2, R3, R4, R12). There are three TDD cycles, F1–F3.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Cycle F1 — device session (`lib/session.ts`)

- [ ] T010 [P] Write `frontend/src/lib/session.test.ts` (clear `localStorage` before each test) — agent: `test-author`. It covers:
  - Writing: `saveEventSession('e1', { participantToken: 't1', participantId: 'p1', share: { name: 'N', entryCode: 'K7P3QX', entryUrl: 'http://localhost:3000/join?code=K7P3QX' } })` stores JSON under exactly `vr:event:e1`.
  - Reading back: `getEventSession('e1')` returns that record, and `getEventShare('e1')` returns its `share`.
  - Isolation: saving `e2` leaves `vr:event:e1` unchanged.
  - Bad stored data: missing key, invalid JSON, an empty `participantToken`, and a missing `participantId` all read as `null` from both getters, without throwing.
  - Session headers: `getSessionHeaders('e1')` returns `{ Authorization: 'Bearer t1' }`, and returns `{}` for an unknown event.
  - Storage probe: `isStorageAvailable()` returns `true` normally and leaves no probe key behind. It returns `false` when `Storage.prototype.setItem` throws (`vi.spyOn`).
- [ ] T011 Implement `frontend/src/lib/session.ts`, the only module that uses `localStorage`. The key is `vr:event:{eventId}`. Reads go through `JSON.parse` and then a Zod schema (`participantToken`: non-empty string; `participantId`: non-empty string; `share`: optional `{ name, entryCode, entryUrl }` strings), and failures return `null`. No `as` casts. It never logs values. Makes T010 pass (R4, data-model.md §2) — agent: `implementer-fe`

### Cycle F2 — API errors and client (`lib/api/api-error.ts`, `lib/api/client.ts`)

- [ ] T012 [P] Write `frontend/src/lib/api/api-error.test.ts` against `toApiError(res: Response)` — agent: `test-author`. It covers:
  - A standard error body (`{ error: { code: 'BAD_REQUEST', message: 'Malformed JSON.', details: null, requestId: 'r1' } }`, status 400) gives an `ApiError` with that status, code, message, details, and requestId, and `name === 'ApiError'`.
  - An HTML body with status 502 gives `ApiError(502, 'UNKNOWN_ERROR', 'Please try again shortly.')`.
  - JSON without an `error` object gives `UNKNOWN_ERROR`.
- [ ] T013 [P] Write `frontend/src/lib/api/client.test.ts`. Stub `fetch` with `vi.stubGlobal` and mock `@/lib/session` `getSessionHeaders` — agent: `test-author`. It covers:
  - URL and headers: `apiFetch(null, '/events', { method: 'POST', body: '{}' })` calls `http://api.test/api/v1/events` with `Content-Type: application/json` and no `Authorization` header, and doesn't call `getSessionHeaders`.
  - Session header: `apiFetch('e1', '/x')` adds the header returned by `getSessionHeaders('e1')`.
  - Responses: a 2xx response returns the parsed JSON, and a 204 returns `undefined`.
  - Non-ok responses: a non-ok response rejects with the `ApiError` produced from its body.
  - Network failure: a `fetch` rejection with a `TypeError` rejects with `ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.')`.
  - Timeout:
    - With `{ timeoutMs: 15000 }`, `fetch` receives a `signal`.
    - A rejection with `new DOMException('t', 'TimeoutError')` rejects with `ApiError(0, 'NETWORK_ERROR', "The connection timed out. Your event may have been created; if you don't see it, create it again.")`.
- [ ] T014 Implement `frontend/src/lib/api/api-error.ts` (`ApiError` class and `toApiError`, as in `error-handling.md` §1) and `frontend/src/lib/api/client.ts`. The client signature is `apiFetch<T>(eventId: string | null, path: string, init: RequestInit = {}, options: { timeoutMs?: number } = {})`, with:
  - the `${env.apiBaseUrl}/api/v1${path}` prefix;
  - the `AbortSignal.timeout` timeout;
  - normalization of `TypeError` and `TimeoutError` to `NETWORK_ERROR`.

  Makes T012–T013 pass (R2, R3) — agent: `implementer-fe`

### Cycle F3 — routes (`lib/routes.ts`)

- [ ] T015 [P] Write `frontend/src/lib/routes.test.ts`. It checks that the builders return `/`, `/events/new`, `/events/e1/created`, `/join`, `/events/e1`, and `/events/e1/my-items/new`, and that `routes.eventCreated('a/b')` returns `/events/a%2Fb/created` (contracts/ui-screens.md "Routes") — agent: `test-author`
- [ ] T016 Implement `frontend/src/lib/routes.ts` with `routes.landing()`, `routes.createEvent()`, `routes.eventCreated(eventId)`, `routes.join()`, `routes.eventHome(eventId)`, and `routes.newItem(eventId)`, encoding `eventId` with `encodeURIComponent`. Makes T015 pass — agent: `implementer-fe`

**Checkpoint**: Foundation ready. Run the checks; commit F1, F2, and F3 separately after `commit-reviewer`.

---

## Phase 3: User Story 1 — Organizer creates an event from a phone (Priority: P1) 🎯 MVP

**Goal**: S0 → H1 → valid submit → one event is created, the device keeps organizer access, and the app replaces the route with H2.

**Independent Test**: Run quickstart §3 scenarios 1, 5, 6, and 8. With the API mocked, a valid submit calls `createEvent` once with trimmed values, saves `vr:event:{id}`, and calls `router.replace('/events/{id}/created')`.

### Tests for User Story 1 (REQUIRED - write first) ⚠️

- [ ] T017 [P] [US1] Write `frontend/src/lib/api/events.test.ts` (mock `./client`). `createEvent({ name: 'N', organizerDisplayName: 'Mina' })` must call `apiFetch(null, '/events', { method: 'POST', body: JSON.stringify({ name: 'N', organizerDisplayName: 'Mina' }) }, { timeoutMs: 15000 })` and resolve to the `EventSession` — agent: `test-author`
- [ ] T018 [P] [US1] Write `frontend/src/lib/validation/event.test.ts`, block "toCreateEventRequest". It must return `{ name: 'Mangwon Flea Market Swap Corner', organizerDisplayName: 'Mina' }` for `'  Mangwon Flea Market Swap Corner  '` / `'  Mina  '`, and strip a trailing `\n` and a leading full-width space `U+3000` — agent: `test-author`
- [ ] T019 [US1] Write `frontend/src/components/event/CreateEventScreen.test.tsx`, block "US1 create". Mock `@/lib/api/events` `createEvent` and `next/navigation` `useRouter`; use `renderWithClient` and `userEvent`. It covers — agent: `test-author`:
  - Rendering: the screen shows textboxes labeled "Event name" and "My display name", the notes "Creating an event also registers you as a participant." and "The event starts immediately. There is no separate start button.", and a "Create event" button.
  - Valid submit: typing `'  Mangwon Flea Market Swap Corner  '` / `'  Mina  '` and clicking the button calls `createEvent` once with trimmed values.
  - Double tap: with `createEvent` pending (an unresolved promise), a second click doesn't call it again, and the button has `aria-busy="true"`.
  - On resolve: `localStorage['vr:event:{id}']` holds `participantToken`, `participantId = event.me.participantId`, and `share { name, entryCode, entryUrl }` from the response. `router.replace` is called with `/events/{id}/created`, and `router.push` is not called.
  - Other events: a pre-existing `vr:event:other` record is unchanged.
  - Keyboard: pressing Enter in "Event name" moves focus to "My display name".

### Implementation for User Story 1

- [ ] T020 [P] [US1] Implement `createEvent(body: CreateEventRequest): Promise<EventSession>` and `useCreateEventMutation()` (`useMutation`, `retry: 0`) in `frontend/src/lib/api/events.ts`. Makes T017 pass — agent: `implementer-fe`
- [ ] T021 [P] [US1] Implement `toCreateEventRequest(values)` in `frontend/src/lib/validation/event.ts`, using `String.prototype.trim()` on both fields and never mutating input. Makes T018 pass — agent: `implementer-fe`
- [ ] T022 [US1] Implement `frontend/src/components/event/CreateEventScreen.tsx` (`'use client'`):
  - Layout: start from an Astryx template (`pnpm exec astryx build "mobile create event form"`). Use Astryx `TextInput` with `width="100%"` and text ≥ 16 px, and an Astryx `Button` with `type="submit"` and `isLoading` while pending.
  - Submit: `<form onSubmit>` → `useCreateEventMutation` → `saveEventSession(event.id, { participantToken, participantId: event.me.participantId, share })` → `router.replace(routes.eventCreated(event.id))`.
  - Keyboard: Enter in "Event name" focuses "My display name"; Enter in the last field submits.

  Makes T019 pass — agent: `implementer-fe`
- [ ] T023 [US1] Create the H1 route `frontend/src/app/events/new/page.tsx`, a server component that only renders `<CreateEventScreen />` — agent: `implementer-fe`
- [ ] T024 [P] [US1] UI-only, no automated test (manual check at 360/430 px):
  - Create `frontend/src/components/event/LandingScreen.tsx` per contracts/ui-screens.md "S0". It shows "Vintage Relay", "Event clothing exchange corner", and "Give one garment, receive one garment", with buttons "Create event" → `routes.createEvent()` and "Join with entry code" → `routes.join()`, and helper text "Scan the event QR with your phone camera to join".
  - Make `frontend/src/app/page.tsx` render it.
  - Agent: `implementer-fe`.
- [ ] T025 [P] [US1] UI-only, no automated test:
  - Create `frontend/src/components/ui/ComingSoonScreen.tsx` (prop `title`; shows "This screen is coming soon." and a "Go to start" button → `/`).
  - Add the P1 placeholder `frontend/src/app/join/page.tsx` with the title "Join event".
  - Agent: `implementer-fe`.

**Checkpoint**: US1 works end to end against the real backend (quickstart §3 rows 1, 5, 6). H2 may 404 until US2. Commit T017–T023 as one cycle and T024–T025 as a UI commit, each after `commit-reviewer`.

---

## Phase 4: User Story 2 — Organizer shares the event entry (Priority: P1)

**Goal**: H2 shows the QR of `entryUrl`, the entry code, [Copy link] with a manual fallback, the same-device notice, and navigation to the P2/C2 placeholders. It shows the same info after a reload, and guides to S0 when the device has no data.

**Independent Test**: Seed `vr:event:e1` in `localStorage`, open `/events/e1/created`, and check quickstart §3 rows 6, 7, 9, 10, and 11 plus §4.

### Tests for User Story 2 (REQUIRED - write first) ⚠️

- [ ] T026 [US2] Write `frontend/src/components/event/EventCreatedScreen.test.tsx`. Mock `qrcode.react` so `QRCodeSVG` records its props; seed `localStorage` via `saveEventSession`; stub `navigator.clipboard` per test. It covers — agent: `test-author`:
  - With a record: the screen shows the heading "Event created", the event name as visible text, and the text "Share the QR code or entry code with participants". It shows the exact `entryCode`. The QR has `role="img"` with accessible name "QR code to join {name}", and `QRCodeSVG` received `value` equal to the exact `entryUrl`. It shows the notice "Organizer access is stored on this device. Use the same device until the event ends.". "Register my clothes" links to `/events/e1/my-items/new`, and "Go home" links to `/events/e1`.
  - Copy works: if `writeText` resolves, clicking "Copy link" calls it with `entryUrl`, and a status region (`role="status"`) shows "Link copied".
  - Copy fails: if `writeText` rejects, or `navigator.clipboard` is undefined, the screen shows a read-only textbox whose value is `entryUrl`, plus "Copy this link manually.".
  - No data: with no record for `e1`, the screen shows "This event's share details aren't saved on this device." and a "Go to start" link to `/`, and doesn't render the QR.
  - It never renders `participantToken`.

### Implementation for User Story 2

- [ ] T027 [US2] Implement `frontend/src/components/event/EventCreatedScreen.tsx` (`'use client'`, prop `eventId`):
  - Data: read `getEventShare(eventId)` after mount, rendering nothing before the read so there is no hydration mismatch.
  - Event name: render `share.name` as visible text (contract H2 row).
  - QR: `QRCodeSVG` with `value={entryUrl}`, `size={224}`, `level="M"`, `marginSize={4}`, and fixed `fgColor="#000000"` / `bgColor="#FFFFFF"`. Add a code comment justifying the token-rule exception (scan reliability, R10).
  - Entry code: large monospace text labeled "Entry code".
  - Copy: `navigator.clipboard.writeText`, with the `role="status"` result and the manual fallback (R9).
  - Buttons: links via `routes.newItem` / `routes.eventHome`, built from Astryx components.
  - Makes T026 pass — agent: `implementer-fe`
- [ ] T028 [US2] Create the H2 route `frontend/src/app/events/[eventId]/created/page.tsx`. It is a server component that awaits `params: Promise<{ eventId: string }>` and renders `<EventCreatedScreen eventId={eventId} />` — agent: `implementer-fe`
- [ ] T029 [P] [US2] UI-only, no automated test:
  - Add the P2 placeholder `frontend/src/app/events/[eventId]/(tabs)/page.tsx` (title "Event home") and the C2 placeholder `frontend/src/app/events/[eventId]/(tabs)/my-items/new/page.tsx` (title "Register clothing"), both rendering `ComingSoonScreen`.
  - Don't add a `(tabs)/layout.tsx` or an `events/[eventId]/layout.tsx` (R11).
  - Agent: `implementer-fe`.

**Checkpoint**: US1 + US2 make up the demoable MVP (S0 → H1 → H2 share). Commit T026–T028 as one cycle and T029 as a UI commit, each after `commit-reviewer`.

---

## Phase 5: User Story 3 — Invalid input is explained next to the field (Priority: P2)

**Goal**: Device-side checks and server 422 reasons show the same English messages under the right field. Input is preserved, focus moves to the first invalid field, and editing clears that field's error.

**Independent Test**: Run quickstart §3 rows 2–4. With the API mocked, invalid input sends no request, and a mocked 422 shows the messages under the right fields.

### Tests for User Story 3 (REQUIRED - write first) ⚠️

- [ ] T030 [P] [US3] Add a "validateCreateEventForm" block to `frontend/src/lib/validation/event.test.ts`. The function returns `{ ok: true, value: CreateEventRequest } | { ok: false, errors: Partial<Record<'name' | 'organizerDisplayName', string>> }`. Cases — agent: `test-author`:
  - Empty: `''` and `'   '` give "Please enter an event name." / "Please enter your display name.".
  - Event name length: 60 code points are accepted and 61 give "Use at most 60 characters.".
  - Korean: 60 Korean syllables are accepted and 61 are rejected.
  - Display name length: 30 code points are accepted and 31 give "Use at most 30 characters.".
  - Emoji: `'👍🏽'.repeat(15)` (30 code points) is accepted as a display name, and `'👍🏽'.repeat(16)` is rejected.
  - Control characters: `'Mina\nKim'` and `'Mina\tKim'` give "Remove line breaks and tabs.", while `'Mina\n'` is accepted as `'Mina'` and `'Mina Kim'` is accepted.
  - Precedence: per field the order is `required` → `too_long` → `invalid_characters`, with one message per field.
  - Both invalid: both errors are returned.
  - Exports: `EVENT_NAME_MAX === 60` and `DISPLAY_NAME_MAX === 30`.
- [ ] T031 [P] [US3] Add a "mapServerFieldErrors" block to `frontend/src/lib/validation/event.test.ts`. The function returns `{ fieldErrors, formError: string | null }`. Cases — agent: `test-author`:
  - `{ fields: [{ field: 'name', reason: 'too_long' }] }` gives `fieldErrors.name === 'Use at most 60 characters.'` and `formError === null`.
  - `organizerDisplayName` with `required` gives "Please enter your display name.".
  - `invalid_type` gives "Please enter text.".
  - `invalid_characters` gives "Remove line breaks and tabs.".
  - Two fields are both mapped.
  - The form-level fallback: `{ field: 'theme', reason: 'unknown_field' }`, an unknown reason on `name`, `details: null`, `details: 'x'`, and `{ fields: 'x' }` each give `formError === 'Something went wrong. Please try again.'`.
- [ ] T032 [US3] Add a "US3 validation" block to `frontend/src/components/event/CreateEventScreen.test.tsx` — agent: `test-author`:
  - Empty submit: submitting both fields empty doesn't call `createEvent`. Both messages appear, and both inputs have `aria-invalid="true"` with `aria-describedby` pointing at their message. Focus is on "Event name".
  - Server 422: if `createEvent` rejects with `new ApiError(422, 'VALIDATION_ERROR', 'Invalid.', { fields: [{ field: 'organizerDisplayName', reason: 'too_long' }] })`, the screen shows "Use at most 30 characters." under "My display name", and both typed values remain.
  - Editing: typing in "My display name" clears only that field's error.

### Implementation for User Story 3

- [ ] T033 [US3] Extend `frontend/src/lib/validation/event.ts` with:
  - the limit constants;
  - the Zod-based `validateCreateEventForm` (trim, then `[...value].length` for code points, then `/\p{Cc}/u`);
  - the `FIELD_ERROR_MESSAGES` table (research R6, data-model.md §4);
  - `mapServerFieldErrors(details: unknown)`, which validates `details.fields[]` with Zod (no `as`).

  Makes T030–T031 pass — agent: `implementer-fe`
- [ ] T034 [US3] Integrate validation into `frontend/src/components/event/CreateEventScreen.tsx`:
  - Submit: `validateCreateEventForm` runs before `mutate`.
  - Errors: field errors go through `TextInput` `status={{ type: 'error', message }}`. A `VALIDATION_ERROR` rejection goes through `mapServerFieldErrors`.
  - Focus moves to the first invalid field, via DOM id if `TextInput` has no ref (R7).
  - Editing a field clears only that field's error.

  Makes T032 pass, and T019 must stay green — agent: `implementer-fe`

**Checkpoint**: Commit T030–T034 as one cycle after `commit-reviewer`.

---

## Phase 6: User Story 4 — Network and server failures are recoverable (Priority: P2)

**Goal**: Non-field failures and unavailable storage show a form-level message near the button. Input is kept, and the organizer can retry.

**Independent Test**: Run quickstart §3 rows 12–13. With the API mocked, `NETWORK_ERROR`, `INTERNAL_ERROR`, and unexpected errors show messages, and a retry calls `createEvent` again.

### Tests for User Story 4 (REQUIRED - write first) ⚠️

- [ ] T035 [P] [US4] Write `frontend/src/lib/api/error-messages.test.ts` for `getFormErrorMessage(error: unknown): string`. An `ApiError` of any code (`NETWORK_ERROR`, `BAD_REQUEST`, `INTERNAL_ERROR`, `UNKNOWN_ERROR`) returns its `message`. A non-`ApiError` (e.g., `new Error('boom')`, `'x'`) returns "Something went wrong. Please try again." and never the raw message — agent: `test-author`
- [ ] T036 [US4] Add a "US4 failures" block to `frontend/src/components/event/CreateEventScreen.test.tsx` — agent: `test-author`:
  - Network failure: if `createEvent` rejects with `ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.')`, an `alert` shows that text. Both inputs keep their values, the button is enabled, and clicking it again calls `createEvent` a second time.
  - Server error: an `INTERNAL_ERROR` rejection shows the server message.
  - Unexpected error: a rejection with `new Error('boom')` shows "Something went wrong. Please try again." and not "boom".
  - Storage unavailable: with `Storage.prototype.setItem` throwing, a valid submit doesn't call `createEvent` and shows "This browser can't keep your organizer access. Open the app in a regular (non-private) window and try again.".

### Implementation for User Story 4

- [ ] T037 [P] [US4] Implement `getFormErrorMessage` in `frontend/src/lib/api/error-messages.ts`. Makes T035 pass — agent: `implementer-fe`
- [ ] T038 [US4] Integrate failure handling into `frontend/src/components/event/CreateEventScreen.tsx`:
  - Storage probe: `isStorageAvailable()` runs before validation and the request (FR-017).
  - Errors: non-validation errors go through `getFormErrorMessage` into a `role="alert"` message near the button. That message clears on the next submit.
  - Logging: an unexpected non-`ApiError` calls `logger.error('create event failed', err)` with no values or tokens. Expected `ApiError`s are not logged.

  Makes T036 pass, and T019 and T032 must stay green — agent: `implementer-fe`

**Checkpoint**: All stories are done. Commit T035–T038 as one cycle after `commit-reviewer`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T039 Run `cd frontend && pnpm exec astryx doctor --built src` and fix any findings in the screens. Re-run the checks — agent: `implementer-fe`
- [ ] T040 [P] Search `frontend/src` for `console.` outside `lib/logger.ts`, and for any logging of `participantToken`, `Authorization`, or `entryCode` (FR-016, SC-007). Report what turns up — agent: `explorer` (read-only); fixes go to `implementer-fe`
- [ ] T041 Run the full suites and record the actual results (orchestrator):
  - `cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`
  - `cd frontend && pnpm lint && pnpm typecheck && pnpm test`
- [ ] T042 Run quickstart §3 rows 1–14 at 360 px and 430 px against the local backend, and capture screenshots of S0, H1 (with an error), and H2 for the PR (`docs/rules/dev/common/testing.md` §4) — orchestrator, using the browser
- [ ] T043 Run quickstart §4 on real phones: the layout with the keyboard open, ≥ 9/10 QR scans on the first try, and the LAN copy fallback. This needs the user's devices, so record the result or mark it pending in the PR — user + orchestrator

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none. T001 must finish before T008 (it needs `@tanstack/react-query`); the other tasks are [P].
- **Foundational (Phase 2)**: depends on Setup. F1 (session) comes before F2 (the client imports `getSessionHeaders`). F3 is independent of F1/F2.
- **US1 (Phase 3)**: depends on Foundational.
- **US2 (Phase 4)**: depends on Foundational and on `ComingSoonScreen` (T025). Its data comes from `saveEventSession`, so it is testable without US1. The real flow S0 → H2 needs US1.
- **US3 (Phase 5)** and **US4 (Phase 6)**: both extend `CreateEventScreen.tsx` from US1, so they run after US1 and one after the other. They edit the same file and only one implementer runs per workspace.
- **Polish (Phase 7)**: after all stories.

### Within Each Cycle

The tests (Red, confirmed failing for the expected reason) come first. Then the implementation (Green → Refactor), the checks, `commit-reviewer`, and the commit.

### Parallel Opportunities

- Setup: T002–T007 and T009 can run in parallel.
- Foundational: the test tasks T010, T012, T013, and T015 can be written in parallel. T013 mocks the session module.
- US1: T017 and T018 can be written in parallel, and so can T020 and T021. T024 and T025 can run in parallel with the US1 TDD cycle (different files).
- US2: T029 can run in parallel with T026–T028.
- US3: T030 and T031 can be written together; they are separate blocks of one file, written by one `test-author` run.
- Only one implementer runs per Paseo workspace at a time (AGENTS.md), so "parallel" here means one delegate handling several [P] tasks in a single run.

## Parallel Example: User Story 1

```text
test-author (one run): T017 events.test.ts + T018 validation/event.test.ts + T019 CreateEventScreen.test.tsx
implementer-fe (one run): T020 events.ts + T021 validation/event.ts → T022 CreateEventScreen.tsx → T023 page
implementer-fe (separate UI commit): T024 LandingScreen + T025 ComingSoonScreen / join placeholder
```

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 Setup, then Phase 2 Foundational.
2. US1: create flow. Validate with quickstart §3 rows 1, 5, 6, and 8.
3. US2: H2 share. Validate with rows 6–11 and the phone QR check. **This is the demoable MVP.**

### Incremental Delivery

4. US3: field-level validation (rows 2–4).
5. US4: failure recovery and the storage probe (rows 12–13).
6. Polish: doctor, the logging audit, full suites, screenshots, and the phone test.

## Notes

- [P] = different files, no dependency on incomplete tasks.
- Never edit or skip a failing test to get green. Unimplemented cases use `it.todo`/`it.fails` with a reason, the Vitest equivalent of `xfail`.
- The orchestrator re-runs the checks before marking any task `[X]`.
