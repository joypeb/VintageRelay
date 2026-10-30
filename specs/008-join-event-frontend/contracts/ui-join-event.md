# UI Contract: P1 Join Event

## Consumed API

Both calls are defined by [`docs/plans/api/04-join-event.md`](../../../docs/plans/api/04-join-event.md) and [`specs/007-join-event/contracts/join-event.openapi.yaml`](../../007-join-event/contracts/join-event.openapi.yaml). Both use `apiFetch(null, …)`, so no `Authorization` header is sent, and both have a 15 s timeout.

### `GET /api/v1/entry-codes/{entryCode}` — `lookupEntryCode(code)`

The `code` is trimmed and URL-encoded.

| Response | Frontend handling |
|---|---|
| `200` passing `parseEventPreview`, `active` | active view (or already-joined view) |
| `200` passing `parseEventPreview`, `closed` | closed view (or already-joined view) |
| `200` failing `parseEventPreview`, or an unreadable body | `UNKNOWN_ERROR` → form error; [Find event] retries. An unreadable 2xx body is normalized by `apiFetch` to `ApiError(status, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')`, and the parser message is dropped. |
| `404 NOT_FOUND` | server message on the "Entry code" field |
| `429`/`500`, non-standard body, network failure, timeout | form error (server `message` if present); [Find event] retries |

### `POST /api/v1/events/{eventId}/participants` — `joinEvent(eventId, { entryCode, displayName })`

| Response | Frontend handling |
|---|---|
| `201` passing `parseJoinSession` | save session (no `share`) → seed `queryKeys.event(id)` → `router.replace(routes.eventHome(id))` |
| `201` failing `parseJoinSession` (data-model.md checks, including participant ≠ organizer and `stats: null`), or an unreadable body | `UNKNOWN_ERROR` → form error; stay on P1; nothing saved |
| `409 DISPLAY_NAME_TAKEN` | server message on "My display name"; name kept; [Join] enabled |
| `409 EVENT_CLOSED` | closed view; the closed message (`role="status"`) receives focus |
| `404 NOT_FOUND` | back to code entry; server message on "Entry code"; preview cleared |
| `422 VALIDATION_ERROR` | `details.fields` mapped to field messages; unknown → form error |
| `500`, non-standard body, network failure, timeout | form error (timeout: "The connection timed out. Please try again. If your display name is now taken, choose a different one."); values kept; [Join] retries |

## Route (`src/app/join/page.tsx`)

| Input | Behavior |
|---|---|
| `/join?code=K7P3QX` (from H2/M1 link or QR) | server page awaits `searchParams`, passes `initialCode="K7P3QX"`; lookup starts on mount |
| `/join`, `/join?code=`, `/join?code=%20` | `initialCode` null/blank → code entry, no request |
| `/join?code=a&code=b` | first value used |

The "coming soon" placeholder is removed. `routes.join()` is unchanged.

## P1 elements (`components/event/JoinEventScreen.tsx`)

| Element | Text | Condition / behavior |
|---|---|---|
| Heading | "Join event" | always |
| Entry code | `TextInput` label "Entry code", `autoComplete="off"`, `autoCapitalize="characters"` | always; read-only while joining; editing clears the preview |
| [Find event] | secondary, full width | shown when there is no preview; validates ("Enter the entry code."); busy while **any** entry-code lookup is in flight, including one for a code the visitor has since edited |
| Event card | event name + `Badge` "Active" (`success`) / "Closed" (`neutral`), same as P2 | when a preview is shown |
| My display name | `TextInput` label "My display name", `htmlName="displayName"`, `autoComplete="nickname"` | active view only; focused when the active view appears; validated before sending |
| [Join] | primary, full width, `type="submit"` | active view only; `isLoading` while pending; ignores repeated submits. Immediately before sending, it re-checks device-held access and shows the already-joined view instead if access now exists. |
| Closed message | "This event has ended. You can no longer join." in `role="status"` + [Go to start] (→ `routes.landing()`) | closed view; focused (`tabIndex={-1}`) when reached through a join `EVENT_CLOSED` |
| Already joined | "You've already joined this event on this device." + [Go to event home] (→ `routes.eventHome(eventId)`) | already-joined view; no display name or [Join] |
| Form error | `role="alert"` text | `formError` set |
| Storage message | "This browser can't save your event access. Turn off private browsing or try another browser." | storage probe fails on [Join]; no request |
| Session save failure | "You joined, but this browser couldn't keep your event access. Free up browser storage or open a regular (non-private) window, then join again with a different display name." | `saveEventSession` throws after `201`; stay on P1 |

Field errors use `TextInput` `status={{ type: 'error', message }}` with `statusVariant="detached"`, as on H1. Submitting from the keyboard in the code field runs [Find event] when there is no preview.

## Logging

Only non-`ApiError` failures are logged (`'entry code lookup failed'`, `'join event failed'`, `'join session save failed'`) with the error object. The code, token, request body, response body, and headers are never logged.

This applies to app-written logs (the app logger and browser console). Request-URL logging by the local Next.js dev server is outside the app and out of scope (research R9).
