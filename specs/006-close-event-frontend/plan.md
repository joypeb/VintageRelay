# Implementation Plan: Close Event Frontend (Mobile)

**Branch**: `feature/frontend-close-event` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-close-event-frontend/spec.md`

## Summary

Replace M1's "coming soon" [Close event] with the real flow on top of `POST /api/v1/events/{eventId}/close` from `specs/005-close-event`.

- **Data**: `parseEvent` now rejects unreadable timestamps. `closeEvent` (validated with `parseEvent` + must be `closed`) and `useCloseEventMutation` (`mutationKey`, `retry: 0`; cancel in-flight event reads → `setQueryData` with the server's closed event → non-awaited invalidate, all with `{ queryKey, exact: true }` filters). `useIsCloseEventPending` (`useIsMutating`) enforces one in-flight close per event across remounts. `useEventQuery` gets `structuralSharing: keepClosedEvent` so a stale active read never overwrites a closed event.
- **H3**: new presentational `CloseEventDialog` on Astryx `Dialog` (`purpose="info"`; title, settled-effects-only description, inline `role="alert"` error, destructive [Close event] above [Cancel]; not dismissible while pending).
- **M1**: opens H3, maps failures with pure `getCloseEventFailure` (dialog error vs. forbidden / no-access / not-found views), lets a server-confirmed closed state take precedence over failures, shows an "Active"/"Closed" state label (same `Badge` as P2), announces "Event closed" in its existing live region. P2 and the layout banner update through the shared query cache.
- **Test infra**: jsdom `<dialog>` shim and a `renderWithClient` client option (scaffolder).

See [research.md](research.md) R1–R10.

## Technical Context

**Language/Version**: TypeScript ~6.0.3 (strict), Node 24 LTS, pnpm 12

**Primary Dependencies**: Next.js 16.4 (App Router), React 19.3, Astryx 0.7.4 (`Dialog`, `DialogHeader`, `Banner`, `Button`), TanStack Query 5, Zod 4 — all installed; no new dependencies

**Storage**: Existing per-event `localStorage` record via `src/lib/session.ts` (read only)

**Testing**: Vitest 5 + Testing Library (jsdom), `renderWithClient`, `vi.mock` of `@/lib/api/client` / `@/lib/api/events`; no network. Manual checks at 360/430 px ([quickstart.md](quickstart.md))

**Target Platform**: Mobile browsers (iOS Safari, Android Chrome), portrait 360–430 px

**Project Type**: Web application frontend (`frontend/`) consuming the existing backend (unchanged)

**Performance Goals**: Closed state visible on M1 as soon as the close response arrives; P2 shows it on next visit without a new poll (SC-002)

**Constraints**:
- No request before H3 confirmation; one in-flight close at a time (FR-003, FR-004).
- No optimistic closed state; only server results set it (FR-006, `data-fetching.md` §3).
- Mutation `retry: 0`, button disabled while pending (`data-fetching.md` §3).
- H3 is component state, not a route (`project-structure.md` §2); organizer UI gated by `me.participantId === organizerParticipantId`.
- Never log the token, `Authorization` header, or entry code (FR-013).
- All UI copy in English.

**Scale/Scope**: 1 new component (H3), 1 changed screen (M1), 3 new functions in `events.ts`/`event.ts`, 1 query option; plus tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| I. Exchange Integrity First | The server decides closure and authorization; the UI only shows server results. No closed state is assumed on failure; H3 copy states only settled closure effects (blocked actions, no reopening) and does not promise the approval-gated proposal policies of 005 FR-010/FR-011. | PASS |
| II. Test-First | Failing tests first for timestamp validation, `closeEvent`, `useCloseEventMutation` cache effects, `useIsCloseEventPending`, `keepClosedEvent`, `getCloseEventFailure`, `CloseEventDialog`, and M1 close flow/failure/precedence views; every new behavior (incl. error reset on reopen) has its Red test in the same or an earlier cycle. Unchanged 004 assertions are labelled regression guards. The 004 "coming soon" assertion is removed as an intended behavior change. | PASS |
| III. Test Scope by Risk | Tests target state transitions, single in-flight request, error mapping, and stale-read protection; layout is manual at 360–430 px. | PASS |
| IV. Isolated, Deterministic Tests | Mocked API, fresh `QueryClient` and cleared `localStorage` per test. | PASS |
| V. Simplicity | No new dependencies, no toast infrastructure (reuse live region), reuse `parseEvent`, `EventScreenStatus`, existing forbidden view and closed banner. Open decisions (proposal handling on closure) are not presented as settled. | PASS |

**Post-design re-check (after Phase 1)**: PASS. Deliberate choices recorded in research: Astryx `Dialog` instead of `AlertDialog` (inline error requirement, R4) and `setQueryData` from the server response followed by invalidation (not an optimistic update, R3).

**Re-check after `/speckit-analyze` (F01–F07, F09, F11, F12)**: PASS. Fixed: H3 copy limited to settled effects (Principle V/AGENTS.md open decisions), reopen-reset test moved before its implementation (Principle II), v5 filter objects, event-scoped pending, closed-state precedence, timestamp validation, jsdom dialog shim, cache-connected integration tests, `purpose="info"`, non-awaited invalidation.

## Project Structure

### Documentation (this feature)

```text
specs/006-close-event-frontend/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ui-close-event.md  # Consumed API handling, M1 changes, H3 elements
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── components/event/
│   ├── CloseEventDialog.tsx (+ .test.tsx)     # NEW: H3
│   ├── ManageEventScreen.tsx (+ .test.tsx)    # [Close event] → H3, failure views, precedence, "Event closed"
│   └── EventHomeScreen.test.tsx               # + cache-connected closed regression guard
├── lib/
│   ├── event.ts (+ .test.ts)                  # + getCloseEventFailure, keepClosedEvent
│   ├── validation/event-response.ts (+ .test.ts)  # timestamps must be parseable
│   └── api/
│       ├── query-keys.ts                      # + mutationKeys.closeEvent
│       └── events.ts (+ .test.ts)             # + closeEvent, useCloseEventMutation, useIsCloseEventPending; structuralSharing
└── test/
    ├── dialog-polyfill.ts                     # NEW: jsdom <dialog> shim (test infra)
    └── render.tsx                             # renderWithClient accepts/returns a QueryClient
