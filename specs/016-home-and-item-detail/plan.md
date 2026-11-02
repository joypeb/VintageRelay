# Implementation Plan: 016 Home Grid and Item Detail

**Branch**: `speckit-specify-016-feature-plan` | **Date**: 2026-11-02 | **Spec**: specs/016-home-and-item-detail/spec.md

**Input**: Feature specification from `/specs/016-home-and-item-detail/spec.md`

## Summary

Turn Home into the marketplace view without touching the backend: extend `EventHomeScreen` with a two-column grid of other participants' available garments (newest first, 3:4 main photo + title, from the existing list endpoint with `ownership=others&status=available`), and add the `items/[itemId]` detail route reusing the 014 `PhotoCarousel` with server `photos[]`, category/title/entered-measurements/description, owner name with organizer badge, withdrawn state, and a visible-but-disabled [Request exchange]. Approach from research: extend `clothing-response.ts` to the full `Clothing` zod schema without breaking `registerClothing`, add list/detail fetchers plus `useClothingListQuery`/`useClothingQuery` in `lib/api/clothing.ts` following the `useEventQuery` pattern (focus/pull refresh, no polling), scaffold the grid from an Astryx product-grid template, and reuse `EventScreenStatus` patterns for loading/error/not-found states.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Next.js 16.4.3, React 19.3.0

**Primary Dependencies**: `@astryxdesign/core` 0.7.4 + `theme-chocolate`, `@tanstack/react-query` 5.105, `zod` 4.6.7

**Storage**: None (server state via TanStack Query; no backend or schema changes)

**Testing**: `vitest` 5 + `jsdom` + Testing Library, colocated `src/**/*.test.{ts,tsx}`; screens verified manually at 360–430 px

**Target Platform**: Mobile web (`web`)

**Project Type**: Web application frontend (Next.js app router)

**Performance Goals**: Home performs one clothing-list read per visit; detail performs one clothing read per garment; no polling on either (focus regain + pull-to-refresh only)

**Constraints**: English UI; Astryx components only (no raw layout `div`); routing-only `page.tsx` (bodies in `components/<domain>/`); session token selected by `eventId` via `apiFetch`; all HTTP through `apiFetch`, types via zod `safeParse`; bearer tokens leave the browser only as `Authorization` headers

**Scale/Scope**: Neighborhood events of a few participants; tens of garments per event; 1 extended screen + 1 new screen

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Exchange Integrity**: No intents, proposals, consent, confirmation, or closure logic touched. The only exchange-adjacent element is a disabled button that creates nothing. Pass.
- **II. Test-First**: Pure logic (response parsing, query keys, route builder, measurement-label derivation, own-garment guard) gets failing tests before implementation; screens verified manually. Enforced in tasks.md. Pass.
- **III. Test Scope by Risk**: Unit tests target validation/state transformations only; grid and detail verified manually at 360–430 px with screenshots. Pass.
- **IV. Isolated, Deterministic Tests**: `apiFetch` mocked; no external services. Pass.
- **V. Simplicity**: Smallest diff — extend one validation module, one API module, one screen, one new route + one new screen component. No new dependencies. Pass.

Re-check after Phase 1 (research.md, data-model.md, contracts/clothing-read.md, quickstart.md): no new state, entities, or contracts beyond the spec; no violations introduced. Pass.

## Project Structure

### Documentation (this feature)

```text
specs/016-home-and-item-detail/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── clothing-read.md # Consumed list/detail endpoints + new frontend additions
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
frontend/src/
├── app/events/[eventId]/(tabs)/
│   ├── page.tsx                             # Unchanged wrapper; body in EventHomeScreen
│   └── items/[itemId]/page.tsx              # NEW (B3): server wrapper → ClothingDetailScreen
├── components/
│   ├── clothing/
│   │   ├── PhotoCarousel.tsx                # Reused unchanged (server photos via props)
│   │   ├── HomeClothingGrid.tsx             # NEW: two-column grid + empty state
│   │   └── ClothingDetailScreen.tsx         # NEW (B3): carousel + fields + disabled request
│   └── event/
│       ├── EventHomeScreen.tsx              # Extend: grid below header/registration status
│       └── EventScreenStatus.tsx            # Reused patterns for error/not-found states
├── lib/
│   ├── api/clothing.ts                      # Add listClothing/getClothing + query hooks (+ tests)
│   ├── api/query-keys.ts                    # Add clothingList/clothing keys (+ tests)
│   ├── validation/clothing-response.ts      # Add full-Clothing schemas + parse fns (+ tests)
│   ├── validation/clothing-form.ts          # Export MEASUREMENT_LABELS/category labels for reuse
│   └── routes.ts                            # Add itemDetail builder (+ tests)
├── types/
│   └── clothing.ts                          # NEW: Clothing/ClothingList types (events pattern)
```

**Structure Decision**: Frontend-only change inside the existing Next.js app-router layout; screen bodies stay in `components/<domain>/` (`clothing` for grid + detail, `event` for the extended home), `page.tsx` files stay routing-only, and tests colocate with their targets.

## Complexity Tracking

No constitution violations; nothing to justify.
