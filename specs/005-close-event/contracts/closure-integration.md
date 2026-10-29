# Closure Integration Obligations

This design companion separates the current endpoint contract from later integration work. It does not claim any missing endpoint exists or approve proposed policies. Sources: [Close Event](../../../docs/plans/api/03-close-event.md), [shared contract](../../../docs/rules/dev/common/api-contract.md), and [check order](../../../docs/plans/api/README.md#check-order).

## Current increment

- Close event: implemented from this plan (see [validation evidence](../quickstart.md#implementation-evidence)); authenticated organizer only; repeat close succeeds with the current event and original closure time.
- Read event: existing operation remains available for same-event participants after closure, with existing role-sensitive summary visibility.
- Event creation: remains independent of closing an existing event.
- No proposal changes are possible with the current two-table schema. Log the invalidated count as zero.

## Required when each operation is implemented

Authorization and resource visibility checks always precede successful-replay checks. Qualifying replay precedes event-state checks. State checks and dependent writes share the serialized write transaction; a preflight read alone is insufficient.

| Future operation | New action after closure | Replay / read exception | Verification dependency |
|---|---|---|---|
| Join | 409 `EVENT_CLOSED` | No new membership from entry code | Join implementation |
| Upload/register/edit/withdraw clothing | 409 `EVENT_CLOSED` | Already withdrawn garment retains its normal 204 replay | Clothing/photo implementation |
| Preference changes and AI analysis/interpretation | 409 `EVENT_CLOSED` | Do not persist an AI result after closure while external work was running | Preferences/AI implementation |
| Register/withdraw intent | 409 `EVENT_CLOSED` for new changes | Qualifying existing-intent or withdrawal replay follows the shared contract | Intent implementation |
| Accept alternative | 409 `EVENT_CLOSED` for a new acceptance | Already accepted intent plus a proposal for the suggested cycle can qualify as replay | Alternative/proposal implementation |
| Decline local-only alternative | No stored changes; 204 | Remains available under existing authorization rules | Alternative implementation |
| Consent/reject/cancel | 409 `EVENT_CLOSED` for a new change | Only qualifying target-state replay succeeds; consent requires recorded same-version consent on a still pending/confirmed proposal | Real proposal/consent/cancellation implementation |
| AI recommendations | 409 `EVENT_CLOSED` even though it is a read | No recommendation exception for general readable records | AI recommendation implementation |
| Other record reads | Subject to proposed post-closure read policy and existing visibility | Retention duration remains undecided | Policy approval plus relevant resource endpoints |

For AI calls that began before closure, recheck event state before saving results. Do not hold a write transaction during external model calls. Add appropriate race tests in that feature; this closure endpoint has no AI call to simulate.

## Final-consent concurrency gate

Before the consent feature is considered integrated, test both orderings with its real transaction and closure sharing the same SQLite file:

1. Closure commits first: a new final consent returns `EVENT_CLOSED`, with no consent/garment/confirmation side effects.
2. A valid final consent commits first: it confirms once; closure then sees the confirmed state. Preservation follows the approved policy, without treating confirmation as handover.
3. Consent replay still requires the same version and a pending/confirmed proposal. If approved closure policy invalidates it, old recorded consent does not qualify.

A synthetic write-lock probe or overlapping close requests cannot substitute for these consent tests.

## Policy approval gate

Before implementing FR-010/FR-011, record explicit approval and update the relevant source/spec. Then implement pending invalidation and confirmed-record handling in the same closure transaction and add rollback, terminal-history, other-event isolation, visibility, and consent-replay tests. Re-evaluate whether migrations, garment counts, proposal counts, or confirmation association constraints are needed in that feature. Do not leave those requirements marked complete in the current increment.

## Verified current integration

The real create → close → replay → read path is covered by `backend/tests/api/test_close_event_integration.py` using the actual routes/services and isolated SQLite fixtures. The organizer sees the current summary; a regular participant sees `stats=null` and cannot close even after closure. The original closure time and participant records are unchanged by replay, and another event stays active and unchanged. No new application fix was needed for this integration regression.

This evidence covers only currently implemented event operations. FR-007 and SC-005 still need real final-consent ordering tests. FR-008, the remaining FR-009/SC-006 cases, and conditional FR-010/FR-011/SC-007 remain dependent on the real exchange/AI features and, where proposed, explicit policy approval. No consent replay, garment preservation, pending-proposal invalidation, handover, or retention policy is claimed as implemented by this test.
