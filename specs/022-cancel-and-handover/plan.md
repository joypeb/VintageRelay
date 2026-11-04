# Implementation Plan: 021 Cancel and Confirmed Handover View

**Branch**: `feature/021-cancel-and-handover` | **Date**: 2026-11-04 | **Spec**: specs/022-cancel-and-handover/spec.md

**Input**: specs/022-cancel-and-handover/spec.md + docs/plans/features/021-cancel-and-handover.md Specify input

## Summary

Add `POST /api/v1/proposals/{proposal_id}/cancel` that, in one `Db.write()` transaction, cancels a confirmed proposal for all parties, frees its garments, and reuses the existing clothing-scoped cycle recalculation (which already suppresses `cancelled` cycles). Frontend: `ProposalDetail` renders a confirmed/cancelled view (T3) with give/receive pairs, garment links, the handover notice, and a confirmed [Cancel exchange] dialog; C4 "Related exchanges" rows become links to T2/T3 with cancel guidance on confirmed items. T1 already groups confirmed/history (020) — only verify cancelled entries render.

## Technical Context

**Language/Version**: Backend Python >=3.14 (FastAPI, SQLAlchemy 2.1, Pydantic, pytest, ruff, mypy strict); Frontend TypeScript, Next 16, React 19, TanStack Query v5, Astryx, vitest.

**Primary Dependencies**: Existing only. `Db.write()` (`BEGIN IMMEDIATE`) serializes with close and final consent; `_recalculate_cycles_for_clothing` in `backend/app/services/clothing.py`; `apiFetch` + `query-keys.ts` + `useProposalQuery` in `frontend/src/lib/api/proposals.ts`.

**Storage**: SQLite. No migration: `trade_proposals.status/end_reason/cancelled_at/ended_at` and `trade_participants.is_confirmed` exist from 020; `cancelled` and `participant_cancelled` are already valid values.

**Testing**: Backend pytest API tests (fresh SQLite per test, reuse 020 proposal fixtures/helpers); Frontend vitest for the pure handover-row helper, the cancel API client, and ProposalDetail cancel behavior (dialog, navigation, errors); layout verified manually at 360–430px.

**Target Platform**: Mobile web prototype.

**Performance Goals**: Event-scale; T3 polls every 10s while confirmed and the event is active (FR-017), 5s while pending (020); cancelled/closed views do not poll.

**Constraints**: Same-transaction cancel + garment release + recalculation; idempotent replay (including after closure); 404-hiding for non-parties; `EVENT_CLOSED` message "This event is closed, so exchanges can no longer be cancelled."; `PROPOSAL_NOT_CONFIRMED` for pending/rejected/invalidated.

**Scale/Scope**: One endpoint, one service function, one error class, T3 view, C4 links. No handover records, no cancel reason.

## Constitution Check

- I Exchange Integrity: cancel enforced server-side in one serialized transaction; garments return via conditional update; suppression reuses 020 rule — PASS.
- II Test-First: each backend task has a preceding failing API test; FE helper tests precede helper code — PASS.
- III Risk-scoped tests: common/testing §1 "reusable garments after cancellation" and "rejection after closure" covered — PASS.
- IV Isolated/deterministic: no external services — PASS.
- V Simplicity: reuse existing recalculation, error infra, proposal reads, T1 grouping; no new read endpoint or migration — PASS.

## Project Structure

```text
specs/022-cancel-and-handover/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/cancel-proposal.md
└── tasks.md

backend/
├── app/domain/errors.py                 # + ProposalNotConfirmedError
├── app/services/proposal.py             # + cancel()
├── app/services/clothing.py             # reuse _recalculate_cycles_for_clothing (no change expected)
├── app/api/routers/proposals.py         # + POST /proposals/{id}/cancel
└── tests/api/test_proposals_cancel.py   # new

frontend/src/
├── lib/api/proposals.ts                 # + cancelProposal, useCancelProposalMutation
├── lib/trades.ts                        # + pure handover pair helper (tested)
├── components/trade/ProposalDetail.tsx  # confirmed/cancelled T3 branch + cancel dialog
└── components/clothing/MyItemDetailScreen.tsx  # Related exchanges → links, cancel guidance
```

**Structure Decision**: Existing layouts; no new top-level modules or routes (`trades/[tradeId]` already renders `ProposalDetail`).

## Complexity Tracking

None.
