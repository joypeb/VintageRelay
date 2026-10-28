# Data Model: Create Event Frontend (Mobile)

Client-side shapes only. Server shapes are owned by `specs/001-create-event/contracts/create-event.openapi.yaml`; this feature mirrors them in `src/types/event.ts` without adding fields.

## 1. API types (`src/types/event.ts`)

| Type | Fields | Notes |
|---|---|---|
| `EventStatus` | `'active' \| 'closed'` | Literal union (`data-fetching.md` §2) |
| `CreateEventRequest` | `name: string`, `organizerDisplayName: string` | Sent trimmed. No other keys (server rejects unknown fields). |
| `EventMe` | `participantId: string`, `displayName: string`, `isOrganizer: boolean` | |
| `EventStats` | `participantCount`, `availableClothingCount`, `confirmedExchangeCount` (numbers) | Not shown in this feature |
| `Event` | `id`, `name`, `status: EventStatus`, `entryCode`, `entryUrl`, `organizerParticipantId`, `createdAt` (ISO string), `closedAt: string \| null`, `me: EventMe`, `stats: EventStats \| null` | Read-event shape (02); `stats` is `null` for non-organizers in read-event and always present on create (001 OpenAPI) |
| `EventSession` | `event: Event`, `participantToken: string` | 201 response body |

## 2. Device-held event record (`src/lib/session.ts`)

Storage: `localStorage`, key `vr:event:{eventId}`, JSON value. One record per event; a device may hold many.

| Field | Type | Rule |
|---|---|---|
| `participantToken` | string, non-empty | Never logged, never rendered |
| `participantId` | string, non-empty | `event.me.participantId` |
| `share` | object, optional | Temporary H2 snapshot until read-event (02) exists |
| `share.name` | string | `event.name` |
| `share.entryCode` | string | Exactly as returned |
| `share.entryUrl` | string | Exactly as returned |

- Read path: `JSON.parse` → Zod `safeParse`; failure or absence → `null`.
- Write path: overwrites only `vr:event:{eventId}`.
- `getSessionHeaders(eventId)` → `{ Authorization: 'Bearer <token>' }` or `{}` when no record.

## 3. Create form state (`CreateEventScreen`)

| State | Type | Transitions |
|---|---|---|
| `values` | `{ name: string; organizerDisplayName: string }` | Raw typed text; never trimmed in place |
| `fieldErrors` | `Partial<Record<'name' \| 'organizerDisplayName', string>>` | Set by device validation or server 422 mapping; a field's entry is removed when that field changes |
| `formError` | `string \| null` | Set by storage-unavailable, non-field `ApiError`, or unmappable 422; cleared at next submit |
| mutation status | `idle → pending → success \| error` | `pending` blocks the submit button; `error` → back to editable with input kept; `success` → save record → `router.replace` to H2 |

## 4. Validation rules (`src/lib/validation/event.ts`)

| Field | After `trim()` | Reason |
|---|---|---|
| `name` | empty | `required` |
| `name` | > 60 code points | `too_long` |
| `organizerDisplayName` | empty | `required` |
| `organizerDisplayName` | > 30 code points | `too_long` |
| either | contains `\p{Cc}` | `invalid_characters` |

Order per field: `required`, then `too_long`, then `invalid_characters` (one message per field). Messages: [research.md](research.md) R6.

## 5. H2 view state (`EventCreatedScreen`)

| State | Shown |
|---|---|
| not yet read (first render) | nothing (avoids hydration mismatch) |
| record with `share` | event name, QR, entry code, [Copy link], same-device notice, [Register my clothes], [Go home] |
| no record / no `share` | "This event's share details aren't saved on this device." + [Go to start] |
| copy status | `idle` → `copied` ("Link copied") or `manual` (selectable link + "Copy this link manually.") |
