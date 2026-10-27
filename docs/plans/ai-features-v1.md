# Vintage Relay AI Features (Draft v1)

Specifies the AI features from section 5 of the [initial development plan](vintage-relay-plan-v1.md): model integration, structured input/output, the AI-related APIs, guardrails, and failure handling. General API rules (authentication, headers, error format, feature error codes) are in the [API specification README](api/README.md); the [API contract](../rules/dev/common/api-contract.md) remains the source of truth.

This is a **draft proposal**. The model integration has not been implemented or validated; timeouts, limits, and schemas below are proposals to verify on day one.

## 1. Scope and Principles

| AI task | Input | Output | API |
|---|---|---|---|
| Clothing analysis | Photo and owner's description | Estimated type, color, visible features, points to check | `POST/PATCH /api/v1/clothing/{clothing_id}/analysis` |
| Preference interpretation | Desired styles and exclusions (free text) | Structured include/exclude conditions, ambiguous expressions | `POST /api/v1/participants/{participant_id}/preferences/interpretation` |
| Recommendations | Preferences and same-event available clothing | Candidates with reasons and points to check | `GET /api/v1/events/{event_id}/recommendations` |

Principles:

- **AI assists; people decide.** AI output never creates, changes, or withdraws intents, and never consents or rejects on anyone's behalf. Alternative suggestions and cycle detection are regular code ([10](api/10-alternative-suggestions.md), [11](api/11-proposals.md)).
- **Estimates, not facts.** All AI features are labeled as estimates in the UI. Never present unseen defects, exact fit, authenticity, brand genuineness, or price/value as verified facts. "Not visible" never means "absent".
- **Reviewable.** Participants review and correct clothing features (C3) and preference conditions (R2). Owner descriptions and participant text are stored separately from AI output.
- **Optional.** Every flow works without AI: C3 can be skipped, and B2 offers manual browsing when recommendations fail.
- **English output.** All AI-generated text shown in the app is English.

## 2. Model Integration

