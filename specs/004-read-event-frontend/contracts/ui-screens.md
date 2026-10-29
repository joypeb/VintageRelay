# UI Contract: P2 / M1 / Event Layout and Consumed API

## Consumed API

`GET /api/v1/events/{eventId}` — defined by [`specs/003-read-event/contracts/read-event.openapi.yaml`](../../003-read-event/contracts/read-event.openapi.yaml). Bearer header from the device record (`apiFetch(eventId, …)`). Not sent when the device has no record.

| Response | Frontend handling |
|---|---|
| `200` `Event` passing `parseEvent` | `ready` |
| `200` failing `parseEvent` | `UNKNOWN_ERROR` → `error` state, [Try again] |
| `401 UNAUTHENTICATED` | `no-access` state |
| `404 NOT_FOUND` | `not-found` state |
| `500 INTERNAL_ERROR`, non-standard body | `error` state, server `message` if present |
| network failure / 15 s timeout | `NETWORK_ERROR` → `error` state with the `ApiError` message |

## Routes (`src/lib/routes.ts`)

| Screen | Path | Builder |
|---|---|---|
| P2 Home | `/events/{eventId}` | `routes.eventHome(eventId)` (existing) |
| M1 Manage event | `/events/{eventId}/manage` | `routes.manageEvent(eventId)` (new) |
| P1 Join (placeholder) | `/join` | `routes.join()` |
| C2 Register clothing (placeholder) | `/events/{eventId}/my-items/new` | `routes.newItem(eventId)` |
| S0 Landing | `/` | `routes.landing()` |

Files: `app/events/[eventId]/layout.tsx` (new), `app/events/[eventId]/error.tsx` (new), `app/events/[eventId]/(tabs)/page.tsx` → `<EventHomeScreen eventId />`, `app/events/[eventId]/(tabs)/manage/page.tsx` (new) → `<ManageEventScreen eventId />`. Pages stay server components and await `params`.

## Event layout (`components/event/EventClosedBanner.tsx`)

| Condition | Rendering |
|---|---|
| Event loaded and `status === 'closed'` | Astryx `Banner` (warning): title "This event has ended.", description "Closed {formatDateTime(closedAt)}" |
| Anything else (loading, error, no session, active) | Nothing |

## Shared states (P2 and M1)

| State | Accessible name / text | Actions |
|---|---|---|
| loading | Skeleton, `aria-busy` region | — |
| no-access | "You haven't joined this event on this device." | [Join with entry code] → P1, [Go to start] → S0 |
| not-found | "This event could not be found." | [Go to start] → S0 |
| error | error message, `role="alert"` | [Try again] → `refetch()`, button loading while fetching |

## P2 Home (`components/event/EventHomeScreen.tsx`)

| Element | Text | Behavior |
|---|---|---|
| Heading | event name, exactly as returned | Wraps; no horizontal scroll |
| State badge | "Active" or "Closed" | |
| Caller | "You: {displayName}" + " (Organizer)" when `isOrganizer` | |
| Manage card | title "Manage event", text "View QR, entry code, and event counts" | Only when `isOrganizer`; → M1 |
| Button | "Register my clothes" (primary) | Active: → C2. Closed: not rendered |

## M1 Manage event (`components/event/ManageEventScreen.tsx`)

| Element | Text | Behavior |
|---|---|---|
| Not organizer | "Only the organizer can manage this event." + [Back to home] → P2 | No counts, no share card |
| Heading | "Manage event" + event name | |
| Share | `EventShareCard` (same as H2) | QR of `entryUrl`, entry code, [Copy link] + fallback |
| Counts | "Participants", "Available garments", "Confirmed exchanges" with values exactly as returned | |
| Button | "Refresh" | `refetch()`; loading while fetching |
| Button | "Close event" (danger) | Active only. Shows status text "Closing the event is coming soon."; no request |
| Link | "Back to home" | → P2 |

## Shared share card (`components/event/EventShareCard.tsx`)

Props `name`, `entryCode`, `entryUrl`. QR `role="img"` titled "QR code to join {name}", entry code labeled "Entry code", [Copy link] → "Link copied" (`role="status"`), failure → read-only link + "Copy this link manually." Extracted unchanged from H2.

## Event error boundary (`app/events/[eventId]/error.tsx`)

Client component: "Unable to load this screen." + [Retry] (`retry`, the Next 16.3+ prop used by root `error.tsx`) + [Home] → P2.

## Layout constraints

Single column within the root `max-w-md` container; usable at 360–430 px with no horizontal scroll; touch targets ≥ 44×44 px; Astryx components and token utilities only; all copy in English.
