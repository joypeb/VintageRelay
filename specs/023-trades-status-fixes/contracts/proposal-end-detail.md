# Contract: `Proposal.endDetail` (additive)

Applies to every endpoint returning `Proposal` (`GET /events/{event_id}/proposals`, `GET /proposals/{proposal_id}`, consent, reject, cancel, intent accept).

```json
{
  "status": "invalidated",
  "endReason": "intent_changed",
  "endDetail": "intent_declined"
}
```

| `status` / `endReason` | `endDetail` |
|---|---|
| `invalidated` / `intent_changed` | `intent_declined`, `intent_withdrawn`, `intent_invalidated`, or `null` if no ended intent is found |
| anything else | `null` |

- Field is always present (null when not applicable), per `api-contract.md`.
- No request changes, no new error codes. `endReason` values are unchanged.
- Documented in `docs/plans/api/11-proposals.md` `Proposal` schema in the same change.
