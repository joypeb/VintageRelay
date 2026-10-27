# API Contract (Sole Source of Truth for Backend and Frontend)

This is the **only authoritative document** for HTTP formats shared by backend and frontend. It takes precedence over their individual rules. Feature-specific paths and request/response details are specified per function in [docs/plans/api/](../../../plans/api/README.md) and [ai-features-v1.md](../../../plans/ai-features-v1.md), following this contract.

## 1. Basics

- **MUST:** place all APIs under `/api/v1`.
- **MUST:** use JSON bodies (`Content-Type: application/json; charset=utf-8`), except photo uploads using `multipart/form-data`.
- **MUST:** expose response schemas through FastAPI OpenAPI (`/docs`, `/openapi.json`). Frontend types derive from these schemas.
- **MUST NOT:** add undocumented response fields and let the frontend depend on them.

## 2. URLs and Methods

- **MUST:** use lowercase `kebab-case` paths and plural resource nouns, e.g. `/api/v1/events/{event_id}/clothing`, `/api/v1/proposals/{proposal_id}/consents`.
- **MUST:** nest event resources under events, to a maximum of two levels.
- **MUST:** nest event-scoped **collections** under the event (`/api/v1/events/{event_id}/clothing`, `/api/v1/events/{event_id}/intents`, `/api/v1/events/{event_id}/proposals`) and expose **individual resources** with globally unique IDs at the top level (`/api/v1/clothing/{clothing_id}`, `/api/v1/intents/{intent_id}`, `/api/v1/proposals/{proposal_id}`).
- **MUST:** express CRUD using HTTP methods.

| Method | Purpose |
|---|---|
| `GET` | Read; no side effects |
| `POST` | Create, or state transition actions below |
| `PATCH` | Partial update |
| `DELETE` | Delete/withdraw |

- **Allowed:** state transitions that do not fit CRUD use `POST /resources/{id}/verb`, e.g. `POST /api/v1/events/{event_id}/close`, `POST /api/v1/proposals/{proposal_id}/cancel`.
- **MUST NOT:** use `PUT` (no full replacement is required; use `PATCH`).
- **MUST NOT:** overuse verbs in paths (`/getEvent`, `/createClothing`).

## 3. JSON Field Casing (Decided)

**All API JSON uses `camelCase`.**

- **MUST:** use `camelCase` request/response keys and query parameters, e.g. `organizerParticipantId`, `createdAt`, `?eventId=...`.
- **MUST:** retain `snake_case` in Python and the DB; convert with aliases in a common Pydantic base model. Do not handwrite aliases per field.
- **MUST:** use received JSON directly in the frontend without casing conversion libraries/code.
- Path variable names (`{event_id}`) are not exposed in URL strings and may follow backend conventions.

```python
# Backend: shared base model
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
```

FastAPI serializes aliases (`camelCase`) by default. **Do not** disable this with `response_model_by_alias=False`.

## 4. Value Formats

### IDs

- **MUST:** exchange all IDs as **strings**. Clients treat them as opaque and do not interpret or calculate them.
- **SHOULD:** use lowercase, hyphenated UUID v4 in the backend. Do not expose sequential integers that make other event/participant IDs easy to guess.
- `entryCode` is a separate human-entered value, not an ID.

### Dates and Times

- **MUST:** use UTC ISO 8601 with a `Z` suffix, e.g. `"2026-10-27T05:30:00Z"` (milliseconds optional).
- **MUST:** name instants `~At` (`createdAt`, `confirmedAt`, `closedAt`) and date-only fields `~Date`.
- **MUST:** convert to Korean time only when the frontend displays it. Backend responses must not contain local-time strings.
- **MUST NOT:** use numeric Unix timestamps or timezone-less strings.

### Enums, Booleans, and Null

- **MUST:** use lowercase `snake_case` enum strings, e.g. `"active"`, `"closed"`, `"pending"`, `"confirmed"`, `"cancelled"`.
- **MUST:** prefix booleans with `is`/`has`/`can`, e.g. `isOrganizer`, `canCancel`.
- **MUST:** include fields defined in the response schema even when absent, using `null`.
- **MUST:** use `[]` for empty lists, not `null`.

