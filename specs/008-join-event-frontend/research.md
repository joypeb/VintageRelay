# Research: Join Event Frontend (Mobile)

All Technical Context items are resolved; no NEEDS CLARIFICATION remains. Sources: [spec.md](spec.md), `docs/plans/api/04-join-event.md`, `specs/007-join-event/contracts/join-event.openapi.yaml`, `docs/rules/dev/common/api-contract.md`, `docs/rules/dev/frontend/`, and the existing frontend code from features 002/004/006.

## R1. Reading the `code` from the join link

- **Decision**: `src/app/join/page.tsx` stays a server component, awaits Next.js 16 `searchParams`, takes the first `code` value (array → first item; missing/blank → `null`), and passes it as `initialCode` to a new client `JoinEventScreen`.
- **Rationale**: `project-structure.md` says to await Promise-based `searchParams` in server components and pass strings to client components. This avoids `useSearchParams` plus a `Suspense` boundary.
- **Alternatives**: `useSearchParams` in the client screen (needs Suspense, more moving parts).

## R2. API functions and response validation

- **Decision**: Add to `src/lib/api/events.ts`:
  - `lookupEntryCode(code)` → `GET /entry-codes/{encodeURIComponent(code)}` and `joinEvent(eventId, body)` → `POST /events/{eventId}/participants`.
  - Both call `apiFetch(null, …)` so no `Authorization` header is sent, with a 15 s timeout.
  - Responses are validated: `parseEventPreview` (new Zod schema: `eventId`, `name`, `status`) and `parseJoinSession`. Any mismatch throws the existing `ApiError(200, 'UNKNOWN_ERROR', …)`.
  - `parseJoinSession` reuses `eventSchema` for `event`, then additionally requires:
    - a non-empty `participantToken`
    - `event.id === eventId`
    - `event.me.isOrganizer === false`
    - a non-empty `event.me.participantId` that differs from `event.organizerParticipantId`
    - `event.stats === null`

    `eventSchema` alone would accept a "non-organizer" whose participant ID equals the organizer ID (P2 derives the manage card from that equality) and an empty participant ID (an unusable saved session).
  - **Unreadable successful bodies**: `apiFetch` currently returns `await res.json()`. Invalid JSON in a 2xx response throws a raw `SyntaxError`, whose message can quote parts of the body. `apiFetch` will catch that and throw `ApiError(res.status, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')` without keeping the parser message. This is a small shared change in `src/lib/api/client.ts`, covered by its own test cycle (F0).
- **Rationale**: Neither call is authenticated (`04-join-event.md`). Sending a token from an old session on this device is pointless and could leak it. `eventSchema` already accepts a non-organizer with `stats: null`, so no schema fork is needed. FR-009 requires navigating only after a valid response. `apiFetch` discards the HTTP status, so the guarantee is a **validated successful (2xx) response**, not a 201 check specifically.
- **Join timeout message**: "The connection timed out. Please try again. If your display name is now taken, choose a different one." This covers the lost-response edge case, where the retry fails with `DISPLAY_NAME_TAKEN`.
- **Alternatives**: An unvalidated cast like `createEvent` (rejected because of FR-009). Passing `eventId` to `apiFetch` (would attach a stale token).

## R3. Lookup state: query keyed by the submitted code

- **Decision**: The screen keeps a `submittedCode` state, initialised to the trimmed `initialCode`. `useEntryCodePreviewQuery(submittedCode)` is a `useQuery` with these options:
  - key `queryKeys.entryCodePreview(code)`, `enabled: code !== null`
  - `retry: 0`, `staleTime: 0`, `refetchOnWindowFocus: false`
  - `gcTime: 0`, so a completed preview is dropped soon after P1 unmounts. This is not a guarantee: collection is timer-based, and a lookup still pending at unmount can be reused by a remount. Freshness on return comes from `staleTime: 0`, which refetches on mount.
