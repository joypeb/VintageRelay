# Contract: PATCH /api/v1/clothing/{clothing_id}

Per docs/plans/api/07-edit-withdraw-clothing.md §1 (authoritative; this file is an index, not a restatement).

- Error envelope per api-contract 110-127 with `code`-only branching; `details.fields` for 422 (`measurements.<name>`); `X-Request-ID` echo; camelCase keys; 200 returns `Clothing` (06 schema).
- Auth: validation-first 422, then owner bearer; same-event non-owner 403, cross-event 404, bad token 401.
- 017 defers steps 5-7 (analysis + invalidation); counts logged as 0; amended in API 07 in same PR.
