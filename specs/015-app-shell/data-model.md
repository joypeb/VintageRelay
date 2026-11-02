# Data Model: 015 App Shell

**Feature**: specs/015-app-shell/spec.md · **Date**: 2026-11-02
**Note**: Frontend-only feature. No backend entities change. This model covers the device-side records and UI state introduced or reused here.

## Saved event session (extended)

Stored in `localStorage` under key `vr:event:<eventId>` (unchanged key format).

| Field | Type | Required | Notes |
|---|---|---|---|
| `participantToken` | string, non-empty | Yes | Per-event bearer token; sent only as `Authorization` header |
| `participantId` | string, non-empty | Yes | Caller's participant ID; compared against `organizerParticipantId` for organizer UI |
| `share` | `{ name, entryCode, entryUrl }` | No | Join/share details from creation |
| `savedAt` | number (epoch ms) | No (new) | Set on every save from this feature on; drives newest-first landing order |

Validation: parsed with the existing zod schema (`savedAt` optional). Unreadable records are removed on landing load. Entries whose event read fails transiently (network/server error, not unauthenticated/not-found) are retained with unknown name/status and a retry action.

State transitions: `saved` → `removed` (unauthenticated/not-found, or unreadable record). Transient read failures keep the entry with unknown state plus retry; never a guessed name or status.

## Landing list (derived, not stored)

Derived per load from `listAllEventSessions()` + one event read per session.

| Field | Source | Notes |
|---|---|---|
| `eventId` | session key suffix | Link target to the event home |
| `name` | event read | Displayed; terminal failures (unauthenticated/not-found) drop the entry, transient failures show unknown with retry — never a guessed name |
| `status` | event read (`active` \| `closed`) | Displayed as Active/Closed |
| order | `savedAt` desc; sessions without `savedAt` last, relative order kept | Confirmed in clarify 2026-11-02 |

## Tab navigation (UI state)

Fixed set, fixed order: Home, Search, Trades, My items. Active tab derives from the current pathname (no separate state). Absent on the created/share route by route-group construction.

## Organizer menu visibility (derived rule)

`me.participantId === organizerParticipantId` from the event read and event status active → show Manage entry in the header menu; otherwise hidden. Display-only; the server still enforces organizer authorization.
