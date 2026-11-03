# Implementation Plan: 020 Exchange Requests and Proposals

**Branch**: `feature/020-exchange-requests` | **Date**: 2026-11-03 | **Spec**: specs/021-exchange-requests/spec.md

**Input**: specs/021-exchange-requests/spec.md + docs/plans/features/020-exchange-requests.md Specify input

## Summary

Exchange intents (requests) + versioned 2-/3-person proposals with unanimous same-version consent and exclusive per-garment confirmation. Backend: `exchange_intents`, `trade_proposals`, `trade_participants` + pure `domain/matching.py` cycle detection + idempotent intent/proposal/consent endpoints + edit/withdraw/close retrofits. Frontend: I1 offer sheet, T1 Received/Sent/Exchanges, T2 consent/reject + proposal-changed modal, C4 requests, C2 edit warning, badge + polling. Decisions: pending-only invalidation on confirm-elsewhere; Exchanges newest-first.

## Technical Context

**Language/Version**: Backend Python >=3.14 (FastAPI, SQLAlchemy 2.1, Pydantic, pytest, ruff, mypy strict); Frontend TypeScript ~6, Next 16.4.3, React 19, TanStack Query v5, Astryx 0.7.4, vitest.

**Primary Dependencies**: FastAPI + SQLAlchemy (SQLite WAL, `Db.write()` `BEGIN IMMEDIATE`); Next + `@astryxdesign/core`; `apiFetch(eventId, path)` + `query-keys.ts` factories.

**Storage**: SQLite (`exchange_intents`, `trade_proposals`, `trade_participants`; partial unique indexes pending cycleKey + confirmed offered clothing) via migrations; no new external services.

**Testing**: Backend `uv run pytest` (fresh SQLite per test, AI faked/none); Frontend `vitest run`; manual 360–430px screenshots.

**Target Platform**: Mobile web prototype (backend API + Next frontend).

**Performance Goals**: Event-scale lists unpaginated (`{items, nextCursor:null}`); polling T2 5s / T1-C4-badge 15s / event 30s, no background polling.

**Constraints**: Same-transaction generation/invalidation; serialized confirm vs close; idempotent replays incl. after closure; 404-hiding for private intents/proposals; consent exact-version; never reuse old consent.

**Scale/Scope**: 2-/3-person cycles only; cancellation/handover is 021; alternatives deferred.

## Constitution Check

- I Exchange Integrity: pure matching + server/DB enforcement (conditional updates, partial uniques, same-transaction recalc), AI never touches intents/consent — PASS.
- II Test-First: test tasks precede each implementation task; bug fixes start with reproducing test — PASS.
- III Risk-scoped tests (common/testing §1: cycles ±, accept/decline visibility, double-confirm incl. concurrent, old-version reject, closure, permissions) — PASS.
- IV Isolated/deterministic (fresh SQLite, no external AI, xfail with reason, never delete failing tests) — PASS.
- V Simplicity: smallest complete 020; defers 021 + open decisions — PASS. No violations to justify.

## Project Structure

```text
specs/021-exchange-requests/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md   # next command

backend/
├── app/
│   ├── domain/matching.py        # pure cycles, cycleKey, suppression
│   ├── models/ (intent, proposal, participant)
│   ├── schemas/ (intent, proposal)
│   ├── repositories/ + services/ (intent, proposal/consent)
│   └── api/routers/ (intents, proposals)
└── tests/ (unit/matching + api)

frontend/
├── src/
│   ├── lib/api/ (intents.ts, proposals.ts, query-keys)
│   ├── types/ (intent.ts, proposal.ts)
│   ├── components/ (trade/*, clothing I1/C4/C2 pieces)
│   └── app/events/[eventId]/(tabs)/trades/ + clothing detail routes
└── (vitest colocated)
```

**Structure Decision**: Existing backend `app/` + `tests/` and frontend `src/` layouts; no new top-level projects.

## Complexity Tracking

None — no constitution violations.