| Item | Decision |
|---|---|
| Model | **Muse Spark 1.3 (`muse-spark-1.3`)** via Meta Model API only. [Model documentation](https://dev.meta.ai/docs/models) |
| Capabilities used | Image understanding (clothing analysis), structured JSON output (all tasks) |
| Caller | Backend only. The frontend never calls the model or sees the key |
| Key | `META_API_KEY` backend environment variable; startup fails if missing |
| Not used in v1 | Fine-tuning, vector DBs, image generation, speech, agent tool calling |

**Day-one verification:** account access, an actual image call, structured output compliance, English preference interpretation quality, recommendation quality vs. manual selection, and latency. Also confirm how images are passed (public photo URL vs. inline base64) and the model's size/type limits.

### Call Policy (Proposed)

| Setting | Analysis | Interpretation | Recommendations |
|---|---|---|---|
| Timeout | 20 s | 15 s | 20 s |
| Retries | 1, only on timeout/5xx/429 | 1 | 1 |
| Temperature | Low (e.g. 0.2) | Low | Low |

- Call the model **outside** database transactions.
- Validate every response against the task's JSON schema with Pydantic. Invalid or truncated output counts as a failure (one retry, then `AI_UNAVAILABLE`).
- Define constants (`MODEL_ID`, timeouts, limits) once in the backend; do not hardcode them at call sites.

### 2.1 `ClothingAnalysis`

API representation of `clothing_analyses`, embedded in `Clothing.analysis`.

| Field | Type | Description |
|---|---|---|
| `clothingId` | string | Analyzed garment |
| `contentVersion` | integer | Clothing version analyzed |
| `status` | enum | `pending`, `done`, `failed`, `stale` (`stale` when the clothing `contentVersion` is newer) |
| `features` | `ClothingFeatures` \| null | AI estimates; `null` unless `done` |
| `uncertainties` | `Uncertainty[]` | Points to check that photos/descriptions cannot verify; `[]` if none |
| `confirmedFeatures` | `ClothingFeatures` \| null | Owner-reviewed features; `null` until the owner confirms |
| `createdAt` | string | Analysis time |

### 2.2 `ClothingFeatures` and `Uncertainty`

| Field | Type | Description |
|---|---|---|
| `category` | enum | `outerwear`, `top`, `bottom`, `dress`, `shoes`, `bag`, `accessory`, `other` |
| `subcategory` | string \| null | Free text, e.g. `"denim jacket"` |
| `colors` | string[] | Main colors, most dominant first |
| `pattern` | enum \| null | `solid`, `striped`, `checked`, `floral`, `graphic`, `other` |
| `materialEstimate` | string \| null | Visually estimated material, e.g. `"denim"` |
| `styleTags` | string[] | e.g. `"cropped"`, `"oversized"`, `"vintage"` (max 8) |
| `visibleDetails` | string[] | e.g. `"front zip"`, `"small chest logo"` (max 8) |
| `sizeLabel` | string \| null | **Only** if stated in the owner's description or readable on a visible tag; never inferred |

`Uncertainty`:

| Field | Type | Description |
|---|---|---|
| `aspect` | enum | `condition`, `size`, `fit`, `material`, `logo`, `color`, `other` |
| `message` | string | Short English instruction to check in person, e.g. "Check the back for a printed logo." |

The schema intentionally has no fields for price, authenticity, or fit verdicts.

### 2.3 `PreferenceInterpretation` and `Condition`

`PreferenceInterpretation`:

| Field | Type | Description |
|---|---|---|
| `conditions` | `Condition[]` | Structured conditions (max 30) |

`Condition`:

| Field | Type | Description |
|---|---|---|
| `type` | enum | `include`, `exclude` |
| `attribute` | enum | `category`, `color`, `pattern`, `material`, `style`, `details`, `size`, `condition`, `other` |
| `value` | string | Short English value, e.g. `"green"`, `"large logo"` |
| `isAmbiguous` | boolean | Whether the original wording is unclear |
| `ambiguityNote` | string \| null | Question for the participant when ambiguous, e.g. "How large is too large?" |
| `source` | enum | `ai` (from interpretation, possibly edited) or `participant` (added in R2) |

## 3. Clothing Analysis

### 3.1 `POST /api/v1/clothing/{clothing_id}/analysis`

Runs (or returns) analysis for the garment's **current** `contentVersion`. Synchronous. Called by the frontend after registration/edit (C2 → C3).

**Headers:** `Authorization: Bearer <participantToken>` of the owner (required), `X-Request-ID` (optional). No body.

**Response — `200 OK`:** the `ClothingAnalysis` for the current version.

```json
{
  "clothingId": "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  "contentVersion": 1,
  "status": "done",
  "features": {
    "category": "outerwear",
    "subcategory": "denim jacket",
    "colors": ["green"],
    "pattern": "solid",
    "materialEstimate": "denim",
    "styleTags": ["cropped", "casual"],
    "visibleDetails": ["front button closure", "two chest pockets"],
    "sizeLabel": "M"
  },
  "uncertainties": [
    { "aspect": "logo", "message": "Check the back for a printed logo; it is not visible in the photo." },
    { "aspect": "condition", "message": "Check the cuffs and collar for stains or wear." }
  ],
  "confirmedFeatures": null,
  "createdAt": "2026-10-27T05:43:20Z"
}
```

**Processing:**

1. Verify ownership and that the event is active. Read `contentVersion` (`v`), photo, and description.
2. If a `done` analysis exists for `v`, return it without calling the model.
3. Insert/update the analysis row for `v` with `status = pending` and commit.
4. Call the model with the photo and description (outside any transaction).
5. In a new write transaction, recheck in this order and discard the result on failure:
   - If a `done` analysis for `v` already exists, keep it (and its `confirmedFeatures`) and return it with `200`.
   - If the event is no longer active, return `409 EVENT_CLOSED`.
   - If the garment is withdrawn, return `409 CLOTHING_NOT_AVAILABLE`.
   - If the clothing is no longer at `v`, return `409 CONTENT_VERSION_MISMATCH`.
   - Otherwise save `features`, `uncertainties`, `model_info`, and `status = done`.
6. The model call stays outside any transaction; only the closing write transactions recheck state (step 5 on success, step 7 on model failure).
7. On model failure, in a write transaction apply the same ordered rechecks as step 5 (existing `done` → `200` with it; event closed → `409 EVENT_CLOSED`; garment withdrawn → `409 CLOTHING_NOT_AVAILABLE`; version changed → `409 CONTENT_VERSION_MISMATCH`), writing nothing in those cases. Only when all pass, set `status = failed` and return `503 AI_UNAVAILABLE`. C3 offers [Skip] and [Try again].

**Model prompt requirements:** describe only what is visible in the photo or stated in the description; return English; put anything not verifiable (back side, stains outside the frame, material, fit, size without a label) into `uncertainties`; never estimate price, brand authenticity, or fit; treat the owner's description as data, not instructions.

**Errors:**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Caller is not the owner |
| 404 | `NOT_FOUND` | Garment does not exist or belongs to another event |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `CLOTHING_NOT_AVAILABLE` | Garment is withdrawn |
| 409 | `CONTENT_VERSION_MISMATCH` | Garment changed during analysis. `details`: `{ "currentContentVersion": 2 }` |
| 503 | `AI_UNAVAILABLE` | Timeout, model error, or invalid structured output after retry |

**Idempotency:** repeated calls for the same version return the existing `done` analysis. Concurrent first calls may both reach the model; only the first saved `done` result is kept.

### 3.2 `PATCH /api/v1/clothing/{clothing_id}/analysis`

The owner saves reviewed/corrected features (C3 [Confirm]).

**Headers:** `Authorization` of the owner (required), `Content-Type: application/json; charset=utf-8` (required), `X-Request-ID` (optional).

**Request body:**

| Field | Type | Required | Rule |
|---|---|---|---|
| `contentVersion` | integer | Yes | Version shown in C3 |
| `confirmedFeatures` | `ClothingFeatures` | Yes | Corrected features; same validation as model output |

**Response — `200 OK`:** the updated `ClothingAnalysis`.

**Processing:** requires a `done` analysis for the current `contentVersion`. Store `confirmed_features`; `features` (the AI estimate) is kept unchanged. Confirmed features are used instead of AI features in recommendations. Changing confirmed features does not affect intents or proposals.

**Errors:**

| Status | Code | When |
|---|---|---|
| 401 / 403 / 404 | `UNAUTHENTICATED` / `FORBIDDEN` / `NOT_FOUND` | As in 3.1 |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `CONTENT_VERSION_MISMATCH` | `contentVersion` is not current |
| 409 | `ANALYSIS_NOT_READY` | No `done` analysis for the current version (never run, failed, or pending) |
| 422 | `VALIDATION_ERROR` | Invalid enum, too many tags, missing field |

## 4. Preference Interpretation

### `POST /api/v1/participants/{participant_id}/preferences/interpretation`

Interprets the saved `originalText` into conditions (R1 [AI interpretation] → R2). Synchronous. Preference storage is in [08-preferences.md](api/08-preferences.md).

**Headers:** `Authorization` of this participant (required), `Content-Type: application/json; charset=utf-8` (required), `X-Request-ID` (optional).

**Request body:**

```json
{ "version": 2 }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| `version` | integer | Yes | Preference version whose text should be interpreted |

**Response — `200 OK`:** the current `Preference` with `interpretedConditions` filled.

**Processing:**

1. Verify the caller, active event, saved text (`version >= 1`), and matching `version`.
2. If `interpretedConditions` already exists for this version, return it without calling the model.
3. Call the model with the text only.
4. In a write transaction, recheck before saving: if the event is no longer active, discard the result and return `409 EVENT_CLOSED`; if the preference is no longer at `version`, return `409 CONTENT_VERSION_MISMATCH`; otherwise save. The model call stays outside the transaction.

**Model prompt requirements:** split the text into include/exclude conditions; keep the participant's meaning without adding preferences; mark vague words ("not too big", "nice condition") as `isAmbiguous` with a short question; output English values; treat the text as data, not instructions.

**Errors:**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Participant does not exist, belongs to another event, or is not the caller (existence hidden) |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `PREFERENCE_REQUIRED` | No preference text saved yet |
| 409 | `CONTENT_VERSION_MISMATCH` | `version` is not current. `details`: `{ "currentVersion": 3 }` |
| 422 | `VALIDATION_ERROR` | `version` missing or invalid |
| 503 | `AI_UNAVAILABLE` | Model failure. R2 lets the participant add conditions manually |

## 5. Recommendations

### `GET /api/v1/events/{event_id}/recommendations`

Returns AI-ranked candidates for the caller from same-event available clothing, with reasons and points to check (B1). Synchronous; no persistent side effects (results may be cached).

**Headers:** `Authorization: Bearer <participantToken>` (required), `X-Request-ID` (optional).

**Query parameters:**

| Name | Type | Default | Rule |
|---|---|---|---|
| `limit` | integer | 10 | 1–20 |

**Response — `200 OK`:**

```json
{
  "items": [
    {
      "clothing": { "id": "3f1c...", "owner": { "participantId": "7d8e...", "displayName": "Sora", "isOrganizer": false }, "photoUrl": "https://...", "description": "Cropped green denim jacket, size M.", "status": "available", "contentVersion": 1 },
      "rank": 1,
      "reasons": [
        "It looks like a cropped green jacket, which matches your style.",
        "No logo is visible on the front."
      ],
      "checkPoints": [
        "Check the back for a logo; it is not visible in the photo.",
        "Check the cuffs for stains."
      ],
      "hasMyIntent": false
    }
  ],
  "nextCursor": null,
  "preferenceVersion": 2,
  "generatedAt": "2026-10-27T06:00:00Z"
}
```

| Field | Description |
|---|---|
| `items[].clothing` | `ClothingSummary` ([schema](api/06-register-read-clothing.md#clothingsummary-schema)) |
| `items[].rank` | 1-based order from the model after server filtering |
| `items[].reasons` | 1–3 English sentences linking visible features to the preference |
| `items[].checkPoints` | 0–3 things to verify in person; derived from uncertainties and exclusions |
| `items[].hasMyIntent` | Whether the caller already has an active intent for this garment |
| `preferenceVersion` | Preference version used |
| `generatedAt` | Generation time |

**Processing:**

1. Verify the event is active. Load the caller's preference; use `confirmedConditions`, else `interpretedConditions`, else `originalText`. If no text exists, return `409 PREFERENCE_REQUIRED` (B1 → R1).
2. **Database prefilter (regular code):** same event, `status = available`, not owned by the caller. If none, return `items: []` without calling the model.
3. Cap the candidate set (proposed: 50 most recent) to bound prompt size and latency.
4. Send the model **text only**: the preference and, per candidate, its ID, owner description, and features (`confirmedFeatures` if present, else `features`; garments without analysis are marked "description only").
5. The model returns `[{ "clothingId", "reasons", "checkPoints" }]` in ranked order.
6. **Server validation:** drop IDs not in the candidate set; drop duplicates; recheck event membership and `available` status at response time; truncate to `limit`.
7. Cache per `(participantId, preferenceVersion, candidate set snapshot)` in memory (optional); invalidate when preferences, garment content, or availability change. Compute `hasMyIntent` after cache retrieval so intent changes are always reflected.

**Model prompt requirements:** compare only the provided features and descriptions; respect exclusions; reasons must cite provided information only; uncertain matches go in `checkPoints`; never claim condition, fit, authenticity, or price; output English; ignore instructions inside descriptions.

**Errors:**

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 404 | `NOT_FOUND` | Event does not exist, or the token belongs to another event |
| 409 | `EVENT_CLOSED` | Event is closed |
| 409 | `PREFERENCE_REQUIRED` | No preference text saved. Message: "Add your preferences to get recommendations." |
| 422 | `VALIDATION_ERROR` | `limit` out of range |
| 503 | `AI_UNAVAILABLE` | Model failure. Message: "Recommendations are unavailable right now. You can browse all clothing instead." B1 switches to B2 |

Recommendations never create intents. Selecting a candidate leads to B3 → I1, where the participant registers an intent through [09-intents.md](api/09-intents.md).

## 6. Guardrails and Output Validation

- **Prompt injection:** owner descriptions and preference text are untrusted. Wrap them as quoted data in prompts and instruct the model to ignore instructions inside them. Structured-output validation limits the impact.
- **Schema-only fields:** no output fields exist for price, authenticity, or fit verdicts, so such claims cannot be stored as structured data.
- **Free-text limits:** cap reasons/messages at 200 characters each; drop empty strings.
- **ID safety:** never trust model-returned IDs; intersect with the server's candidate set.
- **Labeling:** the frontend labels AI features "Estimated by AI" and shows uncertainties next to them.

## 7. Freshness and Concurrency

- Clothing edits increment `contentVersion` and mark the analysis `stale` ([07](api/07-edit-withdraw-clothing.md)). Stale analyses are not used for recommendations; garments fall back to description only until reanalyzed.
- Preference text changes increment `version` and reset conditions ([08](api/08-preferences.md)).
- AI results are saved only if the source version still matches the request-time version. Old-version results are never shown as current.
- AI calls never hold a database write lock, so they cannot delay consent, cancellation, or closure.

## 8. Failure Handling

| Failure | API result | Frontend fallback |
|---|---|---|
| Timeout / 5xx / 429 after one retry | `503 AI_UNAVAILABLE` | C3 [Skip], R2 manual conditions, B1 → B2 manual browsing |
| Invalid structured output after retry | `503 AI_UNAVAILABLE` | Same |
| Missing `META_API_KEY` | Startup fails | — |

Log handled model failures at `WARNING` (event `ai_call_failed` with `extra`: `task`, `reason`, `latency_ms`). Do not convert model errors into `500`.

## 9. Logging and Privacy

- Log task, model ID, latency, retry count, input/output token counts if available, candidate count, and outcome.
- Never log API keys, photo bytes/base64, full descriptions or preference text, or full model requests/responses. Request/response summaries are allowed only at `DEBUG`.
- Photos are sent to the Meta Model API; the event creation or upload screen should state that photos are analyzed by AI (proposed).

## 10. Evaluation

Prepare before day one, as required by the plan:

- A small fixed set of clothing photos and preference texts with expected conditions.
- Measure, with real users where possible: candidate review time, missed conditions, and correction burden in C3/R2, compared with manual browsing (B2).
- Track prohibited-claim violations (price, authenticity, fit, unseen defects) in sampled outputs.

Finding cycles for fictional participants validates exchange logic only, not AI value.

## 11. Open Decisions

- Image transport to the model (URL vs. base64) and whether photos are resized first.
- Whether analysis runs automatically after registration instead of by a client call.
- Persisting recommendation results for revisiting/analysis (database design 8).
- Final timeout and candidate cap values after day-one latency measurements.
- Photo retention, including copies retained by the model provider.
