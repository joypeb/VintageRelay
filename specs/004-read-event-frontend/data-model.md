# Data Model: Read Event Frontend (Mobile)

Client-side shapes only. Server shapes are owned by `specs/003-read-event/contracts/read-event.openapi.yaml`; `src/types/event.ts` already mirrors them and is not changed.

## 1. API types (`src/types/event.ts`, unchanged)

| Type | Fields | Notes |
|---|---|---|
| `Event` | `id`, `name`, `status: 'active' \| 'closed'`, `entryCode`, `entryUrl`, `organizerParticipantId`, `createdAt`, `closedAt: string \| null`, `me: EventMe`, `stats: EventStats \| null` | Read result (`200`) |
| `EventMe` | `participantId`, `displayName`, `isOrganizer` | Caller |
| `EventStats` | `participantCount`, `availableClothingCount`, `confirmedExchangeCount` | Organizer only; `null` otherwise |

## 2. Response validation (`src/lib/validation/event-response.ts`)

Zod `eventSchema` mirroring `Event`, plus:

| Rule | On failure |
|---|---|
| All fields present with the types above; counts are non-negative integers | `ApiError(200, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')` |
| `status === 'closed'` ⇒ `closedAt` is a string | same |
| `me.participantId === organizerParticipantId` ⇒ `stats !== null` | same |

Non-organizer `stats` is not required to be `null` by the client (display gating ignores it; R4).

## 3. Query

| Item | Value |
|---|---|
| Key | `queryKeys.event(eventId)` = `['events', eventId]` |
| Fetcher | `getEvent(eventId)` → `parseEvent` |
| `enabled` | `hasEventSession(eventId)` (after mount) |
| `refetchInterval` | `eventRefetchInterval`: 30 000 ms while active or not yet loaded; `false` once `status === 'closed'` |
| `retry` | no retry for `ApiError` `UNAUTHENTICATED`, `NOT_FOUND`, `UNKNOWN_ERROR` with status 200; otherwise 1 |
| Timeout | 15 s, message "The connection timed out. Please try again." |

## 4. Screen state (`src/lib/event.ts`)

`getEventScreenState({ hasSession, data, error, isPending })` → discriminated union:

| State | Condition (first match wins) | Rendering |
|---|---|---|
| `no-access` | `!hasSession`, or error code `UNAUTHENTICATED` | "You haven't joined this event on this device." + [Join with entry code] (P1) + [Go to start] (S0) |
| `not-found` | error code `NOT_FOUND` | "This event could not be found." + [Go to start] |
| `ready` (`event`) | `data` present | Screen content (stale data kept during background refetch errors) |
| `error` (`message`) | any other error | `getFormErrorMessage(error)` + [Try again] (`refetch`) |
| `loading` | otherwise | Skeleton; no placeholder event data |

Derived helpers in the same module:

| Helper | Rule |
|---|---|
| `isOrganizer(event)` | `event.me.participantId === event.organizerParticipantId` |
| `isClosed(event)` | `event.status === 'closed'` |

## 5. Device-held event record (`src/lib/session.ts`)

Unchanged record (`vr:event:{eventId}` → `{ participantToken, participantId, share? }`). New export `hasEventSession(eventId): boolean` = `getEventSession(eventId) !== null`. The 401 response does not delete the record (session recovery is an open decision).

## 6. UI-only state

| State | Owner | Values |
|---|---|---|
| Copy state | `EventShareCard` | `idle \| copied \| manual` (moved from H2) |
| Close notice | `ManageEventScreen` | `boolean` — shows "Closing the event is coming soon." |
