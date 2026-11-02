# Implementation Plan: 015 App Shell — Landing Event List and Bottom Tabs

**Branch**: `impeccable-init-feature-015` | **Date**: 2026-11-02 | **Spec**: specs/015-app-shell/spec.md

**Input**: Feature specification from `/specs/015-app-shell/spec.md`

## Summary

Give the app its final skeleton without touching the backend: the landing screen lists already-joined events (newest first, dead sessions dropped) above Create/Join, and every in-event screen except Created/share gets Home | Search | Trades | My items tabs, with Search/Trades as "Coming soon" states, My items as a placeholder linking to the existing form, and Manage event moved from the Home card to an organizer-only header menu. Approach from research: extend the session record with optional `savedAt` plus list/remove helpers, load landing entries with one non-polled query per session, add a `(tabs)/layout.tsx` with Astryx link Tabs, and extend route builders.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Next.js 16.4.3, React 19.3.0

**Primary Dependencies**: `@astryxdesign/core` 0.7.4 + `theme-chocolate`, `@tanstack/react-query` 5.105, `zod` 4.6.7

**Storage**: Browser `localStorage` session records (`vr:event:<id>`); no backend or schema changes

**Testing**: `vitest` 5 + `jsdom` + Testing Library, colocated `src/**/*.test.{ts,tsx}`; screens verified manually at 360–430 px

**Target Platform**: Mobile web (`web`)

**Project Type**: Web application frontend (Next.js app router)

**Performance Goals**: Landing performs one event read per saved session (a handful per device); no polling on landing; in-event screens keep the existing 30 s active-event poll

**Constraints**: English UI; Astryx components only (no raw layout `div`); routing-only `page.tsx` (bodies in `components/<domain>/`); `localStorage` access client-side only behind the mounted check; bearer tokens leave the browser only as `Authorization` headers

**Scale/Scope**: Neighborhood events of a few participants; a handful of saved sessions per device; 4 tabs and 3 placeholder pages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Exchange Integrity**: No intents, proposals, consent, confirmation, or closure logic touched. Pass.
- **II. Test-First**: Pure logic (session list/remove/sort, route builders, tab-active derivation, organizer-visibility rule) gets failing tests before implementation; screens verified manually. Pass.
- **III. Test Scope by Risk**: Unit tests target pure logic only; tab bar and landing verified manually at 360–430 px. Pass.
- **IV. Isolated, Deterministic Tests**: `localStorage` via jsdom; queries stubbed; no external services. Pass.
- **V. Simplicity**: Smallest diff — session helpers, one layout, three small pages, route builders, card removal. No new dependencies. Pass.

Re-check after Phase 1 (research.md, data-model.md, contracts/tabs.md, quickstart.md): no new state, entities, or contracts beyond the spec; no violations introduced. Pass.

## Project Structure

### Documentation (this feature)

```text
specs/015-app-shell/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── tabs.md          # Tab paths, order, and visibility rules for 016–021
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
frontend/src/
├── app/
│   ├── page.tsx                                   # Landing composes Your-events list (S0)
│   └── events/[eventId]/
│       ├── created/page.tsx                       # Unchanged; stays outside (tabs)
│       └── (tabs)/
│           ├── layout.tsx                         # NEW: tab bar + header menu slot
│           ├── page.tsx                           # Home minus Manage card
│           ├── search/page.tsx                    # NEW: "Coming soon"
│           ├── trades/page.tsx                    # NEW: "Coming soon"
│           └── my-items/page.tsx                  # NEW placeholder (replaced by 017)
├── components/
│   ├── ui/BottomTabBar.tsx                        # NEW (Astryx TabList/Tab wrapper)
│   ├── ui/EventHeaderMenu.tsx                     # NEW (Astryx MoreMenu wrapper, organizer-only)
│   └── event/
│       ├── LandingScreen.tsx                      # Your-events list section
│       ├── EventHomeScreen.tsx                    # Remove Manage card block
│       └── YourEventsList.tsx                     # NEW: list + per-session query state
├── lib/
│   ├── session.ts                                 # savedAt + listAll/remove helpers (+ tests)
│   └── routes.ts                                  # search/trades/myItems builders (+ tests)
```

**Structure Decision**: Frontend-only change inside the existing Next.js app-router layout; shared tab/menu chrome lives in `components/ui/` per the two-domain rule, screen bodies stay in `components/event/`, and tests colocate with their targets.

## Complexity Tracking

No constitution violations; nothing to justify.
