# Research: Read Event Frontend (Mobile)

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-29

Codebase research was delegated to the `explorer` profile. Findings cite the frontend rules (`docs/rules/dev/frontend/`), the shared contract (`docs/rules/dev/common/api-contract.md`), and the consumed backend contract (`specs/003-read-event/contracts/read-event.openapi.yaml`).

## Current state

- `GET /api/v1/events/{eventId}` is live (`backend/app/api/routers/events.py`). Bearer auth; `200 Event`, `401 UNAUTHENTICATED`, `404 NOT_FOUND`, `500 INTERNAL_ERROR`. `stats` is `null` for non-organizers. No token in the response.
- Feature 002 left reusable infrastructure: `apiFetch(eventId, path, init, { timeoutMs })` injects the bearer header from `lib/session.ts`; `ApiError`/`toApiError`; `error-codes.ts` already lists `UNAUTHENTICATED`, `NOT_FOUND`, `NETWORK_ERROR`, `UNKNOWN_ERROR`; `types/event.ts` already matches the read-event shape; `renderWithClient` (`retry: false`); `QueryClient` defaults `staleTime 5_000, retry 1, refetchOnWindowFocus true`.
- P2 (`app/events/[eventId]/(tabs)/page.tsx`) is a `ComingSoonScreen` placeholder. No M1 route, no `events/[eventId]/layout.tsx` or `error.tsx`, no `lib/api/query-keys.ts`, no date utility.
- H2 (`components/event/EventCreatedScreen.tsx`) owns the QR + entry code + [Copy link] UI and its copy state (`idle | copied | manual`), with tests for QR, copy success, and manual fallback.
- `apiFetch`'s timeout message is create-specific ("Your event may have been created…"), and `client.test.ts:97-103` pins it for `/events`.

## R1. Fetching the event

- **Decision**: add to `lib/api/events.ts`:
  - `getEvent(eventId)` → `apiFetch<unknown>(eventId, `/events/${encodeURIComponent(eventId)}`, {}, { timeoutMs: 15_000 })` (generic default timeout message, R2), then validate with `parseEvent` (R3).
  - `useEventQuery(eventId, { enabled })` with `queryKey: queryKeys.event(eventId)`, `refetchInterval` 30 s that stops (`false`) once the event is closed, and a `retry` function that never retries `ApiError` with status 401/404 or the `UNKNOWN_ERROR` shape failure, and otherwise retries once (keeps the global default for network/500).
  - New `lib/api/query-keys.ts` with `queryKeys.event(eventId) => ['events', eventId] as const`.
- **Rationale**: `data-fetching.md` §3 mandates key factories and colocated hooks; §4 sets 30 s polling for event state on the event layout and requires stopping once state can no longer change (closed). The banner and screens share one key, so one request per 30 s per event. Retrying 401/404 only delays the guidance screen.
- **Alternatives considered**: no polling (contradicts §4; spec updated to match); polling only on M1 (closure must be visible everywhere).

## R2. Timeout message per request

- **Decision**: extend `apiFetch` options with an optional `timeoutMessage`; the default becomes the generic "The connection timed out. Please try again." `createEvent` passes its existing create-specific message, so H1 behavior and its tests stay the same in meaning. `client.test.ts` is updated by `test-author` to cover both default and custom messages.
- **Rationale**: the create message ("your event may have been created") is wrong for a read. Keeping message choice at the call site avoids a new error code (`error-handling.md` §1 allows only `NETWORK_ERROR`/`UNKNOWN_ERROR` as client codes).
- **Alternatives considered**: a second fetch wrapper (duplication); mapping by path inside `apiFetch` (hidden coupling).

## R3. Response validation (FR-014)

- **Decision**: `lib/validation/event-response.ts` exports a Zod `eventSchema` mirroring `types/event.ts` and `parseEvent(data: unknown): Event`. It refines: when `me.participantId === organizerParticipantId`, `stats` must be non-null. On failure it throws `new ApiError(200, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')`.
- **Rationale**: the spec requires malformed results (e.g., organizer without counts) to surface as an unexpected response with [Try again], never as a broken screen. The cast in `apiFetch` alone cannot detect a malformed body.
- **Alternatives considered**: trusting the type cast in `apiFetch` (FR-014 untestable); generating types from OpenAPI (SHOULD-level, out of scope).

## R4. Organizer gating

- **Decision**: `lib/event.ts` exports `isOrganizer(event)` = `event.me.participantId === event.organizerParticipantId`. P2's manage card and M1's counts use it.
- **Rationale**: `project-structure.md` §2 mandates exactly this comparison for organizer UI. Combined with R3, an organizer always has `stats`. Display only; the server enforces authorization.
- **Alternatives considered**: `me.isOrganizer` alone (equivalent from the server, but the rule names the ID comparison).