- **Behavior**:
  - [Find event] sets `submittedCode` to the trimmed input. If it equals the current key and the last attempt failed, it calls `refetch()`.
  - Editing the code input sets `submittedCode` to `null`, which clears the preview (FR-012).
  - A late result for an old key is never rendered, because rendering reads only the current key.
  - **One lookup in flight**: changing the key does not cancel the old request. Editing the code during a pending lookup disables the current key while the old request keeps running, and submitting a new code would start a second one. [Find event] is therefore busy while **any** entry-code lookup is fetching, via `useIsEntryCodeLookupPending()` = `useIsFetching({ queryKey: ['entry-codes'] }) > 0`. This needs no cancellation plumbing; `apiFetch` replaces caller signals with its timeout signal.
- **Rationale**: Query keys give stale-result protection for free, and the prefix-wide fetching check serializes lookups. Auto-lookup from the link is just an initial enabled key.
- **Alternatives**: `useMutation` with a request-sequence ref. That is more code for the same guarantees.

## R4. Join mutation and hand-off to P2

- **Decision**: `useJoinEventMutation()` is a `useMutation` with `retry: 0`. On success, the screen does three things in order:
  1. `saveEventSession(event.id, { participantToken, participantId: event.me.participantId })`, with no `share`, because share data is for organizers only.
  2. `queryClient.setQueryData(queryKeys.event(event.id), event)`, so P2 renders immediately from the server's own response.
  3. `router.replace(routes.eventHome(event.id))`, so Back does not reopen P1 (US1-4).

  Before calling `mutate`, the screen checks `isStorageAvailable()` and shows the storage message instead of joining (FR-011). If `saveEventSession` throws, the screen shows "You joined, but this browser couldn't keep your event access. Free up browser storage or open a regular (non-private) window, then join again with a different display name." and stays on P1.
- **Rationale**: This matches the `CreateEventScreen` pattern (storage probe, `router.replace`, `retry: 0`, `isLoading` button). Seeding the cache is a server result, not an optimistic update (`data-fetching.md` §3).
- **Alternatives**: `router.push` (Back would return to the join form). Not seeding the cache (P2 would flash its loading state).

## R5. "Already joined on this device"

- **Decision**: After an active or closed preview arrives, the screen calls `hasEventSession(preview.eventId)`. If it returns true, the screen shows the already-joined notice with [Go to event home] and no join form. A closed event with device access shows the same notice, because the participant can still view the event.
  - The submit handler calls `hasEventSession(preview.eventId)` again immediately before `mutate`. If access appeared after rendering (for example, a join in another tab), it sets `alreadyJoinedOverride` and sends nothing, so the device never gets a duplicate participant or an overwritten session (FR-010).
  - **Known limitation**: a stored record that passes the local schema but is no longer accepted by the server still counts as "already joined". P2 then shows its existing 401 guidance. Verifying or replacing it is the open session-recovery decision and is not designed here.
- **Rationale**: This is a frontend default from the spec (US4, FR-010). It reads `localStorage` only on the client and only after a fetch, so there is no hydration mismatch.
- **Alternatives**: Checking before the lookup. That isn't possible, because the event ID comes from the preview.

## R6. Failure mapping as pure functions

- **Decision**: Add to `src/lib/event.ts`:
  - `getLookupFailure(error) → { kind: 'codeField'; message } | { kind: 'form'; message }`. `NOT_FOUND` maps to `codeField` with the server message; everything else maps to `form` via `getFormErrorMessage`.
  - `getJoinFailure(error)`, mapping as follows:
    - `DISPLAY_NAME_TAKEN` → `{ kind: 'displayNameField', message }` (server message)
    - `EVENT_CLOSED` → `{ kind: 'closed' }`
    - `NOT_FOUND` → `{ kind: 'codeNotFound', message }`
    - `VALIDATION_ERROR` → `{ kind: 'fields', fieldErrors, formError }` via `mapJoinServerFieldErrors`
    - otherwise → `{ kind: 'form', message }`
- **Rationale**: Pure functions are the non-trivial logic that `testing.md` asks to unit test. Screen tests then only check the wiring. This mirrors `getCloseEventFailure` from feature 006.
- **Alternatives**: Inline branching in the component, which is harder to test exhaustively.

