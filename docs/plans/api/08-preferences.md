# Preferences API

Saves the participant's desired styles and exclusions, and the conditions they reviewed after AI interpretation. Each participant has **one current preference** (database design 3.6). Screens: R1, R2. AI interpretation is specified in [AI features](../ai-features-v1.md#4-preference-interpretation). Common rules: [README](README.md).

Flow: R1 saves `originalText` → AI interpretation fills `interpretedConditions` → R2 saves the reviewed `confirmedConditions`.

## `Preference` Schema

| Field | Type | Description |
|---|---|---|
| `participantId` | string | Owner |
| `originalText` | string | Free-text styles and exclusions; `""` if never saved |
| `version` | integer | Increments **only when `originalText` changes**; `0` if never saved |
| `interpretedConditions` | `PreferenceInterpretation` \| null | AI output for the current `version`; schema in [AI features](../ai-features-v1.md#23-preferenceinterpretation-and-condition) |
| `confirmedConditions` | `Condition[]` \| null | Participant-reviewed conditions for the current `version` |
| `updatedAt` | string \| null | Last change time |

## 1. `GET /api/v1/participants/{participant_id}/preferences`

### Headers

`Authorization: Bearer <participantToken>` (required; must be this participant), `X-Request-ID` (optional).

### Response — `200 OK`

Returns the `Preference`. If none was saved, returns `originalText = ""`, `version = 0`, and `null` for the rest (never `404`).

```json
{
  "participantId": "5b8f0a2d-1c3e-4d5f-8a9b-0c1d2e3f4a5b",
  "originalText": "I want a cropped green jacket without a large logo. No heavy stains.",
  "version": 2,
  "interpretedConditions": {
    "conditions": [
      { "type": "include", "attribute": "category", "value": "jacket", "isAmbiguous": false, "ambiguityNote": null, "source": "ai" },
      { "type": "include", "attribute": "color", "value": "green", "isAmbiguous": false, "ambiguityNote": null, "source": "ai" },
      { "type": "exclude", "attribute": "details", "value": "large logo", "isAmbiguous": true, "ambiguityNote": "How large is too large?", "source": "ai" }
    ]
  },
  "confirmedConditions": null,
  "updatedAt": "2026-10-27T05:50:00Z"
}
```

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Participant does not exist, belongs to another event, or is not the caller (existence hidden) |

## 2. `PATCH /api/v1/participants/{participant_id}/preferences`

### Headers

| Header | Required | Value |
|---|---|---|
| `Authorization` | Yes | `Bearer <participantToken>` of this participant |
| `Content-Type` | Yes | `application/json; charset=utf-8` |
| `X-Request-ID` | No | Correlation ID |

### Request Body

Send **exactly one** of `originalText` or `confirmedConditions`, plus `version`.

| Field | Type | Required | Rule |
|---|---|---|---|
| `version` | integer | Yes | Current `version` the client loaded (optimistic concurrency) |
| `originalText` | string | One of | 1–1,000 characters |
| `confirmedConditions` | `Condition[]` | One of | 0–30 conditions. `source` is `ai` for kept/edited AI conditions and `participant` for added ones |

R1 save:

```json
{ "version": 2, "originalText": "I want a cropped green or khaki jacket. No large logos or heavy stains." }
```

R2 save:

```json
{
  "version": 2,
  "confirmedConditions": [
    { "type": "include", "attribute": "category", "value": "jacket", "isAmbiguous": false, "ambiguityNote": null, "source": "ai" },
    { "type": "include", "attribute": "color", "value": "green", "isAmbiguous": false, "ambiguityNote": null, "source": "ai" },
    { "type": "exclude", "attribute": "details", "value": "logo larger than a palm", "isAmbiguous": false, "ambiguityNote": null, "source": "participant" }
  ]
}
```

### Response — `200 OK`

Returns the current `Preference`.

### Processing Rules

- **Text change:** if `originalText` differs, increment `version` and reset `interpretedConditions` and `confirmedConditions` to `null` (old conditions no longer describe the text). Same text returns `200` unchanged.
- **Conditions save:** store `confirmedConditions` for the current `version`; `version` is unchanged.
- Any change makes cached recommendations for this participant stale.
- Preferences do not affect intents or proposals.
- Log `INFO` event `preference_updated` with `extra`: `participant_id`, `version`, `condition_count`, `text_length`. Never log the text.

### Errors

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Participant does not exist, belongs to another event, or is not the caller (existence hidden) |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `CONTENT_VERSION_MISMATCH` | `version` differs from the current version (changed from another tab/device). `details`: `{ "currentVersion": 3 }` |
| 422 | `VALIDATION_ERROR` | Both or neither of `originalText`/`confirmedConditions`; invalid condition enum; too long |

## Open Decisions

- Keeping preference history instead of only the current preference.
