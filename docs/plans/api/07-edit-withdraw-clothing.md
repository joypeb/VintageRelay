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

At least one field is required. Each field uses the same rules as [registration](06-register-read-clothing.md#request-body); omitted fields keep their current value.

| Field | Type | Required | Rule |
|---|---|---|---|
| `photoIds` | string[] | No | **Replaces the whole photo list.** 1–10 unique photos in the new order; the first is the main photo. Each photo is either already attached to this garment or uploaded by the owner in this event and unattached |
| `category` | enum | No | `top`, `outer`, `bottom`, `other` |
| `title` | string | No | 1–100 characters after trimming; no control characters |
| `description` | string | No | 1–1,000 characters after trimming |
| `measurements` | `Measurements` \| null | No | **Replaces the whole measurements object** (no per-field merge). `null` or `{}` clears all measurements |

Category/measurement rule: the [`Measurements` group rule](06-register-read-clothing.md#measurements-schema) is checked against the **resulting** category and measurements (sent value, else current value). Changing `category` while stored measurements do not fit the new category, without sending fitting `measurements` (or `null`), returns `422` instead of silently dropping values. The C2 edit form sends `category` and `measurements` together.

```json
{
  "category": "outer",
  "title": "Green denim jacket",
  "description": "Cropped green denim jacket, size M. Small stain on the left cuff.",
  "measurements": { "totalLength": 22.5, "chest": 21.0, "sleeve": 24.0 }
}
```

### Response — `200 OK`

Returns the current `Clothing` ([schema](06-register-read-clothing.md#clothing-schema)).

### Processing Rules

In **one transaction**, following the [shared check order](README.md#check-order):

1. Verify the caller owns the garment.
2. **Replay:** if submitted values equal the current values (`photoIds` compared in order, `measurements` after `{}` → `null` normalization), return `200` without changes.
3. Verify the event is active and the garment is not `confirmed` or `withdrawn`.
4. Otherwise update the content and increment `contentVersion`. When `photoIds` changes, attach new photos and rewrite every position in the new order; photos dropped from the list are detached (`photos.clothing_id = null`) and become unattached photos of the owner. Their retention is undecided.
5. Mark the current analysis `stale`, upsert a `pending` analysis for the new version, and start a new background analysis after the commit. An analysis started before the change must not be saved as current ([AI features](../ai-features-v1.md#6-freshness-and-concurrency)).
6. Mark every `pending` proposal containing the garment as `invalidated` with `endReason = clothing_changed` and `endedAt = now` ([proposal state transitions](README.md#proposal-state-transitions)). Their consents are void.
7. Recalculate affected cycles. Active intents are unchanged, so the same cycles reappear as **new proposal versions** requiring fresh consent.

Log `INFO` event `clothing_updated` with `extra`: `clothing_id`, `content_version`, `changed_fields` (field names only), `photo_count`, `invalidated_proposal_count`. Never log title or description text.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Caller is not the owner |
| 404 | `NOT_FOUND` | Garment or any of `photoIds` does not exist, belongs to another event, or the photo was uploaded by another participant (existence hidden; see [contract](../../rules/dev/common/api-contract.md#authentication-decided)) |
| 409 | `EVENT_CLOSED` | Event is closed (checked after the unchanged-content replay) |
| 409 | `CLOTHING_ALREADY_CONFIRMED` | Garment is in a confirmed exchange. Message: "Cancel the confirmed exchange before editing this garment." |
| 409 | `CLOTHING_NOT_AVAILABLE` | Garment is withdrawn |
| 409 | `PHOTO_ALREADY_ATTACHED` | New photo is attached to another garment |
| 422 | `VALIDATION_ERROR` | Empty body; unknown field; invalid field per the registration rules; resulting category and measurements do not fit |

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
5. Set `status = withdrawn`. If the garment's [clothing analysis](../ai-features-v1.md#3-clothing-analysis) is `pending` for the current `contentVersion`, mark it `failed` (019); `done`/`failed` rows are left unchanged.
6. Set every `active` intent (exchange request) offering or wanting the garment to `invalidated` (both the owner's and other participants' requests).
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

## 017 Deferral Note (implemented)

Feature 017 implements PATCH/DELETE with the guards above but defers PATCH step 5 (analysis stale/pending restart → 018) and PATCH steps 6–7 plus DELETE steps 6–7 (intent/proposal invalidation and cycle recalculation → 020). Invalidation counts are logged as 0. The confirmed checks (`CLOTHING_ALREADY_CONFIRMED`) are kept. 018 must re-enable the analysis step; 020 must re-enable invalidation and recalculation.

## Open Decisions

- Whether withdrawn garments can be restored (not supported in this draft).
- Preserving the clothing content that participants reviewed at confirmation (history), since edits after cancellation change it.
