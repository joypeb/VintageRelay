# Data Model: Close Event Frontend (Mobile)

No new persisted data. The `Event` type (`src/types/event.ts`) and the device record (`src/lib/session.ts`) are reused unchanged.

## Event (reused)

Shape and validation from `specs/004-read-event-frontend/data-model.md` (`parseEvent`). Rules added or relied on by this feature:

| Rule | Source |
|---|---|
| `createdAt` and non-null `closedAt` must be parseable timestamps (`!Number.isNaN(Date.parse(value))`); otherwise `UNKNOWN_ERROR` (applies to read and close) | R1, F06 |
| Close response must parse as `Event` **and** have `status === 'closed'` (which also implies a non-null `closedAt`) | R1, FR-006 |
| Organizer response must include `stats` (existing rule) | 004 |

## Keys (`src/lib/api/query-keys.ts`)

| Key | Value | Used by |
|---|---|---|
| `queryKeys.event(eventId)` (existing) | `['events', eventId]` | `useEventQuery`, cache updates; filters use `{ queryKey, exact: true }` |
| `mutationKeys.closeEvent(eventId)` (new) | `['events', eventId, 'close']` | `useCloseEventMutation`, `useIsCloseEventPending` |

## Event query cache (`queryKeys.event(eventId)`)

Single shared entry read by P2, M1, and `EventClosedBanner`.

| Transition | Trigger | Allowed |
|---|---|---|
| `undefined` → any | first read | yes |
| `active` → `active` | poll/refresh | yes |
| `active` → `closed` | poll/refresh or close success (`setQueryData`) | yes |
| `closed` → `closed` | refresh (counts may change) | yes |
| `closed` → `active` | stale read only | **no** — `keepClosedEvent` keeps previous data (R3) |

## Close mutation / H3 state

Derived from `useCloseEventMutation`, `useIsCloseEventPending` (event-scoped pending), the event query, and one `useState` for dialog visibility; not stored elsewhere.

| State | Dialog | Confirm button | Dismiss (Cancel/Esc/backdrop) |
|---|---|---|---|
| `closed` (hidden) | not rendered | — | — |
| `open` (idle) | title, description, actions | enabled | closes, no request |
| `submitting` (event-scoped pending, also after remount) | same | disabled + spinner; M1 [Close event] disabled | ignored |
| `failed: dialog` | + `role="alert"` message | enabled (retry) | closes, `reset()` |
| `failed: screen-level` | closed | — | M1 shows forbidden / no-access / not-found view |
| `succeeded` | closed | — | M1 shows closed state + "Event closed" status |
| any state + event query reports `closed` | closed, `reset()` | — | M1 shows closed state (closed takes precedence over failure, R5) |

## CloseEventFailure (pure mapping, `src/lib/event.ts`)

```ts
type CloseEventFailure =
  | { kind: 'forbidden' }
  | { kind: 'no-access' }
  | { kind: 'not-found' }
  | { kind: 'dialog'; message: string };
```

| Error | Result |
|---|---|
| `ApiError` `FORBIDDEN` | `forbidden` |
| `ApiError` `UNAUTHENTICATED` | `no-access` |
| `ApiError` `NOT_FOUND` | `not-found` |
| other `ApiError` | `dialog` with `error.message` |
| non-`ApiError` | `dialog` with the generic message (`getFormErrorMessage`) |