## 5. Response Shape

- **MUST:** return single resources directly without a `data` wrapper.
- **MUST:** wrap lists in an object so adding pagination later does not break the shape.

```json
{ "items": [ { "id": "3f1c...", "status": "available" } ], "nextCursor": null }
```

## 5-1. Duplicate State Transition Requests (Decided)

Repeated taps and network retransmissions may duplicate requests on mobile. Respond to state transition actions as follows.

| Request | Already in target state | Changed to another state |
|---|---|---|
| Proposal consent (`proposalId`, `version`) | Already consented to that version **while the proposal is `pending` or `confirmed`**: **200 + current proposal**, no state change | Rejected/invalidated/cancelled, or version differs: 409 `EVENT_CLOSED` if the event is closed, otherwise 409 `PROPOSAL_VERSION_MISMATCH` |
| Reject proposal | Already rejected: 200 + current proposal | Already confirmed/invalidated: 409 `PROPOSAL_VERSION_MISMATCH` |
| Cancel confirmed exchange | Already cancelled (including by another party): **200 + cancelled proposal** | Event closed: 409 `EVENT_CLOSED` |
| Close event | Already closed: 200 + event | - |
| Accept alternative suggestion | Intent already offers the suggested garment **and** a proposal for the suggested cycle exists (any state): 200 + current intent and that proposal | Otherwise fall through to state checks: 409 `EVENT_CLOSED`, `INTENT_NOT_ACTIVE`, `CLOTHING_*`, or `ALTERNATIVE_NO_LONGER_VALID` |
| Register intent | Same active (offered garment, desired garment) intent exists: 200 + existing intent; do not create another | Garment confirmed elsewhere: 409 `CLOTHING_ALREADY_CONFIRMED`; withdrawn: 409 `CLOTHING_NOT_AVAILABLE` |

- **MUST:** make these requests idempotent: repetition has the same result as one request. **No** duplicate rows, duplicate logs, or double state changes.
- **MUST:** return the **current state** after processing. The frontend updates from the response and must not assume a 200 means its request changed state.
- The frontend does not automatically retry these requests. Idempotency is a server-side safeguard against repeated taps/retransmissions.

## 6. Pagination

- Event data is small; **return everything without pagination by default** (`nextCursor` always `null`).
- Add only cursor pagination if needed: `?limit=20&cursor=<opaque-string>`; `nextCursor: null` means the last page.
- **MUST NOT:** mix in `page`/`offset` pagination.

## 7. Error Response Format (Decided)

**All 4xx/5xx responses use this one format.** User-facing messages are in English.

```json
{
  "error": {
    "code": "CLOTHING_ALREADY_CONFIRMED",
    "message": "This garment is already confirmed in another exchange.",
    "details": { "clothingId": "3f1c..." },
    "requestId": "b7e2..."
  }
}
```

| Field | Rule |
|---|---|
| `code` | **MUST:** English `UPPER_SNAKE_CASE`. The sole basis for frontend branching. Never change an existing code's meaning. |
| `message` | **MUST:** an English sentence safe to show directly to users. **No** stack traces, SQL, or internal paths. |
| `details` | Optional object or `null`. Validation errors use `{"fields": [{"field": "title", "reason": "required"}]}` with camelCase `field`. |
| `requestId` | **MUST:** present and equal to the `X-Request-ID` response header. |

- **MUST:** convert FastAPI default errors (`{"detail": ...}`) and request validation errors to this format.
- **MUST NOT:** branch on `message` text in the frontend. Use `code` only.
- **MUST:** define new error codes centrally in a backend enum/constants module.

Common error codes (add feature-specific codes as needed):

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Request value validation failed |
| `BAD_REQUEST` | 400 | Malformed request, such as unparseable JSON |
| `UNAUTHENTICATED` | 401 | Participant token missing, unknown, or invalid |
| `FORBIDDEN` | 403 | Permission denied, e.g. editing another's clothing or closing as a non-organizer |
| `NOT_FOUND` | 404 | Missing resource, another event's resource, or a private resource whose existence is hidden |
| `EVENT_CLOSED` | 409 | Action not allowed in a closed event (mutations and AI recommendations) |
| `PROPOSAL_VERSION_MISMATCH` | 409 | Consent attempted for an invalid proposal version |
| `CLOTHING_ALREADY_CONFIRMED` | 409 | Garment already confirmed elsewhere |
| `FILE_TOO_LARGE` | 413 | Uploaded photo exceeds size limit |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | File type not allowed |
| `AI_UNAVAILABLE` | 503 | Model API failure/delay; frontend offers manual selection |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

