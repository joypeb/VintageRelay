# Quickstart: Validate 015 App Shell

**Feature**: specs/015-app-shell/spec.md · **Plan**: specs/015-app-shell/plan.md

## Prerequisites

- `cd frontend && pnpm install` (once); two joined events on the test device (join via code or QR, or reuse sessions from the 007 flow).
- Dev server: `cd frontend && pnpm dev`.

## Validation scenarios

### 1. Landing list (spec Story 1)

1. Open `/` with two saved sessions → "Your events" appears above Create/Join, each with name and Active/Closed, newest joined first.
2. Tap an entry → its event home opens.
3. In DevTools, delete one event's session value (or join with a revoked token) and reload → the dead entry disappears and does not return.
4. Clear all `vr:event:*` keys and reload → no list; Create event and Join with code or QR remain.

Expected: FR-001–FR-004, SC-001–SC-003.

### 2. Tabs and placeholders (spec Story 2)

1. Open any in-event screen except Created/share → Home, Search, Trades, My items visible in order, current tab highlighted.
2. Open `/events/<id>/created` → no tab bar.
3. Search tab → "Coming soon", no filters. Trades tab → "Coming soon", no actions.
4. My items tab → placeholder with `[+ Register item]` → opens the existing registration form.

Expected: FR-005–FR-009, SC-004–SC-005.

### 3. Organizer menu (spec Story 3)

1. As organizer, open the header menu → Manage event present and opens management.
2. As non-organizer → no Manage entry.
3. Home tab (either role) → no Manage card.

Expected: FR-010–FR-011, SC-006.

### 4. Closed event

1. Close the event (organizer), then browse all tabs → readable with the closed banner; no request/register/edit/delete/manage actions.

Expected: FR-012.

## Automated checks

```sh
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

New/updated unit tests cover: session `savedAt` sort order (including legacy records without it), `removeEventSession`, new route builders, tab-active derivation, organizer-menu visibility rule.

## Manual UI pass

- Verify at 360–430 px widths with screenshots in the PR.
- Run `/impeccable critique` on the landing screen and the tab bar before review.
