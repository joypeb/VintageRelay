# Implementation Plan: Create Event Frontend (Mobile)

**Branch**: `feature/frontend-create-event` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-create-event-frontend/spec.md`

## Summary

Build the phone-sized mobile web screens S0 (landing), H1 (create event), and H2 (created/share) on top of the existing `POST /api/v1/events` backend from `specs/001-create-event`.

- **H1** validates both fields on the device with the server's rules (trim, 60/30 code points, no control characters). It checks that browser storage works, then sends one non-retried request with a 15 s timeout. Server field reasons are shown under the matching inputs. On success it saves the participant token per event in `localStorage` and `router.replace`s to H2.
- **H2** renders from that device record, since read-event (02) doesn't exist yet. It shows a client-generated QR of `entryUrl`, the entry code, [Copy link] with a manual fallback, the same-device notice, and links to placeholder P2/C2 screens.

This is the first frontend feature, so it also adds the shared client infrastructure the frontend rules require: env access, `apiFetch` + `ApiError`, error codes/messages, session storage, logger, routes, `QueryClientProvider`, root error boundaries, `removeConsole`, and a test render helper ([research.md](research.md) R12).

## Technical Context

**Language/Version**: TypeScript ~6.0.3 (strict, `noUncheckedIndexedAccess`), Node 24 LTS, pnpm 12

**Primary Dependencies**: Next.js 16.4.3 (App Router), React 19.3, Astryx 0.7.4 (`@astryxdesign/core`, theme-chocolate), Tailwind CSS 4. New: `@tanstack/react-query@^5.105.0`, `zod@^4.6.7`, `qrcode.react@^4.2.0` (R1)

**Storage**: Browser `localStorage`, one record per event under `vr:event:{eventId}`, owned only by `src/lib/session.ts` (R4)

**Testing**: Vitest 5 + Testing Library (React 16, user-event, jest-dom) in jsdom; API functions mocked with `vi.mock`; no network (R13). Manual checks at 360/430 px and a two-phone QR test (quickstart §4)

**Target Platform**: Mobile browsers on phones (iOS Safari, Android Chrome), portrait 360–430 px; desktop keeps the mobile width via the root `max-w-md` container

**Project Type**: Web application frontend (`frontend/`), consuming the existing backend (`backend/`, unchanged)

**Performance Goals**: S0 → H2 in under 30 s of user time (SC-001); no client-side work beyond rendering one QR SVG

**Constraints**:
- No duplicate creation: mutation `retry: 0` and the submit button is blocked while pending (FR-006, SC-005).
- 15 s request timeout, normalized to `NETWORK_ERROR` (R3).
- Never log the token, `Authorization` header, or entry code (FR-016, `logging.md` §3).
- All UI copy in English (FR-015); Astryx components plus token utilities only, with the documented QR color exception (R10).
- Temporary exception: no `src/app/events/[eventId]/error.tsx` until the event layout lands with read-event (02); the root `error.tsx` covers H2 and the placeholders (R12).
- `app/` holds routing only; screens live in `components/<domain>/`; `'use client'` stays at the leaves (`project-structure.md`).

**Scale/Scope**: 3 real screens, 3 placeholder routes, 1 API call; about 12 new source modules plus tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| I. Exchange Integrity First | No exchange rules involved. Organizer status comes from the server response, and the frontend reproduces no server decisions; device validation is convenience only. | PASS |
| II. Test-First | Non-trivial logic (validation, error mapping, `apiFetch`/`ApiError`, session storage, routes, submission flow, copy fallback) gets failing tests first. `tasks.md` will order each test task before the implementation it covers. Pure boilerplate (deps, providers, env, error boundaries, placeholders) is `scaffolder` work with no behavior. | PASS |
| III. Test Scope by Risk | Unit tests follow frontend `testing.md` §2 (api-error, pure functions, form schemas). Component tests cover only the submission and copy logic that could break the demo. Visual layout is verified manually at 360–430 px. No coverage target. | PASS |
| IV. Isolated, Deterministic Tests | jsdom with mocked `lib/api/events.ts`, a stubbed clipboard, a fresh `QueryClient` per test (`renderWithClient`), and `localStorage` cleared per test. No backend or network. | PASS |
| V. Simplicity | No form library, global store, toast viewport, bottom-tab layout, event layout, or query-key factory yet. The H2 snapshot reuses the session record instead of a second store. Open decisions (session recovery, rate limiting) stay deferred. | PASS |

**Post-design re-check (after Phase 1)**: PASS.
- The design adds only the three dependencies mandated or needed by the spec (R1) and the infrastructure the frontend rules mark MUST (R12).
- Rule exceptions: (1) fixed QR colors, justified in code (R10); (2) no `events/[eventId]/error.tsx` until read-event (02), per R12 and Constraints.
- FR-017 (storage probe) was added to the spec during planning to cover the case where organizer access cannot be kept.

## Project Structure

### Documentation (this feature)

```text
specs/002-create-event-frontend/
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
frontend/
├── .env.example                         # NEXT_PUBLIC_API_BASE_URL (unchanged value)
├── next.config.ts                       # + compiler.removeConsole
├── package.json                         # + @tanstack/react-query, zod, qrcode.react
└── src/
    ├── app/
    │   ├── layout.tsx                   # unchanged
    │   ├── providers.tsx                # + QueryClientProvider
    │   ├── page.tsx                     # S0 → <LandingScreen />
    │   ├── error.tsx / not-found.tsx / global-error.tsx
    │   ├── join/page.tsx                # P1 placeholder
    │   └── events/
    │       ├── new/page.tsx             # H1 → <CreateEventScreen />
    │       └── [eventId]/
    │           ├── created/page.tsx     # H2 → <EventCreatedScreen eventId />
    │           └── (tabs)/
    │               ├── page.tsx         # P2 placeholder
    │               └── my-items/new/page.tsx  # C2 placeholder
    ├── components/
    │   ├── event/
    │   │   ├── LandingScreen.tsx
    │   │   ├── CreateEventScreen.tsx (+ .test.tsx)
    │   │   └── EventCreatedScreen.tsx (+ .test.tsx)
    │   └── ui/
    │       └── ComingSoonScreen.tsx
    ├── lib/
    │   ├── env.ts
    │   ├── logger.ts
    │   ├── routes.ts (+ .test.ts)
    │   ├── session.ts (+ .test.ts)
    │   ├── validation/
    │   │   └── event.ts (+ .test.ts)    # schema, limits, field messages, server-detail mapping
    │   └── api/
    │       ├── client.ts (+ .test.ts)   # apiFetch: /api/v1 prefix, timeout, session headers
    │       ├── api-error.ts (+ .test.ts)
    │       ├── error-codes.ts
    │       ├── error-messages.ts
    │       └── events.ts                # createEvent, useCreateEventMutation
    ├── types/
    │   └── event.ts
    └── test/
        └── render.tsx                   # renderWithClient
```

**Structure Decision**: Frontend-only change inside the existing `frontend/` Next.js app, following the layout and route map in `docs/rules/dev/frontend/project-structure.md`. `backend/` is not modified.

## Delegation Notes (for `/speckit-implement`)

- The orchestrator doesn't edit `frontend/`. Boilerplate (deps, env, providers, error boundaries, placeholders, `next.config.ts`, types, test helper) goes `scaffolder` → `commit-reviewer`.
- Behavior goes `test-author` → `implementer-fe` → `commit-reviewer`. Behavior here means: `api-error`/`client`, validation and mapping, session, routes, `CreateEventScreen`, `EventCreatedScreen`.
- Give each delegate: this plan, [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-screens.md](contracts/ui-screens.md), `docs/rules/dev/common/api-contract.md`, `docs/rules/dev/frontend/`, and the checks `cd frontend && pnpm lint && pnpm typecheck && pnpm test`.
- Implementers follow `frontend/AGENTS.md`. That means reading the Next 16 docs in `node_modules/next/dist/docs/` and using Astryx templates/components (`pnpm exec astryx build|template|component`). `astryx doctor --built` must pass before screens are delivered.

## Complexity Tracking

No constitution violations.