Feature-specific error codes:

| Code | Status | Meaning |
|---|---|---|
| `DISPLAY_NAME_TAKEN` | 409 | Display name already used in this event |
| `PHOTO_ALREADY_ATTACHED` | 409 | Photo is already attached to another garment |
| `CLOTHING_NOT_AVAILABLE` | 409 | Garment is withdrawn or otherwise unavailable (not confirmed) |
| `INTENT_NOT_ACTIVE` | 409 | Intent was withdrawn or invalidated, including when found during proposal confirmation |
| `ALTERNATIVE_NO_LONGER_VALID` | 409 | Alternative suggestion no longer completes a cycle |
| `PROPOSAL_NOT_CONFIRMED` | 409 | Cancellation attempted on a proposal that is not confirmed |
| `CONTENT_VERSION_MISMATCH` | 409 | Clothing/preference changed since the client loaded it |
| `ANALYSIS_NOT_READY` | 409 | No completed AI analysis exists for the current clothing version |
| `PREFERENCE_REQUIRED` | 409 | Recommendations or interpretation requested without preference text |

## 8. HTTP Status Codes

| Code | Usage |
|---|---|
| `200 OK` | Successful read/update/action with result body |
| `201 Created` | Creation; return created resource |
| `204 No Content` | Deletion with no response body |
| `400` | Malformed input, such as parsing failures |
| `401` / `403` | Unauthenticated / authenticated but unauthorized |
| `404` | Missing resource; **also use for another event's resource** to avoid revealing its existence |
| `409 Conflict` | State conflict (closed event, version mismatch, duplicate confirmation) |
| `413` / `415` | Upload size/type errors |
| `422` | Request value validation failed |
| `500` | Server bug |
| `503` | External dependency (model API) unavailable |

- **MUST NOT:** return errors as `200` with `{"success": false}`.
- **MUST NOT:** use `500` for business rule violations.

## 9. Headers

- **MUST:** include `X-Request-ID` on every backend response. Reuse the request header if present; otherwise generate a value.
- **SHOULD:** include `requestId` in frontend error screens/console logs for debugging.

### Authentication (Decided)

- **MUST:** authenticate participant requests with `Authorization: Bearer <participantToken>`. Do not use cookies for sessions.
- **MUST:** issue `participantToken` only in the event creation and join responses. It is an opaque random string (at least 32 random bytes, base64url) identifying **one participant in one event**.
- **MUST:** store only a hash of the token in the database. Never log tokens or return them from other endpoints.
- **MUST:** derive organizer permission from `participant.id == event.organizerParticipantId`; there is no separate organizer token.
- **MUST NOT:** treat entry codes or QR links as authentication. They grant entry only.
- **MUST:** require the header on every endpoint except event creation, entry-code lookup, and join.
- **MUST:** respond `401 UNAUTHENTICATED` for a missing/unknown token, `404 NOT_FOUND` when the token belongs to a different event than the resource, and `403 FORBIDDEN` when the role or ownership is insufficient.
- **MUST:** use `404 NOT_FOUND` instead of `403` only to hide that a private resource exists, such as a proposal the caller does not participate in, a photo uploaded by another participant, or another participant's intent or preference. Resources visible to the whole event, such as garments, return `403` for role or ownership failures.
- **MUST:** allow the `Authorization` and `X-Request-ID` request headers in CORS and expose `X-Request-ID`.
- The frontend keeps one token per event. Session recovery on another device remains undecided.

## 10. Change Procedure

- **MUST:** state "API change" in PR descriptions for API format changes and notify both backend/frontend owners.
- **MUST NOT:** rename/remove fields used by the frontend without notice. During the hackathon, do not create `/api/v2`; update both sides in the same or consecutive PRs.
