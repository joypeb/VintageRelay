# Implementation Plan: Trades Status Fixes After Exchange QA

**Branch**: `royal-seal` | **Date**: 2026-11-04 | **Spec**: specs/023-trades-status-fixes/spec.md

**Input**: specs/023-trades-status-fixes/spec.md

## Summary

Mostly frontend presentation fixes in Trades plus one additive backend response field. Backend: derive `Proposal.endDetail` (`intent_declined` / `intent_withdrawn` / `intent_invalidated` / null) at read time for `invalidated` + `intent_changed` proposals so "Declined" can be shown even for third-party legs of 3-person cycles. Frontend: gate Accept/Decline/Withdraw on accepted state and live garment status, poll every 4 s, add a "Requests" group and a "Waiting for others" group (any cycle size) to Exchanges, and replace raw status/end-reason/response strings with plain labels in Trades and proposal detail. Requests staying `active` after confirmation is kept as decided (research R1). Exception paths are verified by a QA agent against the running stack and the SQLite DB in Docker.

## Technical Context

**Language/Version**: Backend Python >=3.14 (FastAPI, SQLAlchemy 2.1, Pydantic, pytest, ruff, mypy strict); Frontend TypeScript, Next 16, React 19, TanStack Query v5, Astryx, vitest.

**Primary Dependencies**: Existing only. `build_proposal` in `backend/app/services/proposal.py`; leg→intent matching as in `_intent_id_for_leg` (`proposal.py:422-431`); `useIntentsQuery`/`useProposalsQuery`; pure helpers in `frontend/src/lib/trades.ts`.

**Storage**: SQLite; no migration.

**Testing**: Backend pytest API tests for `endDetail` (decline, withdraw, garment withdraw, other end reasons → null, 3-person third-party leg). Frontend vitest for pure helpers (grouping, request-stage items, actionability, labels) and a component test for Received/Sent rows hiding actions. Screens verified manually at 360–430 px and by QA.

**Target Platform**: Mobile web prototype.

**Performance Goals**: Trades lists refresh every 5 s while visible and the event is active (FR-004).

**Constraints**: Additive response field documented in `docs/plans/api/11-proposals.md` (api-contract rule 10). No intent state changes without participant action. No raw internal names in UI.

**Scale/Scope**: 1 backend field; ~4 frontend files (`lib/trades.ts`, `lib/api/intents.ts`, `lib/api/proposals.ts`, `components/trade/TradesOnboardScreen.tsx`, `components/trade/ProposalDetail.tsx`, `types/proposal.ts`).

## Constitution Check

- I Exchange Integrity: no change to enforcement; server already blocks reprocessing (R1); concurrency verified by QA — PASS.
- II Test-First: backend field and FE helpers each get a failing test first; existing `trades.test.ts` bug assertion is updated in the Red step — PASS.
- III Risk-scoped tests: pure logic + API tests; screens manual/QA — PASS.
- IV Isolated/deterministic: no external services in tests — PASS.
- V Simplicity: polling instead of push, read-time derivation instead of migration, no new endpoints — PASS.

Post-design re-check: PASS (no new violations).

## Project Structure

```text
specs/023-trades-status-fixes/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/proposal-end-detail.md
└── tasks.md

backend/
├── app/schemas/proposal.py              # + end_detail
├── app/services/proposal.py             # derive end_detail in build_proposal
└── tests/api/test_proposals_end_detail.py  # new

docs/plans/api/11-proposals.md           # document endDetail

frontend/src/
├── types/proposal.ts                    # + endDetail
├── lib/trades.ts                        # grouping, request-stage items, actionability, labels
├── lib/trades.test.ts                   # updated + new cases
├── lib/api/intents.ts, lib/api/proposals.ts  # 5 s polling
├── components/trade/TradesOnboardScreen.tsx  # gated actions, new groups, labels
└── components/trade/ProposalDetail.tsx       # plain labels
```

**Structure Decision**: Existing layouts; no new routes or modules.

## Complexity Tracking

None.
