# Edit/Withdraw Clothing API

The owner edits or withdraws a garment. Changes invalidate affected unconfirmed proposals and their consents. Confirmed garments cannot be edited or withdrawn until the exchange is cancelled. Screens: C2 (edit), C4. Common rules: [README](README.md).

## 1. `PATCH /api/v1/clothing/{clothing_id}`

### Headers

| Header | Required | Value |
|---|---|---|
| `Authorization` | Yes | Owner's `Bearer <participantToken>` |
| `Content-Type` | Yes | `application/json; charset=utf-8` |
| `X-Request-ID` | No | Correlation ID |

### Request Body

At least one field is required.

| Field | Type | Required | Rule |
|---|---|---|---|
| `photoId` | string | No | New photo uploaded by the owner in this event and unattached |
| `description` | string | No | 1–1,000 characters |

```json
{
  "description": "Cropped green denim jacket, size M. Small stain on the left cuff."
}
```

### Response — `200 OK`

Returns the current `Clothing` ([schema](06-register-read-clothing.md#clothing-schema)).

### Processing Rules

In **one transaction**, following the [shared check order](README.md#check-order):

1. Verify the caller owns the garment.
2. **Replay:** if submitted values equal the current values, return `200` without changes.
3. Verify the event is active and the garment is not `confirmed` or `withdrawn`.
4. Otherwise update the content and increment `contentVersion`. When the photo changes, attach the new photo; the old photo's retention is undecided.
5. Mark the current analysis `stale`. An analysis started before the change must not be saved as current ([AI features](../ai-features-v1.md#7-freshness-and-concurrency)).
6. Mark every `pending` proposal containing the garment as `invalidated` with `endReason = clothing_changed` and `endedAt = now` ([proposal state transitions](README.md#proposal-state-transitions)). Their consents are void.
7. Recalculate affected cycles. Active intents are unchanged, so the same cycles reappear as **new proposal versions** requiring fresh consent.

Log `INFO` event `clothing_updated` with `extra`: `clothing_id`, `content_version`, `invalidated_proposal_count`.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Caller is not the owner |
| 404 | `NOT_FOUND` | Garment or `photoId` does not exist, belongs to another event, or the photo was uploaded by another participant (existence hidden; see [contract](../../rules/dev/common/api-contract.md#authentication-decided)) |
| 409 | `EVENT_CLOSED` | Event is closed (checked after the unchanged-content replay) |
| 409 | `CLOTHING_ALREADY_CONFIRMED` | Garment is in a confirmed exchange. Message: "Cancel the confirmed exchange before editing this garment." |
| 409 | `CLOTHING_NOT_AVAILABLE` | Garment is withdrawn |
| 409 | `PHOTO_ALREADY_ATTACHED` | New photo is attached to another garment |
| 422 | `VALIDATION_ERROR` | Empty body, or invalid field |

## 2. `DELETE /api/v1/clothing/{clothing_id}`

Withdraws the garment (soft delete; the row remains with `status = withdrawn`).

### Headers

`Authorization: Bearer <participantToken>` of the owner (required), `X-Request-ID` (optional). No body.

### Response — `204 No Content`

### Processing Rules

In **one transaction**:

1. Verify the caller owns the garment.
2. **Replay:** if already `withdrawn`, return `204` without changes, even after closure.
3. Verify the event is active.
4. Reject if `confirmed`.
5. Set `status = withdrawn`.
6. Set every `active` intent offering or wanting the garment to `invalidated` (both the owner's and other participants' intents).
7. Mark every `pending` proposal containing the garment as `invalidated` with `endReason = clothing_withdrawn` and `endedAt = now` ([proposal state transitions](README.md#proposal-state-transitions)).

Log `INFO` event `clothing_withdrawn` with `extra`: `clothing_id`, `invalidated_intent_count`, `invalidated_proposal_count`.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Caller is not the owner |
| 404 | `NOT_FOUND` | Garment does not exist or belongs to another event |
| 409 | `EVENT_CLOSED` | Event is closed (checked after the already-withdrawn replay) |
| 409 | `CLOTHING_ALREADY_CONFIRMED` | Garment is in a confirmed exchange. Message: "Cancel the confirmed exchange before withdrawing this garment." |

### Idempotency

Idempotent. Repeated withdrawals return `204`.

## Open Decisions

- Whether withdrawn garments can be restored (not supported in this draft).
- Preserving the clothing content that participants reviewed at confirmation (history), since edits after cancellation change it.
