# Implementation Plan: Read Event Frontend (Mobile)

**Branch**: `feature/frontend-read-event` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-read-event-frontend/spec.md`

## Summary

Replace the P2 placeholder with a real event home and add M1 (organizer manage) on top of `GET /api/v1/events/{eventId}` from `specs/003-read-event`.

- **Data**: `getEvent` + `useEventQuery` (key factory, 15 s timeout, 30 s polling that stops once closed, no retry on 401/404/malformed). Results are validated with Zod (`parseEvent`). A pure `getEventScreenState` maps session presence and query results to `loading | no-access | not-found | error | ready` for both screens.
- **P2**: event name, Active/Closed badge, "You: {name} (Organizer)", organizer-only Manage card → M1, [Register my clothes] while active.
- **M1**: organizer-only; shared `EventShareCard` (extracted from H2), three counts, [Refresh], placeholder [Close event].
- **Event layout**: new `events/[eventId]/layout.tsx` shows the closed banner for every event screen; new `events/[eventId]/error.tsx` (deferred by 002).
- **Small infra changes**: `apiFetch` gets a per-call `timeoutMessage`; `query-keys.ts`, `routes.manageEvent`, `session.hasEventSession`, `utils/date.formatDateTime`.

See [research.md](research.md) R1–R12.

## Technical Context

**Language/Version**: TypeScript ~6.0.3 (strict), Node 24 LTS, pnpm 12

**Primary Dependencies**: Next.js 16.4 (App Router), React 19.3, Astryx 0.7.4, Tailwind CSS 4, TanStack Query 5, Zod 4, qrcode.react 4 — all already installed; no new dependencies

**Storage**: Existing per-event `localStorage` record via `src/lib/session.ts` (read only; no schema change)

**Testing**: Vitest 5 + Testing Library in jsdom; API functions mocked with `vi.mock` or `fetch` stubs; `renderWithClient`; no network. Manual checks at 360/430 px ([quickstart.md](quickstart.md))

**Target Platform**: Mobile browsers on phones (iOS Safari, Android Chrome), portrait 360–430 px

**Project Type**: Web application frontend (`frontend/`) consuming the existing backend (unchanged)

**Performance Goals**: P2 renders the real event within ~1 s on a normal connection (SC-001); one event request per 30 s per event while active (screens and banner share one cached query)

**Constraints**:
- No request without a device record (FR-002).
- Organizer UI gated by `me.participantId === organizerParticipantId` (`project-structure.md` §2); display only.
- Never log the token, `Authorization` header, or entry code (FR-017).
- Query errors are handled inline; `error.tsx` only for render errors (`error-handling.md` §3).
- `app/` holds routing only; screens in `components/event/`; `'use client'` at the leaves.
- All UI copy in English.

**Scale/Scope**: 2 real screens (P2, M1), 1 layout banner, 1 error boundary, 1 extracted component; about 10 new/changed source modules plus tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| I. Exchange Integrity First | Read-only feature. Organizer gating and closed state come from server fields; no server decision is reproduced. [Close event] does nothing until the close feature exists. | PASS |
| II. Test-First | Non-trivial logic gets failing tests first: `parseEvent`, `getEventScreenState`, `isOrganizer`, `formatDateTime`, `routes.manageEvent`, `hasEventSession`, `getEvent`/retry predicate, `apiFetch` timeout message, `EventShareCard` (moved tests), P2/M1 gating and state rendering, closed banner. Boilerplate (query-keys, page/layout/error files) is `scaffolder` work. | PASS |
| III. Test Scope by Risk | Unit tests target pure logic and the gating/state mapping that would break the demo; visual layout is manual at 360–430 px. | PASS |
| IV. Isolated, Deterministic Tests | Mocked API, cleared `localStorage`, fresh `QueryClient` per test, explicit `timeZone` for date tests. | PASS |
| V. Simplicity | No new dependencies, no global store, no bottom-tab layout yet, no header menu. One shared state mapper and one shared share card instead of per-screen copies. Session recovery stays deferred. | PASS |

**Post-design re-check (after Phase 1)**: PASS.
- Spec alignment made during planning: refresh now includes 30 s polling to follow `data-fetching.md` §4 (FR-013, Edge Cases, Assumptions updated).
- Behavior change to existing code: `apiFetch` default timeout message becomes generic; `createEvent` passes its current message explicitly, so H1 user-facing behavior is unchanged (R2).
- 002's deferred `events/[eventId]/error.tsx` exception is closed by this feature (R6).

## Project Structure

### Documentation (this feature)

```text
specs/004-read-event-frontend/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ui-screens.md    # Routes, screen elements, consumed API handling
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── app/events/[eventId]/
│   ├── layout.tsx                       # NEW: <EventClosedBanner /> + children
│   ├── error.tsx                        # NEW: [Retry] / [Home]
│   └── (tabs)/
│       ├── page.tsx                     # P2 → <EventHomeScreen eventId />
│       └── manage/page.tsx              # NEW: M1 → <ManageEventScreen eventId />
├── components/event/
│   ├── EventHomeScreen.tsx (+ .test.tsx)        # NEW
│   ├── ManageEventScreen.tsx (+ .test.tsx)      # NEW
│   ├── EventClosedBanner.tsx (+ .test.tsx)      # NEW
│   ├── EventScreenStatus.tsx                    # NEW: loading/no-access/not-found/error views
│   ├── EventShareCard.tsx (+ .test.tsx)         # NEW: extracted from H2
│   └── EventCreatedScreen.tsx (+ .test.tsx)     # uses EventShareCard
└── lib/
    ├── event.ts (+ .test.ts)            # NEW: getEventScreenState, isOrganizer, isClosed
    ├── routes.ts (+ .test.ts)           # + manageEvent
    ├── session.ts (+ .test.ts)          # + hasEventSession
    ├── utils/date.ts (+ .test.ts)       # NEW: formatDateTime
    ├── validation/event-response.ts (+ .test.ts)  # NEW: eventSchema, parseEvent
    └── api/
        ├── query-keys.ts                # NEW
        ├── client.ts (+ .test.ts)       # + timeoutMessage option
        └── events.ts (+ .test.ts)       # + getEvent, useEventQuery, retry predicate
