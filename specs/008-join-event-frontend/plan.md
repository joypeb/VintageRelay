# Implementation Plan: Join Event Frontend (Mobile)

**Branch**: `feature/frontend-join-event` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-join-event-frontend/spec.md`

## Summary

Replace the P1 "coming soon" placeholder with the real join flow, built on `GET /api/v1/entry-codes/{entryCode}` and `POST /api/v1/events/{eventId}/participants` from `specs/007-join-event`.

- **Route**: `app/join/page.tsx` (server component) awaits `searchParams` and passes the first `code` to a client `JoinEventScreen` as `initialCode` (R1).
- **Data**:
  - `lookupEntryCode` and `joinEvent` use `apiFetch(null, …)`, so no `Authorization` header is sent, with a 15 s timeout. Responses are validated by `parseEventPreview` and `parseJoinSession`. The latter reuses `eventSchema` and checks the event ID, `isOrganizer=false`, a participant ID that is non-empty and not the organizer's, `stats: null`, and the token (R2).
  - `apiFetch` normalizes an unreadable 2xx body to `UNKNOWN_ERROR`, so parser messages never reach the logs (R2, R9).
  - `useEntryCodePreviewQuery(code | null)` is a query keyed by the submitted code (`retry: 0`, `gcTime: 0`). This gives stale-result protection. `useIsEntryCodeLookupPending` keeps [Find event] busy while any lookup is in flight, so there is only one lookup at a time (R3).
  - `useJoinEventMutation` uses `retry: 0` (R4).
- **Logic**:
  - `validation/join.ts` holds code/name checks, matching the backend's 1–30 characters and no control characters, plus 422 detail mapping (R7).
  - `getLookupFailure` and `getJoinFailure` are pure mappers in `lib/event.ts` (R6).
- **P1**: `JoinEventScreen` derives one of `codeEntry`, `lookingUp`, `active`, `closed`, `alreadyJoined`, or `joining`.
  - On success it saves the session without `share`, seeds `queryKeys.event(id)` with the returned event, then calls `router.replace` to P2 (R4, R5, R8).
  - It never sends a join when storage is unavailable or the device already holds access. Device access is re-checked immediately before the POST (R5).
  - A join that reveals the event is closed is announced and moves focus to the closed message (R8).

See [research.md](research.md) R1–R10, [data-model.md](data-model.md), and [contracts/ui-join-event.md](contracts/ui-join-event.md).

## Technical Context

**Language/Version**: TypeScript ~6.0.3 (strict), Node 24 LTS, pnpm 12

**Primary Dependencies**: Next.js 16.4 (App Router), React 19.3, Astryx 0.7.4 (`TextInput`, `Button`, `Badge`, `Heading`, `Text`, `VStack`, `Card`), TanStack Query 5, Zod 4. All are installed; no new dependencies.

**Storage**: Existing per-event `localStorage` record via `src/lib/session.ts`. This feature writes a record without `share` and reads it to detect "already joined".

**Testing**: Vitest 5 + Testing Library (jsdom) and `renderWithClient`. Screen tests mock only `@/lib/api/client` (`apiFetch`) and `next/navigation`, and keep the real API functions and hooks (R10). Unit tests mock `apiFetch` or `fetch`. No network. Manual checks at 360/430 px ([quickstart.md](quickstart.md)).

**Target Platform**: Mobile browsers (iOS Safari, Android Chrome), portrait 360–430 px

**Project Type**: Web application frontend (`frontend/`) consuming the existing backend, which is unchanged

**Performance Goals**: The preview appears as soon as the lookup returns. P2 renders from the seeded join result without a loading flash (SC-001/SC-002).

**Constraints**:
- At most one lookup and one join in flight. The join uses `retry: 0` because it is not idempotent (`04-join-event.md`, `data-fetching.md` §3).
- No join is sent for closed previews, invalid names, unavailable storage, or a device that already holds access (SC-004).
- P2 is reached only after a validated successful (2xx) join response (FR-009). `apiFetch` does not expose the status code, so 201 is not checked specifically. No optimistic state.
- No `Authorization` header on either call. The token, headers, entry code, and response bodies are never written to app logs (FR-015). Dev-server request logging is out of scope (R9).
- All UI copy is in English, and the copy is fixed in the [UI contract](contracts/ui-join-event.md).

**Scale/Scope**:
- 1 new screen, 1 changed page, and 1 small shared change in `apiFetch` (unreadable 2xx body).
- 1 new validation module, 2 failure mappers, 2 API functions, and 3 hooks.
- 2 types and 1 query-key family (`entryCodePreview` and the `entryCodePreviews` prefix).
- Plus tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| I. Exchange Integrity First | Server results drive every state: closed, taken, and not found come from the server, and P2 is reached only after a validated successful (2xx) join response. The entry code is never treated as authentication. The "already joined" guard is a device-side default, not a server rule, and does not touch exchange state. | PASS |
| II. Test-First | Failing tests come first for: `apiFetch` unreadable-body normalization, join validation, 422 mapping, `getLookupFailure`/`getJoinFailure`, `parseEventPreview`/`parseJoinSession`, `lookupEntryCode`/`joinEvent` (URL, no auth, validation), and the `JoinEventScreen` flows (auto lookup, typed lookup, closed, already joined, storage, each failure, single in-flight including edit-during-pending-lookup, submit-time already-joined re-check, stale-preview clearing, closed-state announcement, no secrets in logs, success hand-off). Each state reset is implemented in the same cycle as the test that first exercises it. The existing "coming soon" behavior has no test to remove. | PASS |
| III. Test Scope by Risk | Unit tests cover the mappers and validation. Screen tests cover state transitions and the hand-off. Layout is checked manually at 360–430 px. | PASS |
| IV. Isolated, Deterministic Tests | Mocked `apiFetch` (never the real network) and router, a fresh `QueryClient`, and cleared `localStorage` per test. Storage failure is simulated by stubbing `isStorageAvailable`/`saveEventSession`. | PASS |
| V. Simplicity | No new dependencies. Reuses `apiFetch`, `eventSchema`, `getFormErrorMessage`, `session.ts`, the `Badge` state label, and the `CreateEventScreen` form pattern. Session recovery and returning-participant verification stay open decisions and are not implemented. | PASS |

**Post-design re-check (after Phase 1)**: PASS. Deliberate choices are recorded in research:
- a query (not a mutation) for the lookup (R3)
- seeding the event cache from the successful join response as a server result, not an optimistic update (R4)
- device-side control-character validation, mirroring backend `ParticipantCreate` (R7)
- a dedicated session-save-failure message after a successful join (R4)

**Re-check after `/speckit-analyze` (C1, C2, H1–H4, M1–M7, L1–L2)**: PASS. Fixed:
- the screen-test mock boundary moved to `apiFetch` (Principle IV)
- the reset logic moved into the cycle that tests it (Principle II)
- [Find event] serialized across codes
- stricter join-session identity checks
- unreadable-body normalization without logging
- the submit-time already-joined re-check
- the closed-state announcement and focus
- the log scope clarified
- the stale-access limitation documented as an open decision
- SC-005 scoped to saved access
- `pnpm build` and screenshots added before the PR
- the "validated 2xx" wording

## Project Structure

### Documentation (this feature)

```text
specs/008-join-event-frontend/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ui-join-event.md # Consumed API handling, route, P1 elements
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── app/join/page.tsx (+ .test.tsx)            # server page: await searchParams → <JoinEventScreen initialCode>
├── components/event/
│   └── JoinEventScreen.tsx (+ .test.tsx)      # NEW: P1
├── lib/
│   ├── event.ts (+ .test.ts)                  # + getLookupFailure, getJoinFailure
│   ├── validation/
│   │   ├── join.ts (+ .test.ts)               # NEW: validateEntryCode, validateDisplayName, mapJoinServerFieldErrors
│   │   └── event-response.ts (+ .test.ts)     # + parseEventPreview, parseJoinSession
│   └── api/
│       ├── client.ts (+ .test.ts)             # unreadable 2xx body → ApiError UNKNOWN_ERROR
│       ├── query-keys.ts                      # + queryKeys.entryCodePreview
│       └── events.ts (+ .test.ts)             # + lookupEntryCode, joinEvent, useEntryCodePreviewQuery, useIsEntryCodeLookupPending, useJoinEventMutation
└── types/event.ts                             # + EventPreview, JoinEventRequest
```

`src/components/ui/ComingSoonScreen.tsx` stays in place, because other routes still use it.

**Structure Decision**: This is a frontend-only change inside `frontend/`. `backend/`, `routes.ts`, `session.ts`, `EventHomeScreen.tsx`, and `LandingScreen.tsx` are not modified.

## Delegation Notes (for `/speckit-implement`)

- The orchestrator doesn't edit `frontend/`. Types and the query key are boilerplate (`scaffolder` → `commit-reviewer`), or they are folded into the first cycle that uses them.
- Run cycles `test-author` → `implementer-fe` → `commit-reviewer` in dependency order:
  0. `apiFetch` unreadable-body normalization
  1. `validation/join.ts`
  2. `parseEventPreview`/`parseJoinSession`
  3. `getLookupFailure`/`getJoinFailure`
  4. `lookupEntryCode`/`joinEvent` + hooks
  5. `JoinEventScreen` link lookup, join success hand-off, storage guards + page wiring
  6. typed lookup (code entry, serialized lookups)
  7. join failures (including the state resets they exercise)
  8. already-joined (including the submit-time re-check)
- Give each delegate:
  - this plan, [research.md](research.md), [data-model.md](data-model.md), and [contracts/ui-join-event.md](contracts/ui-join-event.md)
  - `docs/plans/api/04-join-event.md` and `specs/007-join-event/contracts/join-event.openapi.yaml`
  - `docs/rules/dev/common/api-contract.md` and `docs/rules/dev/frontend/`
  - the checks `cd frontend && pnpm lint && pnpm typecheck && pnpm test`
- Implementers follow `frontend/AGENTS.md`: Next 16 docs in `node_modules/next/dist/docs/` (for `searchParams`), and `pnpm exec astryx component TextInput` / `Badge` for props such as read-only and `autoCapitalize`. `astryx doctor --built` must pass before the screen is delivered.

## Complexity Tracking

No constitution violations.
