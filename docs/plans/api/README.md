# Vintage Relay API Specification (Draft v1)

This directory splits section 4 of the [initial development plan](../vintage-relay-plan-v1.md) into one document per API function. AI features (clothing analysis, preference interpretation, recommendations) are specified separately in [ai-features-v1.md](../ai-features-v1.md).

These documents follow the [API contract](../../rules/dev/common/api-contract.md), which remains the sole source of truth for shared HTTP formats, authentication, and error codes. Path structure, bearer-token authentication, feature error codes, the 403/404 authorization policy, and the [proposal suppression rule](11-proposals.md#proposal-generation) are decided (see `AGENTS.md` Open Decisions). Items still marked **proposed** (limits, formats, timeouts) need agreement before implementation.

## 1. Documents

| # | Document | Endpoints |
|---|---|---|
| 01 | [Create event](01-create-event.md) | `POST /api/v1/events` |
| 02 | [Read event](02-read-event.md) | `GET /api/v1/events/{event_id}` |
| 03 | [Close event](03-close-event.md) | `POST /api/v1/events/{event_id}/close` |
| 04 | [Join event](04-join-event.md) | `GET /api/v1/entry-codes/{entry_code}`, `POST /api/v1/events/{event_id}/participants` |
| 05 | [Upload photo](05-upload-photo.md) | `POST /api/v1/events/{event_id}/photos` |
| 06 | [Register/read clothing](06-register-read-clothing.md) | `POST /api/v1/events/{event_id}/clothing`, `GET /api/v1/events/{event_id}/clothing`, `GET /api/v1/clothing/{clothing_id}` |
| 07 | [Edit/withdraw clothing](07-edit-withdraw-clothing.md) | `PATCH /api/v1/clothing/{clothing_id}`, `DELETE /api/v1/clothing/{clothing_id}` |
| 08 | [Preferences](08-preferences.md) | `GET /api/v1/participants/{participant_id}/preferences`, `PATCH /api/v1/participants/{participant_id}/preferences` |
| 09 | [Select/withdraw intent](09-intents.md) | `POST /api/v1/events/{event_id}/intents`, `GET /api/v1/events/{event_id}/intents`, `DELETE /api/v1/intents/{intent_id}` |
| 10 | [Alternative suggestions](10-alternative-suggestions.md) | `GET /api/v1/events/{event_id}/alternative-suggestions`, `POST /api/v1/alternative-suggestions/{suggestion_id}/accept`, `POST /api/v1/alternative-suggestions/{suggestion_id}/reject` |
| 11 | [Read proposals](11-proposals.md) | `GET /api/v1/events/{event_id}/proposals`, `GET /api/v1/proposals/{proposal_id}` |
| 12 | [Consent/reject proposal](12-consent-reject-proposal.md) | `POST /api/v1/proposals/{proposal_id}/consents`, `POST /api/v1/proposals/{proposal_id}/reject` |
| 13 | [Cancel confirmed exchange](13-cancel-exchange.md) | `POST /api/v1/proposals/{proposal_id}/cancel` |
| 14 | [Read confirmation/handover](14-confirmed-exchanges.md) | Confirmed views of document 11 endpoints |
| AI | [AI features](../ai-features-v1.md) | `POST/PATCH /api/v1/clothing/{clothing_id}/analysis`, `POST /api/v1/participants/{participant_id}/preferences/interpretation`, `GET /api/v1/events/{event_id}/recommendations` |

Proposals are never created by a client request. The server creates them inside the same transaction as intent, clothing, alternative-acceptance, and cancellation changes (see [11-proposals.md](11-proposals.md)).

## 2. Path Conventions (Decided)

Defined in the [API contract](../../rules/dev/common/api-contract.md#2-urls-and-methods):

- Event-scoped **collections** are nested under the event: `/events/{event_id}/clothing`, `/events/{event_id}/intents`, `/events/{event_id}/proposals`.
- **Individual resources** with globally unique IDs are top-level: `/clothing/{clothing_id}`, `/intents/{intent_id}`, `/proposals/{proposal_id}`. This keeps nesting within two levels.
- Non-CRUD state transitions use `POST /resources/{id}/verb` (`close`, `accept`, `reject`, `cancel`).

## 3. Authentication (Decided)

Defined in the [API contract](../../rules/dev/common/api-contract.md#authentication-decided). Summary:

- Event creation ([01](01-create-event.md)) and join ([04](04-join-event.md)) return a `participantToken`; send it as `Authorization: Bearer <participantToken>`.
- The token identifies **one participant in one event**. The server stores only its hash (`participants.session_token_hash`).
- Organizer permission is derived from `participant.id == event.organizerParticipantId`; there is no separate organizer token.
- Entry codes and QR links grant entry only. They never authenticate requests.
- Token lifetime is **proposed**: tokens do not expire before the event's data retention ends in v1 (retention is an open decision). Session recovery on another device remains an open decision; losing the token loses access.
- A header is used instead of a cookie because the frontend (Next.js) and backend (FastAPI) may be served from different origins, and a participant may hold sessions for several events on one device. The frontend keeps one token per event.

Authorization failures:

| Situation | Status | Code |
|---|---|---|
| Missing, malformed, or unknown token | 401 | `UNAUTHENTICATED` |
| Token belongs to a different event than the requested resource | 404 | `NOT_FOUND` |
| Same event, but the action requires another role or ownership | 403 | `FORBIDDEN` |
| Same event, but the resource is private to other participants (a proposal the caller is not in, a photo another participant uploaded, another participant's intent or preference) | 404 | `NOT_FOUND` (existence hidden) |

Use `404` instead of `403` **only** to hide that a private resource exists. Resources visible to everyone in the event, such as garments and the event itself, return `403` for role or ownership failures.

## 4. Headers

### Request

| Header | Required | Value |
|---|---|---|
| `Authorization` | All endpoints except event creation, entry-code lookup, and join | `Bearer <participantToken>` |
| `Content-Type` | Requests with a body | `application/json; charset=utf-8`, or `multipart/form-data` for photo upload only |
| `Accept` | Optional | `application/json` |
| `X-Request-ID` | Optional | Client-generated correlation ID; the server reuses it |

### Response

| Header | When | Value |
|---|---|---|
| `X-Request-ID` | Always | Same as the error body's `requestId` |
| `Content-Type` | Responses with a body | `application/json; charset=utf-8` |

`204 No Content` responses have no body. CORS must allow the `Authorization` and `X-Request-ID` request headers and expose `X-Request-ID`; allowed origins come from `CORS_ORIGINS`.

## 5. Error Handling

All errors use the [contract error format](../../rules/dev/common/api-contract.md#7-error-response-format-decided). Validation errors return `details.fields` with camelCase field names.

### Check Order

Apply checks in this order so the same request always produces the same error:

1. Request parsing and schema validation (`400` / `422`).
2. Authentication (`401`).
3. Resource existence and event scope (`404`).
4. Role or ownership (`403`).
5. **Idempotent replay:** if the resource is already in the requested target state, return the endpoint's normal success response (`200` with the current state, or `204` for endpoints without a body; see the contract's duplicate state transition table). Replay runs **before** the event-state check, so a retry after closure returns the first result.
6. Event state (`409 EVENT_CLOSED`).
7. Feature-specific state checks (`409`).

### Feature Error Codes

Defined in the [API contract](../../rules/dev/common/api-contract.md#7-error-response-format-decided). Where each is used:

| Code | Used in |
|---|---|
| `DISPLAY_NAME_TAKEN` | 04 |
| `PHOTO_ALREADY_ATTACHED` | 06, 07 |
| `CLOTHING_NOT_AVAILABLE` | 07, 09, 10, 12, AI |
| `INTENT_NOT_ACTIVE` | 10, 12 |
| `ALTERNATIVE_NO_LONGER_VALID` | 10 |
| `PROPOSAL_NOT_CONFIRMED` | 13 |
| `CONTENT_VERSION_MISMATCH` | 08, AI |
| `ANALYSIS_NOT_READY` | AI |
| `PREFERENCE_REQUIRED` | AI |

### Proposal State Transitions

Every proposal transition sets the fields below in the same transaction. `endedAt` drives the [suppression rule](11-proposals.md#proposal-generation).

| Transition | Spec | Result `status` | `endReason` | Timestamps set |
|---|---|---|---|---|
| All participants consent | [12](12-consent-reject-proposal.md) | `confirmed` | `null` | `confirmedAt` (not `endedAt`) |
| A participant rejects | [12](12-consent-reject-proposal.md) | `rejected` | `participant_rejected` | `endedAt` |
| Confirmation recheck fails | [12](12-consent-reject-proposal.md) | `invalidated` | `intent_changed` / `clothing_confirmed_elsewhere` / `clothing_withdrawn` | `endedAt` |
| Another proposal confirms a shared garment | [12](12-consent-reject-proposal.md) | `invalidated` | `clothing_confirmed_elsewhere` | `endedAt` |
| Garment edited | [07](07-edit-withdraw-clothing.md) | `invalidated` | `clothing_changed` | `endedAt` |
| Garment withdrawn | [07](07-edit-withdraw-clothing.md) | `invalidated` | `clothing_withdrawn` | `endedAt` |
| Intent withdrawn or offered garment changed | [09](09-intents.md), [10](10-alternative-suggestions.md) | `invalidated` | `intent_changed` | `endedAt` |
| Event closed while pending (**proposed**) | [03](03-close-event.md) | `invalidated` | `event_closed` | `endedAt` |
| Confirmed exchange cancelled | [13](13-cancel-exchange.md) | `cancelled` | `participant_cancelled` | `cancelledAt`, `endedAt` |

## 6. Shared Value Rules

- IDs are opaque strings. Stored resources use UUID v4; derived resources that are not stored, such as alternative suggestions (`alt_...`), use a server-generated opaque ID. Entry codes are not IDs. Times are UTC ISO 8601 with `Z`.
- Enums are lowercase `snake_case`. Empty lists are `[]`; absent schema fields are `null`.
- Lists use `{ "items": [...], "nextCursor": null }` without pagination.
- After any state change, the response contains the **current** state. Clients must not assume a `200` means their request changed state.

### Proposed Input Limits

| Value | Limit |
|---|---|
| Event name | 1–60 characters after trimming |
| Display name | 1–30 characters after trimming; unique per event, case-insensitive |
| Clothing description | 1–1,000 characters |
| Preference text | 1–1,000 characters |
| Photo | 10 MB; `image/jpeg`, `image/png`, `image/webp` |

Participant and garment counts per event remain an open decision; no limits are enforced in this draft.

## 7. Open Decisions Not Settled Here

- Session recovery and organizer permission recovery.
- Photo and event record retention/deletion, including unattached photos.
- Handover completion records and cancellation after partial handover.
- Post-closure access duration for confirmed records.
- Proposal ordering, and whether clothing details show interested participants.