frontend/vitest.setup.ts                       # imports the dialog shim
```

**Structure Decision**: Frontend-only change inside `frontend/`. `backend/`, routes, `src/types/event.ts`, `EventHomeScreen.tsx`, and `EventClosedBanner.tsx` are not modified.

## Delegation Notes (for `/speckit-implement`)

- The orchestrator doesn't edit `frontend/`. Test infrastructure only (dialog shim, `vitest.setup.ts` import, `renderWithClient` option) goes `scaffolder` → `commit-reviewer` (R10; `vitest.setup.ts` is outside other delegates' allowed paths).
- Cycles `test-author` → `implementer-fe` → `commit-reviewer`, in dependency order: (0) timestamp validation; (1) `getCloseEventFailure`, `keepClosedEvent`; (2) keys, `closeEvent`, `useCloseEventMutation`, `useIsCloseEventPending`, structural sharing; (3) `CloseEventDialog`; (4) `ManageEventScreen` close flow (removes the "coming soon" test); (5) failures and closed-state precedence; (6) already-closed.
- Give each delegate: this plan, [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-close-event.md](contracts/ui-close-event.md), `docs/plans/api/03-close-event.md`, `specs/005-close-event/contracts/close-event.openapi.yaml`, `docs/rules/dev/common/api-contract.md`, `docs/rules/dev/frontend/`, and the checks `cd frontend && pnpm lint && pnpm typecheck && pnpm test`.
- Implementers follow `frontend/AGENTS.md` (Next 16 docs in `node_modules/next/dist/docs/`, `pnpm exec astryx component Dialog`); `astryx doctor --built` must pass before screens are delivered.

## Complexity Tracking

No constitution violations.