```

**Structure Decision**: Frontend-only change inside `frontend/`, following the route map in `docs/rules/dev/frontend/project-structure.md`. `backend/` and `src/types/event.ts` are not modified.

## Delegation Notes (for `/speckit-implement`)

- The orchestrator doesn't edit `frontend/`. Boilerplate (`query-keys.ts`, `manage/page.tsx`, `layout.tsx`, `error.tsx`, P2 `page.tsx` wiring) goes `scaffolder` → `commit-reviewer`.
- Behavior goes `test-author` → `implementer-fe` → `commit-reviewer`, in this order of dependency: (1) `apiFetch` timeout message, routes, session, date, `parseEvent`; (2) `getEvent`/`useEventQuery`, `getEventScreenState`/`isOrganizer`; (3) `EventShareCard` extraction (H2 regression tests stay green); (4) `EventClosedBanner`; (5) `EventHomeScreen`; (6) `ManageEventScreen`.
- Give each delegate: this plan, [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-screens.md](contracts/ui-screens.md), `specs/003-read-event/contracts/read-event.openapi.yaml`, `docs/rules/dev/common/api-contract.md`, `docs/rules/dev/frontend/`, and the checks `cd frontend && pnpm lint && pnpm typecheck && pnpm test`.
- Implementers follow `frontend/AGENTS.md` (Next 16 docs in `node_modules/next/dist/docs/`, Astryx `pnpm exec astryx component <Name>`); `astryx doctor --built` must pass before screens are delivered.

## Complexity Tracking

No constitution violations.
