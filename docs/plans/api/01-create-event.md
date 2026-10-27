# Create Event API

Creates an event, registers the creator as its organizer participant, activates the event immediately, and returns the organizer's session token. Screen: H1 → H2. Common rules: [README](README.md).

## `POST /api/v1/events`

### Headers

| Header | Required | Value |
|---|---|---|
| `Content-Type` | Yes | `application/json; charset=utf-8` |
| `Authorization` | No | Not used; anyone may create an event |
| `X-Request-ID` | No | Correlation ID |

### Request Body

| Field | Type | Required | Rule |
|---|---|---|---|
| `name` | string | Yes | Event name, 1–60 characters after trimming |
| `organizerDisplayName` | string | Yes | Organizer's display name, 1–30 characters after trimming |

```json
{
  "name": "Mangwon Flea Market Swap Corner",
  "organizerDisplayName": "Mina"
}
```

### Response — `201 Created`

Returns an `EventSession`.

| Field | Type | Description |
|---|---|---|
| `event` | `Event` | Created event; schema in [02-read-event.md](02-read-event.md). `me.isOrganizer` is `true` |
| `participantToken` | string | Organizer's bearer token. Returned **only here and on join**; never returned again |

```json
{
  "event": {
    "id": "9a0d6c1e-2b7f-4f0a-9c8e-1d2f3a4b5c6d",
    "name": "Mangwon Flea Market Swap Corner",
    "status": "active",
    "entryCode": "K7P3QX",
    "entryUrl": "https://vintage-relay.example/join?code=K7P3QX",
    "organizerParticipantId": "c21e4b7a-8d9f-4e1a-b2c3-d4e5f6a7b8c9",
    "createdAt": "2026-10-27T05:30:00Z",
    "closedAt": null,
    "me": {
      "participantId": "c21e4b7a-8d9f-4e1a-b2c3-d4e5f6a7b8c9",
      "displayName": "Mina",
      "isOrganizer": true
    },
    "stats": {
      "participantCount": 1,
      "availableClothingCount": 0,
      "confirmedExchangeCount": 0
    }
  },
  "participantToken": "q3Jx...base64url..."
}
```

### Processing Rules

1. Validate and trim `name` and `organizerDisplayName`.
2. In **one transaction**:
   - Insert the event with `status = active`, a temporarily empty organizer ID, and a unique entry code.
   - Insert the organizer participant and the token hash.
   - Set `events.organizer_participant_id` to that participant.
3. Roll back everything if any step fails. Never expose an active event without an organizer.
4. Build `entryUrl` from `APP_BASE_URL` (proposed backend environment variable; it must be the public frontend origin, the same value as the frontend's `NEXT_PUBLIC_APP_URL`) as `{APP_BASE_URL}/join?code={entryCode}`. The frontend renders the QR code from `entryUrl`; there is no QR image API.
5. Log `INFO` event `event_created` with `extra`: `event_id` (never the raw entry code).

**Proposed entry code format:** 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O/1/I`), stored uppercase, matched case-insensitively. Regenerate on collision.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Body is not valid JSON |
| 422 | `VALIDATION_ERROR` | Missing field, empty after trimming, or too long. `details.fields[].reason`: `required`, `too_long` |
| 500 | `INTERNAL_ERROR` | Transaction failed; nothing is persisted |

### Idempotency

Not idempotent. Repeated requests create separate events; the frontend disables the button while the request is in flight.

## Open Decisions

- Organizer session recovery. Until decided, H2 should warn that the organizer must keep using the same device and browser.
- Whether event creation needs abuse protection (rate limiting) in deployment.
