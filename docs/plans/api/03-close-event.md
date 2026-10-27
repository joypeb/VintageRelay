# Close Event API

The organizer closes the event. Afterwards, no exchange action is allowed. Screens: M1 → H3. Common rules: [README](README.md).

## `POST /api/v1/events/{event_id}/close`

### Headers

| Header | Required | Value |
|---|---|---|
| `Authorization` | Yes | Organizer's `Bearer <participantToken>` |
| `Content-Type` | No | No request body |
| `X-Request-ID` | No | Correlation ID |

### Path Parameters

| Name | Description |
|---|---|
| `event_id` | Event ID |

### Request Body

None.

### Response — `200 OK`

Returns the current `Event` ([schema](02-read-event.md#event-schema)) with `status = closed` and `closedAt` set.

```json
{
  "id": "9a0d6c1e-2b7f-4f0a-9c8e-1d2f3a4b5c6d",
  "name": "Mangwon Flea Market Swap Corner",
  "status": "closed",
  "entryCode": "K7P3QX",
  "entryUrl": "https://vintage-relay.example/join?code=K7P3QX",
  "organizerParticipantId": "c21e4b7a-8d9f-4e1a-b2c3-d4e5f6a7b8c9",
  "createdAt": "2026-10-27T05:30:00Z",
  "closedAt": "2026-10-27T09:00:00Z",
  "me": { "participantId": "c21e4b7a-8d9f-4e1a-b2c3-d4e5f6a7b8c9", "displayName": "Mina", "isOrganizer": true },
  "stats": { "participantCount": 14, "availableClothingCount": 21, "confirmedExchangeCount": 5 }
}
```

### Processing Rules

1. Verify the caller is the organizer.
2. If already closed, return `200` with the current event and change nothing.
3. In **one write transaction**, serialized with final consent (SQLite `BEGIN IMMEDIATE`):
   - Set `status = closed` and `closed_at`.
   - Mark all `pending` proposals as `invalidated` with `endReason = event_closed` and `endedAt = now` (proposed initial design) ([proposal state transitions](README.md#proposal-state-transitions)).
   - Keep confirmed proposals and their `is_confirmed` rows unchanged for viewing (**proposed**).
4. Log `INFO` event `event_closed` with `extra`: `event_id`, `invalidated_proposal_count`.

Because closure and final consent use the same serialized write lock, a **new** consent (not a replay of one already recorded) that starts after closure commits sees `closed` and fails with `EVENT_CLOSED`.

### Effects After Closure

- **New state changes** return `409 EVENT_CLOSED`: join, photo upload, clothing register/edit/withdraw, preference changes, AI analysis/interpretation, intent registration/withdrawal, alternative acceptance, consent/rejection, and cancellation.
- **AI recommendations** also return `409 EVENT_CLOSED`. They do not change state, but they are only useful for new exchanges.
- **Replays** of an action that already reached its target state still return their normal success response ([check order](README.md#check-order)): e.g. withdrawing an already withdrawn garment or intent (`204`), or cancelling an already cancelled exchange (`200`).
- **Local-only actions** that store nothing, such as rejecting an alternative suggestion, return `204`.
- All other `GET` endpoints remain available (**proposed**; post-closure access duration and retention are open decisions).

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Caller is not the organizer |
| 404 | `NOT_FOUND` | Event does not exist, or the token belongs to another event |
| 500 | `INTERNAL_ERROR` | Transaction failed; the event stays active |

### Idempotency

Idempotent. Repeated requests return `200` with the closed event without additional logs or state changes.

## Open Decisions

- Handover recording after closure.
- Reopening is not supported and not planned for v1.
