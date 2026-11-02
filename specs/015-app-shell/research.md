# Research: 015 App Shell

**Feature**: specs/015-app-shell/spec.md · **Date**: 2026-11-02
**Source**: Paseo `explorer` codebase research (read-only) plus 015 feature doc references.

## R1 — Session record extension (`savedAt`, list, remove)

- **Decision**: Add optional `savedAt: z.number()` to `EventSessionRecord` in `frontend/src/lib/session.ts`; set it on every `saveEventSession` call; add `listAllEventSessions()` (prefix scan of `vr:event:`, newest-first by `savedAt`) and `removeEventSession(eventId)`.
- **Rationale**: Clarify (2026-11-02) fixed landing order as newest-first; optional keeps existing sessions readable. One-line `removeEventSession` and a prefix scan reuse `getEventSession` validation with no new dependencies.
- **Alternatives considered**: Required `savedAt` (rejected: would invalidate sessions saved by 001–014 builds); insertion-order display with no schema change (rejected: `localStorage` key order is not a defined newest-first signal and cannot survive re-saves).

## R2 — Landing loading and dead-session cleanup

- **Decision**: Load each saved session with one `getEvent` call per `eventId` via TanStack Query `useQueries`; treat `UNAUTHENTICATED`/`NOT_FOUND` as terminal (reuse `shouldRetryEventQuery`, which already returns `false` for both) and call `removeEventSession(eventId)` on those errors. No 30 s polling on landing; single load plus refetch on remount.
- **Rationale**: Reuses the existing query path (`getEvent` → `apiFetch` + `getSessionHeaders`) and the existing no-retry rule, so 401/404 entries are dropped exactly once without extra error plumbing. Polling N event endpoints every 30 s on landing wastes requests for a screen the user leaves in one tap.
- **Alternatives considered**: Manual `fetch` loop outside TanStack Query (rejected: duplicates header/error handling); reusing `useEventQuery` with its 30 s `eventRefetchInterval` unchanged (rejected: landing does not need live status).

## R3 — Tab bar placement

- **Decision**: Create `frontend/src/app/events/[eventId]/(tabs)/layout.tsx` rendering an Astryx `TabList`/`Tab` bar (`layout="fill"`, `size="lg"`, `hasDivider`, `Tab href` links) with `value` derived from the current pathname. No other routing change: `created/` already sits outside `(tabs)`, so H2 shows no tabs by route-group construction.
- **Rationale**: Route groups give FR-006 for free; `href` Tabs render as links (keyboard/screen-reader accessible, no `onChange` state to desync from the URL).
- **Alternatives considered**: Conditional tab bar in the parent `events/[eventId]/layout.tsx` (rejected: pathname sniffing in a shared layout is easier to break when 016–021 add routes); client-side tab state without links (rejected: breaks back/forward and deep links).

## R4 — Organizer header menu and Manage card removal

- **Decision**: Render Astryx `MoreMenu` (`presentation="adaptive"`, `alignment="end"`, `variant="ghost"`, single item linking to the existing Manage route) in a header slot of the `(tabs)` layout, visible only when `me.participantId === organizerParticipantId`. Delete the `{organizer && <ClickableCard label="Manage event" ...>}` block in `EventHomeScreen.tsx` (L96–105).
- **Rationale**: Matches the approved information architecture (organizer tools in a header menu, never a fifth tab) and the organizer-only display rule already codified in project-structure; `adaptive` presentation degrades to a bottom sheet on touch devices.
- **Alternatives considered**: Keeping the Home card and adding the menu too (rejected: duplicates entry points against the spec); a custom dropdown (rejected: Astryx component exists and theming stays consistent).

## R5 — Routes and placeholder pages

- **Decision**: Extend `frontend/src/lib/routes.ts` with `search`, `trades`, `myItems` builders following the existing `encodeURIComponent(eventId)` pattern; add `search/page.tsx` and `trades/page.tsx` ("Coming soon" states) and a `my-items/page.tsx` placeholder with `[+ Register item]` linking to the existing registration form. The 017 feature replaces the placeholder with the real C1 list.
- **Rationale**: Smallest route surface that satisfies FR-007–FR-009 while giving 016/017/019/020 stable paths to build on.
- **Alternatives considered**: Placeholder content inside the tab layout instead of pages (rejected: breaks per-tab URLs and the active-tab rule).

## R6 — SSR and client boundaries

- **Decision**: Keep all `localStorage` access behind the established `useSyncExternalStore` mounted check (as in `EventHomeScreen`/`EventClosedBanner`); keep `page.tsx` files server-side and put session/query logic in client screen components.
- **Rationale**: Follows the existing SSR-guard pattern and the routing rule (thin pages, bodies in `components/<domain>/`).
- **Alternatives considered**: Reading sessions in a server component (rejected: `localStorage` does not exist server-side).

## R7 — Legacy sessions without `savedAt`

- **Decision**: Sessions saved before this feature sort after all timestamped sessions, preserving their relative order.
- **Rationale**: No migration code; old sessions remain usable and naturally sink below newer ones.
- **Alternatives considered**: Backfilling `savedAt` on read (rejected: writes on read complicate the landing load and its tests).