## R5. Screen state mapping

- **Decision**: a pure function `getEventScreenState({ hasSession, data, error, isPending })` in `lib/event.ts` returns one of `loading | no-access | not-found | error | ready`:
  - `!hasSession` or `ApiError.code === 'UNAUTHENTICATED'` (even with stale data) → `no-access`
  - `ApiError.code === 'NOT_FOUND'` → `not-found`
  - other error with no data → `error` (message via `getFormErrorMessage`, i.e., server message preferred)
  - data present → `ready` (a background refetch error keeps showing the last data)
  - otherwise → `loading`
- **Rationale**: one tested mapping shared by P2 and M1 (FR-002, FR-011, FR-012); `testing.md` requires tests for error-state mapping.
- **Alternatives considered**: per-screen branching (duplicated, untested twice); throwing to `error.tsx` (`error-handling.md` §3 SHOULD keeps query errors inline).

## R6. Event layout and closed banner

- **Decision**:
  - Add `app/events/[eventId]/layout.tsx` (server) rendering `<EventClosedBanner eventId />` above `children`.
  - `components/event/EventClosedBanner.tsx` (client) uses `useEventQuery` (same key, so no extra request when a screen also uses it) and renders an Astryx `Banner` "This event has ended." + "Closed {formatted closedAt}" only when the data says `closed`. It renders nothing while loading, on error, or without a session.
  - Add `app/events/[eventId]/error.tsx` ([Retry] via the `retry` prop as in root `error.tsx`, [Home] → P2), which 002 deferred to this feature.
- **Rationale**: `project-structure.md` puts the closed banner in the event layout; `error-handling.md` §3 makes the event `error.tsx` MUST. One banner covers P2, M1, and future event screens (FR-010).
- **Side effect (accepted)**: H2 also sits under the layout, so it now fetches the event once and shows the banner if closed. H2 still renders from its device snapshot (spec Assumptions).
- **Alternatives considered**: per-screen banners (duplication; misses future screens).
- `(tabs)/layout.tsx` with bottom tabs stays deferred until B1/C1/T1 exist.

## R7. Session presence on the client

- **Decision**: add `hasEventSession(eventId)` to `lib/session.ts`. Screens read it after mount with the same `useSyncExternalStore` mount guard H2 uses, render nothing before mount, and pass `enabled: hasSession` to `useEventQuery`.
- **Rationale**: `localStorage` is unavailable during SSR; no request is sent without access (FR-002); `lib/session.ts` stays the only storage owner.

## R8. Shared share card

- **Decision**: extract H2's QR + entry code + [Copy link] + manual fallback into `components/event/EventShareCard.tsx` (props `name`, `entryCode`, `entryUrl`). H2 and M1 both render it. Move the relevant H2 test cases to `EventShareCard.test.tsx`; H2 tests keep checking that the card appears.
- **Rationale**: FR-007 requires identical behavior to H2; one implementation prevents drift.

## R9. Closure time formatting

- **Decision**: `lib/utils/date.ts` exports `formatDateTime(iso: string, locale?: string, timeZone?: string)` using `Intl.DateTimeFormat` with `dateStyle: 'medium', timeStyle: 'short'`. Locale defaults to `'en-US'` (UI is English, FR-016); time zone defaults to the device's. Tests pass explicit `timeZone` for determinism.
- **Rationale**: no date library is installed; `Intl` suffices.
- **Alternatives considered**: `date-fns` (unneeded dependency); `toLocaleString()` without options (non-deterministic tests).

## R10. Screen UI and Astryx components

- **Decision**: Astryx `Banner` (closed and error states), `Card`/`ClickableCard` (manage card), `Badge` ("Active"/"Closed"), `Skeleton` (loading), `Button`, `Heading`, `Text`, `VStack`. Individual imports (`@astryxdesign/core/<Name>`), token utilities only (`styling.md`). Labels follow the mockup where they match the spec; the mockup's "Registered garments" is replaced by the spec's "Available garments" because the server counts only available garments.
- **Rationale**: matches `styling.md` and `frontend/AGENTS.md`; implementers confirm exact props with `pnpm exec astryx component <Name>`.

## R11. [Close event] placeholder

- **Decision**: on M1 for an active event, [Close event] (Astryx danger variant) opens nothing and shows an inline status "Closing the event is coming soon." No request, no route.
- **Rationale**: FR-009; H3 is a modal (component state, per `project-structure.md`) owned by the close-event feature.

## R12. Logging

- **Decision**: no new logging. The token never reaches components (only `lib/session.ts` and `apiFetch`); the entry code is rendered but never passed to `logger`.
- **Rationale**: FR-017, `logging.md`.
