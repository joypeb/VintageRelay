# Research: Create Event Frontend (Mobile)

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-28

Codebase research was delegated to the `explorer` profile. Findings below cite the frontend rules (`docs/rules/dev/frontend/`), the shared contract (`docs/rules/dev/common/api-contract.md`), and the consumed backend contract (`specs/001-create-event/contracts/create-event.openapi.yaml`).

## Current state

- `frontend/` is a scaffold: `src/app/layout.tsx` (mobile viewport, `mx-auto min-h-dvh max-w-md`), a placeholder S0 in `src/app/page.tsx`, `src/app/providers.tsx` (Astryx `Theme` + `LinkProvider` only), `src/lib/utils/cn.ts` (+ test), Vitest (`vitest.config.mts`, `vitest.setup.ts`, `vite-tsconfig-paths`) and ESLint/Prettier are configured.
- Missing modules the rules require: `lib/env.ts`, `lib/api/client.ts`, `lib/api/api-error.ts`, `lib/api/error-codes.ts`, `lib/api/error-messages.ts`, `lib/session.ts`, `lib/logger.ts`, `lib/routes.ts`, root `error.tsx` / `not-found.tsx` / `global-error.tsx`, `QueryClientProvider`, `next.config.ts` `compiler.removeConsole`, `src/test/render.tsx`.
- Not installed: TanStack Query, Zod, any QR library.

## R1. New dependencies

- **Decision**: add `@tanstack/react-query@^5.105.0`, `zod@^4.6.7`, `qrcode.react@^4.2.0` (dependencies). No other additions.
- **Rationale**: TanStack Query and Zod are mandated by `data-fetching.md` §3 and `error-handling.md` §4 at these exact versions (frontend README stack table). `qrcode.react` renders an SVG (`QRCodeSVG`) on the device with no network calls, supports React 19 (peer `^16.8 || … || ^19`), and has no runtime dependencies.
- **Alternatives considered**: `qrcode` (canvas/data-URL oriented, needs `@types/qrcode`, extra async step); a hand-written encoder (needless risk); a server-rendered image (excluded by spec Assumptions).

## R2. API base URL and paths

- **Decision**: keep `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` (host only, as already in `frontend/.env.example`). `apiFetch` prepends the shared `/api/v1` prefix, so domain functions use contract-relative paths (`/events`), matching the rule examples (`/proposals/{id}`).
- **Rationale**: one place owns the version prefix (`api-contract.md` §1 "all APIs under `/api/v1`"); the env value stays a plain origin, which also matches the backend's CORS model.
- **Alternatives considered**: putting `/api/v1` in the env value (easy to misconfigure per deployment); writing `/api/v1/events` in each domain function (scattered prefix).
- `NEXT_PUBLIC_APP_URL` is **not** introduced: the QR and copy link use `event.entryUrl` exactly as returned (FR-010), which the backend builds from `APP_BASE_URL`.

## R3. Request timeout and network failure normalization

- **Decision**: `apiFetch` accepts an optional timeout and the create request uses 15 s via `AbortSignal.timeout`. A `fetch` rejection (`TypeError`) becomes `ApiError(0, 'NETWORK_ERROR', 'Please check your network connection.')`; a timeout (`TimeoutError`) becomes `ApiError(0, 'NETWORK_ERROR', 'The connection timed out. Your event may have been created; if you don't see it, create it again.')`. A non-JSON or non-standard error body becomes `UNKNOWN_ERROR` (`error-handling.md` §1).
- **Rationale**: the rules allow inventing only `NETWORK_ERROR` / `UNKNOWN_ERROR`; screens show `error.message`, so the timeout wording needs no new code. The 15 s value is the spec edge case.
- **Alternatives considered**: a `TIMEOUT` code (forbidden by the rules); no timeout (the button could stay in progress indefinitely on a stalled connection).

## R4. Device-held access and H2 share snapshot

- **Decision**: `lib/session.ts` is the only module that touches `localStorage`. It stores one record per event under `vr:event:{eventId}`:
  `{ participantToken, participantId, share?: { name, entryCode, entryUrl } }`.
  Exports: `isStorageAvailable()`, `saveEventSession(eventId, record)`, `getEventShare(eventId)`, `getSessionHeaders(eventId)`. Reads are validated with a Zod schema; a malformed or missing record reads as `null` (never `as`). Writes for one event never touch other events' keys.
