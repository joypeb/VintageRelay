# 015 — App Shell: Landing Event List and Bottom Tabs

**Area:** Frontend only · **Depends on:** — · **Next:** [016](016-home-and-item-detail.md), [017](017-my-items-edit-delete.md) · Common steps: [README](README.md#3-spec-kit-run-same-for-every-feature)

## 1. Feature

Give the app its final skeleton. The landing screen lists events already joined on this device before Create/Join, and every event screen gets four bottom tabs: **Home, Search, Trades, My items**. Organizer tools move from the Home card to a header menu. This feature also runs `/impeccable init` once so later frontend work has a `PRODUCT.md`.

## 2. Scope

**In**
- Step 0: `/impeccable init` → `PRODUCT.md` at the repository root (see section 7).
- S0 landing: "Your events" list from sessions saved on this device, each showing event name and Active/Closed; tap → P2. Create event and Join with code or QR stay below. Entries whose event answers `401`/`404` are removed from storage.
- `(tabs)` layout with a bottom tab bar (Home, Search, Trades, My items) on every in-event screen except H2 (created/share).
- Search (`(tabs)/search/page.tsx`) and Trades (`(tabs)/trades/page.tsx`) tabs: "Coming soon" empty states.
- My items tab: placeholder with [+ Register item] → existing C2 (`my-items/new`); the real list arrives in 017.
- M1 Manage event reachable from a header menu, organizer only; remove the Manage card from Home.
- Home keeps today's content minus the Manage card (the grid arrives in 016).

**Out:** Home grid (016), My items list (017), search (019), trades (020), any backend change.

## 3. References

| Document | Sections |
|---|---|
| [App flow redesign](../../superpowers/specs/2026-11-02-app-flow-redesign-design.md) | 4.1 Navigation and screens; 5 Landing list, Organizer tools, Closed event; 6 Roadmap row 015 |
| [Screen flow](../../flows/screen-flow-v1.md) | 3 Overall Structure; 4.1 S0, M1, P2 entry; 6 Global States |
| [Mockup v2](../../flows/mockup-flow-v2.html) | Screens 1 (Landing) and 2 (tab bar) |
| [API 02 Read event](../api/02-read-event.md) | Response fields (`name`, `status`, `me`, `organizerParticipantId`) and errors |
| [API README](../api/README.md) | 3 Authentication (401 vs 404) |
| [Frontend project structure](../../rules/dev/frontend/project-structure.md) | 2 Routes (tab layout, `search`, `trades`, `my-items`, `manage`), organizer UI rule |
| [Frontend data fetching](../../rules/dev/frontend/data-fetching.md) | `apiFetch`, session per event, event polling (30 s) |
| [Frontend error handling](../../rules/dev/frontend/error-handling.md) | Missing session → P1, closed banner |
| [Frontend styling](../../rules/dev/frontend/styling.md), [frontend/AGENTS.md](../../../frontend/AGENTS.md) | Astryx templates/components, tokens, accessibility |
| [Frontend testing](../../rules/dev/frontend/testing.md) | What needs automated tests vs manual checks |

## 4. Existing Code

- `frontend/src/components/event/LandingScreen.tsx` — S0 today (Create/Join only).
- `frontend/src/lib/session.ts` — `vr:event:<id>` records, `getEventSession`, `isStorageAvailable`; needs a way to list all saved sessions and remove one.
- `frontend/src/lib/api/events.ts` — `getEvent`, `useEventQuery`, `shouldRetryEventQuery`.
- `frontend/src/components/event/EventHomeScreen.tsx` — P2 today; the Manage card to remove; "Clothing registered." status.
- `frontend/src/components/event/ManageEventScreen.tsx`, `EventClosedBanner.tsx`, `EventScreenStatus.tsx`.
- `frontend/src/app/events/[eventId]/(tabs)/` — route group exists without a `layout.tsx`; `created/` sits outside it.
- `frontend/src/lib/routes.ts` — add `search`, `trades`, `myItems` builders.

## 5. Already Decided

- Tab names and order: Home | Search | Trades | My items. H2 shows no tabs.
- Organizer tools live in a header menu, not a fifth tab; shown only when `me.participantId === organizerParticipantId`.
- Closed events: all tabs stay readable; register/edit/delete/request actions are hidden.
- Landing list loads each event with API 02; `401`/`404` entries are removed from the device.
- No new API.

## 6. Open Questions for Clarify

- Landing list order: sessions store no join time today. Add a `savedAt` to the session record (newest first), or keep storage order?
- Tab icons (Astryx icon set) and whether the active tab shows a badge slot for Trades later (020).

## 7. Spec Kit Run

**Step 0 — `/impeccable init` (once, before `/speckit-specify`)**
- Run in Claude Code from the repository root: `/impeccable init`. It scans the repository, asks at most a few product questions, and writes **`PRODUCT.md`** (product truth: platform `web`, users, purpose, positioning, constraints). It is separate from `PROJECT.md` and holds no visual design.
- Answer from [PROJECT.md](../../../PROJECT.md) and the redesign doc: mobile web for neighborhood clothing exchange corners; participants and organizers; one-for-one exchanges including 3-person cycles; AI estimates never presented as facts; English UI; Astryx chocolate theme is the existing visual system.
- Do not run `/impeccable document` or create `DESIGN.md` here. Commit `PRODUCT.md` (and `.impeccable/config.json` if created) as the first commit of this feature, in English, after `commit-reviewer`.

**Specify input**

```text
015 App shell: landing event list and bottom tabs (frontend only).
Landing (S0) lists events already joined on this device (sessions in localStorage) with name and Active/Closed from GET /api/v1/events/{event_id}; tapping opens the event home; entries answering 401/404 are removed; Create event and Join with code or QR remain. Every in-event screen except the created/share screen (H2) gets bottom tabs Home | Search | Trades | My items. Search and Trades show "Coming soon" empty states; My items shows a placeholder with [+ Register item] linking to the existing registration form. The organizer's Manage event moves from the Home card to a header menu. No backend changes.
Sources: docs/plans/features/015-app-shell.md, docs/superpowers/specs/2026-11-02-app-flow-redesign-design.md (4.1, 5, 6), docs/flows/screen-flow-v1.md (3, 4.1, 6), docs/flows/mockup-flow-v2.html (screens 1-2), docs/plans/api/02-read-event.md, docs/rules/dev/frontend/project-structure.md (2).
```

**Plan research (explorer):** session storage shape and SSR guards in `EventHomeScreen`; how `useEventQuery` handles 401/404; Astryx navigation components for a bottom tab bar and header menu (`astryx search "tab bar"`, `astryx search "menu"`).

## 8. Done When

- Landing shows saved events (name, state) above Create/Join and drops dead sessions.
- All in-event screens except H2 show the four tabs with the current tab highlighted; Search/Trades/My items placeholders render.
- Manage event opens from the header menu for organizers only; Home has no Manage card.
- `PRODUCT.md` is committed.
- Frontend checks pass; screens verified at 360–430 px with screenshots in the PR; `/impeccable critique` run on the landing and tab bar.
