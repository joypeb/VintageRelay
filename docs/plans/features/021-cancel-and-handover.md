# 021 — Cancel and Confirmed Handover View

**Area:** Backend + Frontend · **Depends on:** [020](020-exchange-requests.md) · Common steps: [README](README.md#3-spec-kit-run-same-for-every-feature)

## 1. Feature

After confirmation, participants meet on site. The confirmed view (T3) shows who gives which garment to whom and reminds that confirmation is not a completed handover. Before the event closes, any party can cancel the whole confirmed exchange; its garments become available again and new proposals can form.

## 2. Scope

**Backend**
- `POST /api/v1/proposals/{proposal_id}/cancel` per [API 13](../api/13-cancel-exchange.md): parties only, confirmed proposals only, entire exchange cancelled (`cancelled`, `participant_cancelled`, `cancelledAt`, `endedAt`), garments back to `available`, proposals recalculated in the same transaction, idempotent replay, `EVENT_CLOSED` after closure.
- No new read endpoint: [API 14](../api/14-confirmed-exchanges.md) reuses the proposal reads from 020.

**Frontend**
- T3 `trades/[tradeId]` for confirmed proposals: give/receive pairs, meeting partner names, link to each garment's detail for inspection (all photos, measurements), the "confirmation is not handover" note, [Cancel exchange] with confirmation while the event is active.
- T1 Exchanges: confirmed and history entries; C4 confirmed items link to T3 and stay locked.
- Closed event: T3 read-only.

**Out:** handover completion records, cancellation after partial handover (open decisions).

## 3. References

| Document | Sections |
|---|---|
| [AGENTS.md](../../../AGENTS.md) | Core Exchange Rules (cancel before close, confirmation vs. handover) |
| [API 13 Cancel](../api/13-cancel-exchange.md) | All |
| [API 14 Confirmed exchanges](../api/14-confirmed-exchanges.md) | All |
| [API 11 Proposals](../api/11-proposals.md) | Schema (`canCancel`), generation after cancellation, suppression |
| [API README](../api/README.md) | Proposal state transitions (cancelled row) |
| [API contract](../../rules/dev/common/api-contract.md) | 5-1 Cancel confirmed exchange; `PROPOSAL_NOT_CONFIRMED`, `EVENT_CLOSED` |
| [Database design](../database-design-v1.md) | 7 Cancellation, Closure, Physical handover |
| [Screen flow](../../flows/screen-flow-v1.md) | 4.4 T1, T3; 5 Core flow 5; 6 Global states |
| [Common testing](../../rules/dev/common/testing.md) | 1 Reusable garments after cancellation; rejection after closure |
| Backend and frontend rules as in [020](020-exchange-requests.md#3-references) | Transactions, polling (no polling for confirmed/history), error mapping |

## 4. Existing Code

- 020: proposal models, `matching.py`, proposal services and reads, T1/T2 screens, C4 related exchanges.
- `backend/app/services/event.py` close logic (confirmed proposals stay readable).

## 5. Already Decided

- Cancelling cancels the entire exchange for everyone; garments not yet handed over become available.
- Cancelled cycles are suppressed until an intent or garment changes (API 11 rule 5).
- Confirmed records stay viewable after closure (proposed in the initial plan).

## 6. Open Questions for Clarify

- Should T3 offer a [Handover complete] record? (Open decision; default: no.)
- Wording of the cancel confirmation and whether other parties get a visible notice (no push; badge only).

## 7. Spec Kit Run

**Specify input**

```text
021 Cancel and confirmed handover view (backend + frontend).
Backend: POST /api/v1/proposals/{proposal_id}/cancel per docs/plans/api/13-cancel-exchange.md: only parties, only confirmed proposals, cancels the entire exchange, makes its garments available again, recalculates proposals in the same transaction, idempotent replay, EVENT_CLOSED after closure.
Frontend: confirmed view (T3) showing who gives and receives each garment, links to garment details for inspection, the note that confirmation is not handover, and Cancel exchange with confirmation while the event is active; confirmed and history entries in Trades; confirmed items on My item detail link to T3.
Sources: docs/plans/features/021-cancel-and-handover.md, AGENTS.md (Core Exchange Rules), docs/plans/api/13-cancel-exchange.md, 14-confirmed-exchanges.md, 11-proposals.md, docs/rules/dev/common/api-contract.md (5-1), docs/plans/database-design-v1.md (7), docs/flows/screen-flow-v1.md (4.4, 5, 6).
```

**Plan research (explorer):** confirmation code from 020 to mirror for cancellation (status updates, recalculation hook); how T2/T3 branch on proposal status.

## 8. Done When

- A party cancels a confirmed exchange; all garments return to available, and a new request can form a new proposal.
- Cancelling twice returns the cancelled proposal; cancelling after closure fails with `EVENT_CLOSED`.
- T3 is read-only after closure.
- Backend and frontend checks pass; an end-to-end phone run: create → join → register → search → request → accept → consent → cancel → close.