- **Rationale**: `project-structure.md` §4 requires one token per event centralized in `lib/session.ts` so a later session-recovery decision changes only that file. Keeping the H2 snapshot in the same per-event record avoids a second storage module; it is temporary until read-event (02) exists, after which `share` can be dropped.
- **Alternatives considered**: `sessionStorage` (lost when the tab closes, defeating "same device until the event ends"); cookies (forbidden for sessions by `api-contract.md`); a separate share-cache module (two storage owners for one event).
- **Storage unavailable (FR-017)**: `isStorageAvailable()` probes a write/remove of a test key; H1 calls it before submitting. If it fails, no request is sent and the form shows: "This browser can't keep your organizer access. Open the app in a regular (non-private) window and try again."

## R5. Input validation on the device

- **Decision**: `lib/validation/event.ts` exports a Zod schema `createEventFormSchema` and the limits `EVENT_NAME_MAX = 60`, `DISPLAY_NAME_MAX = 30`. Each field: `String.prototype.trim()`, then `required` if empty, `too_long` if `[...value].length` exceeds the limit (code points), `invalid_characters` if `/\p{Cc}/u` matches. Issues carry the same reason vocabulary as the server so one message table serves both (R6).
- **Rationale**: mirrors `specs/001-create-event` FR-003 and the OpenAPI constraints. Client validation is a convenience only (`error-handling.md` §4); the server stays authoritative.
- **Known divergence (accepted)**: JS `trim()` and the server's trim differ for a few rare characters (e.g., U+001C–U+001F, U+0085 at the edges, U+FEFF). The server's field error then appears under the field (R6). Not worth a custom trimmer (Simplicity).

## R6. Field and form error mapping

- **Decision**:
  - `lib/validation/event.ts` holds `FIELD_ERROR_MESSAGES` keyed by field and reason:
    - `required` → "Please enter an event name." / "Please enter your display name."
    - `too_long` → "Use at most 60 characters." / "Use at most 30 characters."
    - `invalid_characters` → "Remove line breaks and tabs."
    - `invalid_type` → "Please enter text."
  - `mapServerFieldErrors(details: unknown)` validates `details.fields[]` with Zod and maps `name` → event name, `organizerDisplayName` → display name. Unknown fields, `unknown_field`, unknown reasons, or unparseable details produce a form-level message: "Something went wrong. Please try again."
  - `lib/api/error-messages.ts` maps codes to form-level copy (`BAD_REQUEST`, `INTERNAL_ERROR`, `UNKNOWN_ERROR` → server message if present, else "Something went wrong. Please try again."); `NETWORK_ERROR` uses the `ApiError` message.
- **Rationale**: FR-005 requires identical wording for device and server checks; `error-handling.md` §2 requires centralized mapping and forbids showing raw `details`.
- **Alternatives considered**: showing `error.message` for 422 (not field-specific).

## R7. Form state and submission

- **Decision**: plain `useState` for values and errors (no form library, `error-handling.md` §4). `useCreateEventMutation` in `lib/api/events.ts` (`retry: 0`). Submit flow: storage probe → Zod `safeParse` → on issues, show errors and focus the first invalid field → `mutate` → on success `saveEventSession` then `router.replace(routes.eventCreated(id))`. The [Create event] button uses Astryx `isLoading` while pending, which blocks re-activation (FR-006). Editing a field clears only that field's error; the form-level error clears on the next submit.
- Keyboard: event name `onEnter` focuses the display name; display name `onEnter` submits. Focus uses the input's DOM id (`document.getElementById`) if Astryx `TextInput` does not forward a ref (confirm with `pnpm exec astryx component TextInput` during implementation).
- **Rationale**: two fields don't warrant a form library; `router.replace` keeps the back button from returning to a filled H1 (FR-009).

## R8. H2 rendering and missing data

- **Decision**: `app/events/[eventId]/created/page.tsx` (server) awaits `params` and renders the client `EventCreatedScreen eventId=…`. The screen reads `getEventShare(eventId)` after mount (`useSyncExternalStore` with a server snapshot of `null`, or `useEffect`) to avoid a hydration mismatch. While unread it shows nothing; if `null`, it shows "This event's share details aren't saved on this device." with a [Go to start] button to S0 (FR-013).
- **Rationale**: data lives only in browser storage, so the screen is client-side (`project-structure.md` §3).

## R9. Copy link

- **Decision**: `navigator.clipboard.writeText(entryUrl)` when available. On success, an `aria-live="polite"` status line reads "Link copied". If the API is missing (non-secure origin, e.g., `http://` LAN address) or rejects, show the link in a read-only, selectable field with "Copy this link manually."
- **Rationale**: an inline live region is simpler to test than a toast viewport and meets the accessibility rule for announcements. The fallback matters in practice: phones on a LAN dev address are not a secure context.

