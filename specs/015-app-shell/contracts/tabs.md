# UI Contract: Tab Layout (015, extended by 016–021)

**Purpose**: Stable paths, tab order, and visibility rules that later features build on. Frontend-only; no HTTP contract changes.

## Routes (under `/events/[eventId]/`)

| Tab | Path | 015 content |
|---|---|---|
| Home | `/events/<id>` (`(tabs)/page.tsx`) | Today's home content minus the Manage card |
| Search | `/events/<id>/search` | "Coming soon" (real search in 019) |
| Trades | `/events/<id>/trades` | "Coming soon" (real trades in 020) |
| My items | `/events/<id>/my-items` | Placeholder + `[+ Register item]` → existing form (real list in 017) |

Out of tabs: `/events/<id>/created` (share screen) renders with no tab bar.

## Rules

1. Order is always Home, Search, Trades, My items; the active tab derives from the pathname.
2. The tab bar uses link navigation (back/forward and deep links work).
3. The header menu shows Manage event only when `me.participantId === organizerParticipantId` and the event status is active.
4. Closed events keep all tabs readable; action entry points (request, register, edit, delete, manage) stay hidden.
5. Later features replace placeholder page bodies without moving paths or changing tab order.
6. The Manage route renders inside the `(tabs)` layout with no tab highlighted.
