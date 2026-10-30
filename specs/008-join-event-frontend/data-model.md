# Data Model: Join Event Frontend (Mobile)

These are frontend-only types. The shared API contract is unchanged; see [contracts/ui-join-event.md](contracts/ui-join-event.md).

## EventPreview (new, `src/types/event.ts`)

Result of `GET /api/v1/entry-codes/{entryCode}`, validated by `parseEventPreview`.

| Field | Type | Rule |
|---|---|---|
| `eventId` | string | non-empty |
| `name` | string | — |
| `status` | `EventStatus` | `active` \| `closed` |

Any other shape → `ApiError(200, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')`.

## JoinEventRequest (new, `src/types/event.ts`)

Body of `POST /api/v1/events/{eventId}/participants`.

| Field | Type | Rule (device side, before sending) |
|---|---|---|
| `entryCode` | string | the trimmed code that produced the current preview |
| `displayName` | string | trimmed; 1–30 code points; no control characters |

## EventSession (existing) — join result

Same `{ event, participantToken }` shape as event creation. `parseJoinSession(data, eventId)` checks the following and otherwise throws `UNKNOWN_ERROR`:

- `event` passes `eventSchema`
- `participantToken` is a non-empty string
- `event.id === eventId`
- `event.me.isOrganizer === false`
- `event.me.participantId` is non-empty and differs from `event.organizerParticipantId`
- `event.stats === null`

`eventSchema` alone accepts a "non-organizer" whose participant ID equals the organizer ID, and an empty participant ID. The extra checks reject both (research R2).

## Device-held event access (existing, `src/lib/session.ts`)

On a successful join, the screen saves `saveEventSession(event.id, { participantToken, participantId: event.me.participantId })`. There is no `share`, because joined participants have no share card. `hasEventSession(eventId)` drives the already-joined view.

## Query/mutation keys (`src/lib/api/query-keys.ts`)

| Key | Use |
|---|---|
| `queryKeys.entryCodePreview(code)` = `['entry-codes', code]` | preview query (`staleTime: 0`, `gcTime: 0`, `retry: 0`) |
| prefix `['entry-codes']` | `useIsEntryCodeLookupPending()` = `useIsFetching({ queryKey: ['entry-codes'] }) > 0`; [Find event] is busy while any lookup is in flight (research R3) |
| `queryKeys.event(eventId)` (existing) | seeded with the join result before navigating to P2 |

## Validation results (`src/lib/validation/join.ts`)

- `readInitialCode(value: string | string[] | undefined) → string | null`: the first `code` value, trimmed, or `null` if missing or blank
- `validateEntryCode(raw) → { ok: true; value: string } | { ok: false; message: 'Enter the entry code.' }`
- `validateDisplayName(raw) → { ok: true; value: string } | { ok: false; message }`, where the message is "Enter a display name of 1–30 characters." or "Remove line breaks and tabs."
- `mapJoinServerFieldErrors(details) → { fieldErrors: Partial<Record<'entryCode' | 'displayName', string>>; formError: string | null }`

## Failure mappings (`src/lib/event.ts`)

| Function | Input | Output |
|---|---|---|
| `getLookupFailure` | `NOT_FOUND` | `{ kind: 'codeField', message: error.message }` |
| | anything else | `{ kind: 'form', message: getFormErrorMessage(error) }` |
| `getJoinFailure` | `DISPLAY_NAME_TAKEN` | `{ kind: 'displayNameField', message: error.message }` |
| | `EVENT_CLOSED` | `{ kind: 'closed' }` |
| | `NOT_FOUND` | `{ kind: 'codeNotFound', message: error.message }` |
| | `VALIDATION_ERROR` | `{ kind: 'fields', ...mapJoinServerFieldErrors(error.details) }` |
| | anything else (network, timeout, 5xx, `UNKNOWN_ERROR`, non-`ApiError`) | `{ kind: 'form', message: getFormErrorMessage(error) }` |

## P1 view state (`JoinEventScreen`)

The view is derived on each render, not stored. The order of checks is the precedence.

| View | Condition | Shows |
|---|---|---|
| `closed` | `closedOverride` set (join returned `EVENT_CLOSED`), or the preview says `closed` and the device has no access | name, "Closed" badge, "This event has ended. You can no longer join." in `role="status"` (focused when caused by `closedOverride`), [Go to start] |
| `alreadyJoined` | a preview exists and (`alreadyJoinedOverride` or `hasEventSession(preview.eventId)`) | name, state badge, "You've already joined this event on this device.", [Go to event home] |
| `joining` | the join mutation is pending | active view, code read-only, [Join] busy |
| `active` | the preview says `active` | name, "Active" badge, "My display name", [Join] |
| `lookingUp` | `submittedCode !== null` and the query is fetching with no data | code field, [Find event] busy |

[Find event] is also busy in `codeEntry` while any entry-code lookup is in flight (`useIsEntryCodeLookupPending`).
| `codeEntry` | otherwise | "Entry code" field, [Find event], and any code/form error |

Local state: `codeInput`, `submittedCode`, `displayName`, `fieldErrors` (`entryCode`, `displayName`), `formError`, `closedOverride`, `alreadyJoinedOverride`.

### Transitions

```text
codeEntry ──[Find event] valid──▶ lookingUp ──200 active──▶ active ──[Join] valid──▶ joining ──201──▶ P2 (replace)
   ▲  ▲                              │   └─200 closed──▶ closed        │                 ├─409 EVENT_CLOSED──▶ closed
   │  └────── 404 / error ───────────┘                                  │                 ├─409 DISPLAY_NAME_TAKEN / 422──▶ active (field errors)
   │                                                                    │                 ├─404──▶ codeEntry (code error, submittedCode=null)
   └─────────── edit code (submittedCode=null, clear preview, closedOverride=false) ◀──────┘                 └─network/5xx/invalid──▶ active (form error)
preview + device access ──▶ alreadyJoined ──[Go to event home]──▶ P2
active ──[Join] and hasEventSession now true (other tab)──▶ alreadyJoined (alreadyJoinedOverride, no request)
```

- Initial state: `submittedCode = validateEntryCode(initialCode)`. A valid value goes to `lookingUp`; otherwise the screen starts at `codeEntry` with no error.
- Editing the display name clears its field error and `formError`. Editing the code clears the code error, `formError`, the display name error, `closedOverride`, and `alreadyJoinedOverride`.