## R10. QR rendering

- **Decision**: `QRCodeSVG` with `value={entryUrl}`, `size={224}`, `level="M"`, `marginSize={4}` (quiet zone), `title` "QR code to join {event name}", and `role="img"`. Colors are fixed black on white, with a code comment explaining the exception to the token rule (scanner reliability needs maximum contrast regardless of theme).
- **Rationale**: SC-002 (9/10 scans on first try). Entry URLs are short (~40 characters), so level M at 224 px stays well within scan density.

## R11. Placeholder navigation targets

- **Decision**: one `components/ui/ComingSoonScreen.tsx` (title + "This screen is coming soon." + [Go to start]) used by `app/join/page.tsx` (P1), `app/events/[eventId]/(tabs)/page.tsx` (P2), and `app/events/[eventId]/(tabs)/my-items/new/page.tsx` (C2), at the paths in `project-structure.md` §2. No `(tabs)/layout.tsx` (bottom tabs) and no `events/[eventId]/layout.tsx` (needs read-event) yet.
- **Rationale**: FR-012 / FR-001 need working targets; real layouts belong to their features (Simplicity).

## R12. Shared infrastructure created by this feature

Created at the minimum the rules require for one unauthenticated mutation:

- `lib/env.ts` (fail fast if `NEXT_PUBLIC_API_BASE_URL` is missing), `lib/api/client.ts`, `lib/api/api-error.ts`, `lib/api/error-codes.ts` (shared codes + `NETWORK_ERROR` / `UNKNOWN_ERROR`), `lib/api/error-messages.ts`, `lib/api/events.ts`, `lib/logger.ts`, `lib/routes.ts`, `lib/session.ts`, `types/event.ts`.
- `providers.tsx` adds `QueryClientProvider` with the defaults in `data-fetching.md` §3.
- Root `error.tsx`, `not-found.tsx`, `global-error.tsx` (`error-handling.md` §3).
- `next.config.ts` `compiler.removeConsole` (`logging.md` §1).
- `src/test/render.tsx` (`renderWithClient`, `testing.md` §3).
- **Deferred**: `lib/api/query-keys.ts` (no queries yet), OpenAPI type generation (SHOULD; manual `types/event.ts` matches the 001 OpenAPI for now), `events/[eventId]/error.tsx` (no event layout yet). This is an explicit, temporary exception to `error-handling.md` §3, which requires that file: it lands with the event layout in read-event (02). Until then, render errors on H2 and the placeholders fall back to the root `error.tsx`, and H1 failures are shown inline (`role="alert"`, FR-007).

## R13. Test scope

- **Decision** (Vitest + Testing Library, colocated `*.test.ts(x)`, API functions mocked with `vi.mock`):
  - Unit: `api-error.ts` / `client.ts` (standard body, HTML body, network failure, timeout, `/api/v1` prefix, no `Authorization` for `eventId = null`); `validation/event.ts` (required, whitespace-only, 60/30 boundaries in code points incl. Korean, inner newline/tab, trimming, server-detail mapping incl. `unknown_field` and garbage details); `session.ts` (per-event isolation, malformed stored JSON reads as `null`, storage probe failure); `routes.ts`.
  - Component: `CreateEventScreen` (device errors without a request, server field errors under fields, network error keeps input and re-enables, button blocks while pending, success saves session and calls `router.replace`, storage unavailable blocks submission); `EventCreatedScreen` (shows code and QR, copy success/fallback, missing data guidance).
  - Manual: S0/H1/H2 at 360 px and 430 px; QR scanning with a second phone (quickstart).
- **Rationale**: frontend `testing.md` §2 (api-error, pure functions, form schemas) plus constitution II/III (non-trivial frontend logic is test-first; screens verified manually). Component tests cover the stateful submission logic, not visuals.

## R14. Phone testing on a LAN

- **Decision**: for the QR hallway test (SC-002), run both servers on the LAN address: backend `APP_BASE_URL=http://<LAN-IP>:3000` (also its CORS origin), frontend `NEXT_PUBLIC_API_BASE_URL=http://<LAN-IP>:8000`, and Next `allowedDevOrigins` if dev requests from the LAN IP are blocked. Copy falls back to manual (R9) because the LAN origin is not secure.
- **Rationale**: with `APP_BASE_URL=http://localhost:3000`, the QR would open `localhost` on the scanning phone.