## R7. Client-side validation messages

- **Decision**: Add a new `src/lib/validation/join.ts`:
  - `validateEntryCode(raw)` trims, and returns "Enter the entry code." for an empty code.
  - `validateDisplayName(raw)` trims and returns "Enter a display name of 1–30 characters." when the name is empty or longer than `DISPLAY_NAME_MAX` code points. It returns "Remove line breaks and tabs." when the name has control characters.
  - `mapJoinServerFieldErrors(details)` maps `entryCode`/`displayName` × `required`/`too_long`/`invalid_characters`/`invalid_type` to these messages. Unknown fields map to the generic form message.
- **Rationale**: The backend `ParticipantCreate` rejects control characters (`reject_control_characters`), as event creation does. Checking on the device avoids a round trip and keeps the same wording. The extra control-character message refines FR-005 without contradicting it.
- **Alternatives**: Reusing `validateCreateEventForm` messages ("Please enter your display name."). Rejected, because the spec fixes the join copy.

## R8. Screen states and focus

- **Decision**: `JoinEventScreen` derives one view from the lookup query, the join mutation, and local state (see [data-model.md](data-model.md)):
  - `codeEntry`, `lookingUp`, `active`, `closed`, `alreadyJoined`, `joining`
  - Inline field errors are shown with `TextInput` `status`; form errors use the same `role="alert"` pattern as `CreateEventScreen`.
  - When the view becomes `active`, an effect focuses the display name input.
  - When a join returns `EVENT_CLOSED`, the closed message is rendered inside a `role="status"` element and receives focus (`tabIndex={-1}`), so the switch is announced (FR-013). A closed preview from a lookup also uses `role="status"`, but focus is not moved.
  - While joining, the code input is read-only and [Join] uses `isLoading`.
  - The closed view reuses the state `Badge` used by P2/M1.
- **Rationale**: Matches FR-004, FR-006, FR-013 and the existing component patterns.

## R9. Logging

- **Decision**: Log only non-`ApiError` failures (`logger.error('join event failed', error)` / `'entry code lookup failed'`), never the code, token, request body, response body, or headers. This is the same policy as `CreateEventScreen`. After F0, unreadable 2xx bodies become `ApiError` and are not logged at all.
- **Scope**: FR-015/SC-007 cover app-written logs (the app logger and browser console). The Next.js dev server prints incoming request URLs such as `/join?code=…` in its own terminal. That is development tooling outside the app, so it is excluded explicitly rather than suppressed.
- **Rationale**: FR-015, `logging.md`.

## R10. Tests

- **Decision**: Use Vitest + Testing Library with `renderWithClient`.
  - **Mock boundary**: screen tests mock only `@/lib/api/client` (`apiFetch`, routed by path) and `next/navigation`, and keep the real `lookupEntryCode`/`joinEvent` and hooks. Mocking the exported API functions while keeping the real hooks from the same module would not replace the hooks' internal bindings, so they would call the real `apiFetch` and the network. (`CreateEventScreen.test.tsx` works around the same issue by re-creating the hook in its mock.)
  - Unit tests for `apiFetch` unreadable-body normalization (mocked `fetch`), `validation/join.ts`, `getLookupFailure`/`getJoinFailure`, and `lookupEntryCode`/`joinEvent`, mocking `apiFetch`. The `joinEvent` tests verify the URL, the absence of an `Authorization` header (through `eventId: null`), and response validation.
  - Screen tests for `JoinEventScreen` (mock boundary above) cover:
    - auto-lookup and typed lookup
    - the closed, already-joined (including the submit-time re-check), and storage-unavailable cases
    - each failure mapping, with no sentinel secret in `console.error`/`console.warn`
    - single in-flight requests, including edit-during-pending-lookup
    - stale-preview clearing on edit
    - the successful hand-off (session saved, cache seeded, `router.replace`)
  - Layout at 360/430 px is checked manually ([quickstart.md](quickstart.md)).
- **Rationale**: `docs/rules/dev/frontend/testing.md` and constitution Principles II–IV.
