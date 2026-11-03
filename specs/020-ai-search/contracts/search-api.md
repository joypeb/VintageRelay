# Contract: 019 AI Search Endpoints

Sources of truth: [API contract](../../../docs/rules/dev/common/api-contract.md), [AI features §4](../../../docs/plans/ai-features-v1.md#4-search-interpretation), [API 15](../../../docs/plans/api/15-search.md). Only deviations and resolved details are listed here.

## `POST /api/v1/events/{event_id}/search/interpretation`

- Auth: participant bearer token of the same event (401 `UNAUTHENTICATED`, 404 `NOT_FOUND`).
- Body: `{ "text": string }`, 1–200 chars after trimming → else 422 `VALIDATION_ERROR` (`field: "text"`), AI not called.
- 200: `SearchConditions` ([data model](../data-model.md#searchconditions-api-shared-by-both-endpoints)).
- 503 `AI_UNAVAILABLE`, message "Search could not understand that right now. Choose filters instead." after one retry. (A missing key fails production startup per AI features §7; the 503 path for an unconfigured analyzer exists only in the injected test app.)
- Allowed when the event is closed. Nothing stored.

## `GET /api/v1/events/{event_id}/clothing/search`

- Auth: as above.
- Query: `category`, repeatable `color`, `<name>Min` / `<name>Max` for `totalLength`, `chest`, `shoulder`, `sleeve`, `waist`, `hem`, `inseam`, `thigh`. Unknown keys ignored. A repeated color counts once.
- 422 `VALIDATION_ERROR`: unknown category or color; non-numeric value or outside `(0, 120]`; `min > max` (`field` = the parameter name).
- 200:

```json
{
  "items": [
    { "clothing": { "...": "same Clothing object as GET /events/{id}/clothing" }, "matchCount": 2, "missingMeasurements": false }
  ],
  "conditionCount": 2,
  "nextCursor": null
}
```

- **Deviation from API 15**: `items[].clothing` is the existing `Clothing` object (with `photos`), not `ClothingSummary`; API 15 is updated in the same PR.
- Allowed when the event is closed.
