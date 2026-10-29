# Read Event API

Returns event information, active/closed state, and the caller's role. Screens: P2 banner, M1, closed-event banner on all screens. Common rules: [README](README.md).

## `GET /api/v1/events/{event_id}`

### Headers

| Header | Required | Value |
|---|---|---|
| `Authorization` | Yes | `Bearer <participantToken>` for this event |
| `X-Request-ID` | No | Correlation ID |

### Path Parameters

| Name | Description |
|---|---|
| `event_id` | Event ID |

### Response — `200 OK`

Returns an `Event`.

```json
{
  "id": "9a0d6c1e-2b7f-4f0a-9c8e-1d2f3a4b5c6d",
  "name": "Mangwon Flea Market Swap Corner",
  "status": "active",
  "entryCode": "K7P3QX",
  "entryUrl": "https://vintage-relay.example/join?code=K7P3QX",
  "organizerParticipantId": "c21e4b7a-8d9f-4e1a-b2c3-d4e5f6a7b8c9",
  "createdAt": "2026-10-27T05:30:00Z",
  "closedAt": null,
  "me": {
    "participantId": "5b8f0a2d-1c3e-4d5f-8a9b-0c1d2e3f4a5b",
    "displayName": "Joon",
    "isOrganizer": false
  },
  "stats": null
}
```

### `Event` Schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Event ID |
| `name` | string | Event name |
| `status` | enum | `active`, `closed` |
| `entryCode` | string | Entry code; visible to every participant so anyone can share it |
| `entryUrl` | string | Join link used for the QR code |
| `organizerParticipantId` | string | Organizer's participant ID |
| `createdAt` | string | Creation time |
| `closedAt` | string \| null | Closure time; `null` while active |
| `me` | object | Caller's participation: `participantId`, `displayName`, `isOrganizer` |
| `stats` | object \| null | **Organizer only**; `null` for other participants. Fields below |

`stats` fields (for M1):

| Field | Type | Description |
|---|---|---|
| `participantCount` | integer | Participants including the organizer |
| `availableClothingCount` | integer | Garments with `status = available` |
| `confirmedExchangeCount` | integer | Proposals with `status = confirmed` |

`availableClothingCount` and `confirmedExchangeCount` are `0` until the clothing (06) and proposal (11) features add their tables.

### Processing Rules

- Check the token first: a missing or unknown token returns `401`, even for an event that does not exist.
- Resolve the caller from the token. If the token's event differs from `event_id`, return `404`.
- `event_id` is not format-validated. A malformed ID, a non-existent ID, and another event's ID all return the same `404 NOT_FOUND`, so event existence is never revealed.
- Readable after closure. The frontend shows the closed banner when `status = closed`.
- No side effects.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing header, non-Bearer scheme, empty token, or unknown token |
| 404 | `NOT_FOUND` | Event does not exist, the ID is malformed, or the token belongs to another event |

## Open Decisions

- Post-closure read access duration and record retention.
