# UI Contract: M1 Close Event and H3

## Consumed API

`POST /api/v1/events/{eventId}/close` — defined by [`docs/plans/api/03-close-event.md`](../../../docs/plans/api/03-close-event.md) and [`specs/005-close-event/contracts/close-event.openapi.yaml`](../../005-close-event/contracts/close-event.openapi.yaml). No body. Bearer header from the device record (`apiFetch(eventId, …)`).

| Response | Frontend handling |
|---|---|
| `200` `Event` passing `parseEvent` with `status: closed` (initial or repeated close) | success: `setQueryData`, close H3, "Event closed" |
| `200` failing `parseEvent` (incl. unreadable `closedAt`/`createdAt`) or with `status: active` | `UNKNOWN_ERROR` → error inside H3; event reloaded |
| `401 UNAUTHENTICATED` | H3 closes; M1 shows no-access view |
| `403 FORBIDDEN` | H3 closes; M1 shows "Only the organizer can manage this event." + [Back to home] |
| `404 NOT_FOUND` | H3 closes; M1 shows not-found view |
| `500 INTERNAL_ERROR`, non-standard body | error inside H3 (server `message` if present); retry by confirming again; event reloaded |
| network failure / 15 s timeout | `NETWORK_ERROR` → error inside H3; event reloaded |

Every outcome ends with `invalidateQueries({ queryKey: queryKeys.event(eventId), exact: true })`, fired without awaiting. If that reload (or any poll) returns the event as closed, the closed state takes precedence over the failure: H3 closes and its error is cleared.

## M1 changes (`components/event/ManageEventScreen.tsx`)

| Element | Condition | Behavior |
|---|---|---|
| State label (new) | organizer view, under the "Manage event" heading and event name | Astryx `Badge`: "Active" (`success`) or "Closed" (`neutral`), same as P2; updates with the shared query |
| [Close event] (destructive, full width) | organizer and `status === 'active'` | opens H3 (no request), `mutation.reset()` on open. Disabled while `useIsCloseEventPending(eventId)`. Replaces the "coming soon" notice |
| Status region (`role="status"`, `aria-live="polite"`) | always mounted | "Event closed" after a successful close; empty otherwise |
| Closed view | `status === 'closed'` | existing 004 behavior: layout banner "This event has ended." + "Closed {local time}", counts shown, no [Close event]; H3 never rendered |
| Screen-level failure view | last close failed with forbidden / no-access / not-found | replaces M1 content with the matching view until navigation |
| Focus | after H3 closes | cancel → [Close event]; success or precedence close → "Manage event" heading; screen-level failure → replacement view (R9) |

## H3 (`components/event/CloseEventDialog.tsx`)

| Element | Text | Behavior |
|---|---|---|
| Container | Astryx `Dialog` (`purpose="info"`), `role="dialog"`, `aria-modal` | focus moves to the `DialogHeader` title on open |
| Title | "Close this event?" | labels the dialog |
| Description | "Closing ends the exchange corner for everyone. Participants can no longer register clothes or make exchanges. This can't be undone." | settled effects only (spec Assumptions) |
| Error | `role="alert"` error Banner with the mapped message | only in `failed: dialog` |
| Confirm | "Close event" (destructive, full width, first) | calls `onConfirm`; disabled + spinner while pending |
| Cancel | "Cancel" (ghost, full width) | closes without request; disabled while pending |
| Escape / backdrop | — | close when not pending; ignored while pending |

Props: `{ isOpen, onOpenChange, onConfirm, isPending, errorMessage? }` — presentational; M1 owns the mutation and passes the event-scoped pending flag.

## Unchanged

P2 (`EventHomeScreen`), `EventClosedBanner`, `EventScreenStatus`, routes. They react to the shared cache update.
