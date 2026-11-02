# 020 — Exchange Requests and Proposals

**Area:** Backend + Frontend · **Depends on:** [016](016-home-and-item-detail.md), [017](017-my-items-edit-delete.md) · **Next:** [021](021-cancel-and-handover.md) · Common steps: [README](README.md#3-spec-kit-run-same-for-every-feature)

## 1. Feature

The exchange core. A participant requests another garment and offers one of their own (an intent). The wanted garment's owner sees the request and accepts or declines it; accepting creates the two-person proposal with the owner's consent, so the requester only confirms. The server also finds three-person cycles from active requests. A proposal is confirmed when every participant consents to the same version.

This is the largest feature. If the plan exceeds one reviewable PR, split Spec Kit work into a backend spec and a frontend spec that share this document.

## 2. Scope

**Backend**
- Tables `exchange_intents` (with `declined`, `accepted_proposal_id`), `trade_proposals`, `trade_participants`, with migrations and the partial unique indexes from the database design.
- `domain/matching.py`: pure two-/three-person cycle detection, `cycleKey`, suppression rule.
- [API 09](../api/09-intents.md): register, list (`direction=sent|received`), withdraw, **accept**, **decline**; visibility to sender and wanted-garment owner only.
- [API 11](../api/11-proposals.md): proposal generation in the same transaction as triggering changes; list and detail reads.
- [API 12](../api/12-consent-reject-proposal.md): consent and reject with version checks, serialized confirmation, invalidation of other proposals sharing garments, garment status `confirmed`.
- Retrofit earlier features: 07 PATCH steps 6–7 and DELETE steps 6–7 (invalidate requests/proposals), and close event ([API 03](../api/03-close-event.md)) invalidating pending proposals with `event_closed`.

**Frontend**
- B3: enable [Request exchange] → I1 offer sheet (pick an available own garment; no garments → [Register item]); show an existing request with [Withdraw request].
- T1 Trades `trades?tab=received|sent|exchanges`: Received with [Accept]/[Decline]; Sent with states (waiting, accepted → T2, declined) and withdraw; Exchanges (awaiting my consent, 3-person found, confirmed, history).
- T2 `trades/[tradeId]`: cycle view, who gives/receives what, responses, version; [Consent]/[Reject] with confirmation; proposal-changed modal on version conflicts.
- C2 edit: add the warning that edits invalidate unconfirmed proposals.
- C4: "Requests" section with received requests for that item and [Accept]/[Decline]; related exchanges.
- Trades tab badge and polling per data-fetching rules.

**Out:** cancellation and handover view (021), alternative suggestions (deferred), counter-offers.

## 3. References

| Document | Sections |
|---|---|
| [AGENTS.md](../../../AGENTS.md) | Core Exchange Rules |
| [API 09 Exchange requests](../api/09-intents.md) | All, especially accept steps 1–9 and decline |
| [API 11 Proposals](../api/11-proposals.md) | Proposal generation rules 1–6; schema; reads |
| [API 12 Consent/reject](../api/12-consent-reject-proposal.md) | All |
| [API 03 Close event](../api/03-close-event.md), [API 07](../api/07-edit-withdraw-clothing.md) | Retrofit steps listed above |
| [API README](../api/README.md) | 5 Check order; Proposal state transitions; feature error codes |
| [API contract](../../rules/dev/common/api-contract.md) | 5-1 Duplicate state transitions (intent register/accept/decline, consent, reject); 7 error codes; 404 policy for intents and proposals |
| [Database design](../database-design-v1.md) | 3.7 `exchange_intents`, 3.8 `trade_proposals`, 3.9 `trade_participants`; 4 Relationships; 7 Integrity and concurrency |
| [App flow redesign](../../superpowers/specs/2026-11-02-app-flow-redesign-design.md) | 4.2 Exchange requests (option A); 5 Accept/Decline endpoints, requests without own items |
| [Screen flow](../../flows/screen-flow-v1.md) | 4.2 B3, I1; 4.3 C4; 4.4 T1, T2; 5 Core flows 2–4; 6 Global states |
| [Mockup v2](../../flows/mockup-flow-v2.html) | Screens 3, 5, 6 |
| [Common testing](../../rules/dev/common/testing.md) | 1 Required tests (cycles, duplicate confirmation, old versions, closure, permissions, requests) |
| Backend rules: [database.md](../../rules/dev/backend/database.md), [project-structure.md](../../rules/dev/backend/project-structure.md), [api.md](../../rules/dev/backend/api.md), [testing.md](../../rules/dev/backend/testing.md) | Serialized writes, recalculation in the same transaction, `matching.py` as pure functions, concurrency tests |
| Frontend rules: [data-fetching.md](../../rules/dev/frontend/data-fetching.md), [error-handling.md](../../rules/dev/frontend/error-handling.md) | `version` handling, polling intervals, proposal-changed modal, request errors |

## 4. Existing Code

- Backend: `core/db.py` (write transactions), `services/clothing.py` and the 017 edit/withdraw service (retrofit points), `services/event.py` close (retrofit), `domain/enums.py`, `domain/errors.py`, `api/deps.py` (current participant), `api/errors.py`.
- Frontend: B3 from 016, C4 from 017, 015 `trades/page.tsx` placeholder and tab bar, `lib/api/` patterns, `lib/session.ts` (token by event for `/proposals/{id}` paths).

## 5. Already Decided

- Option A: requests are intents visible to the owner; accept = reverse intent + proposal + accepter's consent; decline sets `declined`; 3-person cycles are automatic.
- Accept touches both intents' `updatedAt` to lift suppression for a previously rejected/cancelled pair.
- Consent must match the current proposal version; confirmation is exclusive per garment and serialized.
- Alternative suggestions stay deferred.

## 6. Open Questions for Clarify

- When a garment is confirmed elsewhere, also invalidate its other active requests, or only pending proposals (API 09 open decision)?
- Ordering of proposals in T1 Exchanges (open decision; draft uses newest first).

## 7. Spec Kit Run

**Specify input**

```text
020 Exchange requests and proposals (backend + frontend).
Backend: exchange_intents, trade_proposals, trade_participants tables; pure two-/three-person cycle detection with cycleKey and suppression; exchange request API per docs/plans/api/09-intents.md (register, list sent/received, withdraw, accept creating the reverse intent and the two-person proposal with the accepter's consent, decline), proposal generation and reads per 11, consent/reject with version checks and serialized exclusive confirmation per 12; retrofit clothing edit/withdraw (07) and event close (03) invalidation. Idempotency per api-contract 5-1.
Frontend: enable Request exchange on item detail with the offer sheet (I1) and withdraw; Trades tab with Received (accept/decline), Sent, and Exchanges segments; proposal detail (T2) with consent/reject and proposal-changed handling; received requests on My item detail (C4); Trades badge and polling.
Sources: docs/plans/features/020-exchange-requests.md, AGENTS.md (Core Exchange Rules), docs/plans/api/09-intents.md, 11-proposals.md, 12-consent-reject-proposal.md, 03-close-event.md, 07-edit-withdraw-clothing.md, docs/plans/api/README.md, docs/rules/dev/common/api-contract.md, docs/plans/database-design-v1.md (3.7-3.9, 7), docs/flows/screen-flow-v1.md (4.2-4.4).
```

**Plan research (explorer):** current write-transaction and locking helpers in `core/db.py`; where the 017 edit/withdraw service and `EventService.close` (API 03) commit so invalidation can join the same transaction; how frontend sessions resolve the event for `/proposals/{id}` and `/intents/{id}` paths.

**Implement order:** migrations → `matching.py` (pure tests first) → register/list/withdraw → accept/decline → proposal reads → consent/reject/confirm → retrofits → frontend I1 → T1 → T2 → C4 + C2 edit warning.

## 8. Done When

- Two participants complete request → accept → consent → confirmed; three participants complete an automatic 3-person cycle.
- Required tests from common testing §1 pass, including concurrent confirmation and old-version consent rejection.
- Intents are invisible to everyone except sender and owner (`404`).
- Backend and frontend checks pass; screenshots of I1, T1, T2, C4.
