# Join Event API

Validates a QR link or entry code and creates a participant session. Screen: P1. Common rules: [README](README.md).

The flow uses two calls: look up the event by code to show its name, then join with a display name.

## 1. `GET /api/v1/entry-codes/{entry_code}`

Returns a public preview of the event for the code.

### Headers

| Header | Required | Value |
|---|---|---|
| `Authorization` | No | Not used |
| `X-Request-ID` | No | Correlation ID |

### Path Parameters

| Name | Description |
|---|---|
| `entry_code` | Entry code from the QR link (`?code=`) or typed by the user. Matched case-insensitively after trimming |

### Response — `200 OK`

| Field | Type | Description |
|---|---|---|
| `eventId` | string | Event ID used to join |
| `name` | string | Event name |
| `status` | enum | `active`, `closed` |

```json
{
  "eventId": "9a0d6c1e-2b7f-4f0a-9c8e-1d2f3a4b5c6d",
  "name": "Mangwon Flea Market Swap Corner",
  "status": "active"
}
```

A closed event is still returned so P1 can explain that joining is unavailable.

### Errors

| Status | Code | When |
|---|---|---|
| 404 | `NOT_FOUND` | No event uses this code. Message: "We couldn't find an event with this code. Check the code and try again." |

**SHOULD:** rate-limit lookups per client IP to slow code guessing. Never log the raw code; mask it (for example, `K7****`).

## 2. `POST /api/v1/events/{event_id}/participants`

Creates a participant and returns the participant's session token.

### Headers

| Header | Required | Value |
|---|---|---|
| `Content-Type` | Yes | `application/json; charset=utf-8` |
| `Authorization` | No | Not used; the entry code is the proof of entry |
| `X-Request-ID` | No | Correlation ID |

### Request Body

| Field | Type | Required | Rule |
|---|---|---|---|
| `entryCode` | string | Yes | Must match the event's code (case-insensitive) |
| `displayName` | string | Yes | 1–30 characters after trimming; unique in the event, case-insensitive |

```json
{
  "entryCode": "k7p3qx",
  "displayName": "Joon"
}
```

### Response — `201 Created`

Returns an `EventSession`, the same shape as [event creation](01-create-event.md#response--201-created): `event` (with `me.isOrganizer = false` and `stats = null`) and `participantToken`.

### Processing Rules

1. Look up the event by `event_id`; compare `entryCode` in constant time.
2. Reject if the event is closed.
3. Create the participant and store the token hash in one transaction.
4. Log `INFO` event `participant_joined` with `extra`: `event_id`, `participant_id`.

### Errors

| Status | Code | When |
|---|---|---|
| 422 | `VALIDATION_ERROR` | Missing or invalid field |
| 404 | `NOT_FOUND` | Event does not exist, or `entryCode` does not match (same response so the event's existence is not revealed) |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `DISPLAY_NAME_TAKEN` | Display name already used in this event. `details`: `{ "field": "displayName" }` |

### Idempotency

Not idempotent. Repeated requests create separate participants (or fail with `DISPLAY_NAME_TAKEN`). The frontend disables the button while the request is in flight.

## Open Decisions

- Returning-participant verification and session recovery. Joining again from a new device currently creates a new participant.
