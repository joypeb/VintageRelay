# Quickstart: Validate 016 Home Grid and Item Detail

**Feature**: specs/016-home-and-item-detail/spec.md · **Plan**: specs/016-home-and-item-detail/plan.md

## Prerequisites

- `cd frontend && pnpm install` (once); backend running with at least two participants holding available garments in the same event (register via the 014 form on two devices or sessions).
- Dev server: `cd frontend && pnpm dev`.

## Validation scenarios

### 1. Home grid (spec Story 1)

1. As participant A with no garments, open Home → other participants' available garments appear two per row, newest first, each with its 3:4 main photo and title.
2. Register a garment as A and reopen Home → A's own garment does not appear.
3. New event with no available garments of others → empty state inviting item registration.
4. Offline or stopped backend → error state with [Try again]; no stale or invented items.
5. Refocus the tab or pull to refresh → list updates; no automatic polling in between.

Expected: FR-001–FR-009, SC-001–SC-003, SC-007 (header + "Clothing registered." kept).

### 2. Item detail (spec Story 2)

1. Tap a card with several photos → detail shows all photos in order with the familiar carousel (swipe, arrows on desktop, position indicator, full-photo overlay with X/Escape).
2. Detail shows category label, full title, full description, only entered measurements labelled in inches; no AI estimates.
3. Open a garment with no measurements → no measurements section (never zeros).
4. Organizer-owned garment → organizer badge next to the owner name; non-organizer → no badge.
5. Open a withdrawn garment directly → withdrawn badge with the disabled coming-soon button (FR-019 applies to any detail).
6. Open a bogus id → not-found state with a way back to Home.

Expected: FR-010–FR-018, SC-004, SC-006.

### 3. Disabled request (spec Story 3)

1. Any detail → [Request exchange] visible but disabled with the "Coming soon" note; activating it creates nothing.

Expected: FR-019, SC-005.

### 4. Closed event

1. Close the event (organizer), then browse Home and details → readable; register/request actions hidden or disabled.

Expected: FR-020.

## Automated checks

```sh
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

New/updated unit tests cover: full-`Clothing` response parsing (list + detail, withdrawn passthrough, malformed → `UNKNOWN_ERROR`), new query keys, `routes.itemDetail` builder, measurement-label derivation, own-garment exclusion guard.

## Manual UI pass

- Verify at 360–430 px widths with screenshots in the PR.
- Pull down on the Home grid → the list reloads with no polling in between.
- Edge pass: 1-photo garment (single frame, no arrows/indicator), 10-photo garment (all reachable), very long title (card layout holds), overlay open/close (focus returns to the photo), reduced-motion device (no slide animation).
- Run `/impeccable critique` on Home and the item detail before review.
