# Implementation Plan: Close Event (Backend)

**Branch**: `docs/backend-close-event-spec` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-close-event/spec.md`

## Summary

Add the organizer-only, bodyless `POST /api/v1/events/{event_id}/close`. Reuse hashed bearer authentication and `EventRead`. Close an active event and set its UTC closure time in one existing `Db.write()` transaction; authorize before handling replay, retain the original timestamp on retry, and emit one successful closure log after commit.

This increment uses the existing event and participant tables. Proposal/garment/consent features do not exist yet. Their future integration obligations and approval gates are recorded in [closure-integration.md](contracts/closure-integration.md); they are not silently counted as implemented. FR-010 and FR-011 remain proposed. Existing event reads remain available after closure.

## Technical Context

**Language/Version**: Existing Python 3.14 baseline (`backend/pyproject.toml`); no version changes.

**Primary Dependencies**: Existing FastAPI >=0.162, SQLAlchemy >=2.1, Pydantic v2 via existing dependencies, Alembic >=1.20. Reuse the committed lockfile; add no dependencies.

**Storage**: Existing SQLite `events` and `participants`; file-backed, foreign keys enabled, WAL, busy timeout 5000 ms, read `BEGIN` and write `BEGIN IMMEDIATE`. No migration or new table.

**Testing**: pytest, FastAPI TestClient, real SQLite file per test under `tmp_path`, injected clock, `monkeypatch`, `caplog`, and independent sessions for concurrent closure.

**Target Platform**: Existing single-server backend/Docker Compose deployment with persistent SQLite storage and one Uvicorn worker.

**Project Type**: Web service; backend-only increment.

**Performance Goals**: No new latency target is introduced. Keep closure short with no external I/O while holding the write lock. Verify two overlapping close requests succeed within finite test timeouts under normal local conditions; the 5-second SQLite lock wait is a contention limit, not a response-time promise.

**Constraints**: 401 → 404 → 403 → authorized replay → mutation. No UUID path validation, request body, token exposure, or 409 on repeated close. One transaction owns all current closure effects, summary reads, and response construction. Log after successful commit. Preserve existing create/read behavior and validation schemas.

**Scale/Scope**: One endpoint; existing two tables; zero new migrations, dependencies, frontend changes, or proposal subsystems. Event size limits remain undecided.

## Constitution Check

*GATE: Checked before research and re-evaluated after Phase 1 design.*

| Principle | Pre-research assessment | Post-design assessment |
|---|---|---|
| I. Exchange Integrity First | PASS: Organizer authority and closure are server responsibilities. | PASS: Authorization and replay checks share the write transaction; future real consent must use the same serialization boundary. Its integration is explicitly pending. |
| II. Test-First | PASS: No application code is written during planning. | PASS: Every behavior cycle below starts with test-author Red, followed by implementer-be Green/Refactor and reviewer. |
| III. Test Scope by Risk | PASS: Authorization, rollback, replay, and concurrency are the primary risks. | PASS: API and real-SQLite service tests cover present behavior; missing operations are explicitly tracked, without a numeric coverage target. |
| IV. Isolated, Deterministic Tests | PASS: Existing fixtures provide file-backed isolated SQLite. | PASS: Fixed clock and bounded synchronization avoid external services and sleeps. |
| V. Simplicity | PASS: Extend the existing layers and storage. | PASS: No speculative proposal tables, audit storage, unused closed-action helpers, or resolution of retention/handover policies. |

**Governance outcome**: PASS for the settled closure increment. Conditional proposal invalidation/preservation cannot enter implementation until approved and supported by actual proposal features. No unresolved technical choice prevents the present increment; this is not approval of deferred product policies.

## Project Structure

### Documentation (this feature)

```text
specs/005-close-event/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── close-event.openapi.yaml
│   └── closure-integration.md
├── checklists/requirements.md
└── tasks.md                         # Task list for this feature
```

### Source Code (repository root)

Planned changes only; no application files have been modified during planning.

```text
backend/
├── app/
│   ├── api/
│   │   ├── deps.py                  # Add Organizer/require_organizer via service authorization
│   │   ├── errors.py                # Add missing 403 response description
│   │   └── routers/events.py        # Add synchronous bodyless close route
│   ├── domain/errors.py             # Add ForbiddenError
│   ├── main.py                      # Extend narrowly scoped automatic-422 cleanup
│   ├── repositories/event.py        # Conditional active-to-closed update; no commit
│   └── services/event.py            # Authorization, close, shared in-session stats helper
└── tests/
    ├── api/
    │   ├── test_close_event.py       # New success/replay/error contract tests
    │   └── test_openapi_contract.py  # Extend schema/security regression tests
    └── services/
        ├── test_close_event.py      # New direct-service, clock, rollback, logging tests
        └── test_close_event_concurrency.py  # New overlapping independent sessions
```

**Structure Decision**: Follow `api → services → repositories → models`, with domain errors independent of infrastructure. The organizer dependency calls a read-only EventService authorization method; it does not query repositories directly. The mutating service repeats authoritative scope/organizer checks inside the write transaction. Existing model/schema/db files require no change. Test fixtures may reuse existing helpers without mandatory fixture edits. Existing Postman requests are validation inputs, not a new collection to generate.

## Phase 0: Research

Research is consolidated in [research.md](research.md), decisions R1–R8. Paseo's configured `explorer` investigated the same workspace read-only. The orchestrator verified affected files and corrected the research report's draft step order: organizer authorization MUST precede replay, consistent with the report's own test strategy and the shared contract. There are no unresolved technical clarifications for the bounded increment.

## Phase 1: Design

### Request and service flow

1. Reuse `CurrentParticipant` to authenticate and scope the credential. `event_id` remains an opaque string.
2. `require_organizer` delegates to a read-only service authorization method: verify event existence, scope, and organizer identity, then return the existing participant. Add no new token or authorization scheme.
3. `EventService.close(actor, event_id)` opens `Db.write()` and repeats scope, existence, and organizer checks against the current event before replay. Service tests invoke it directly to prove the dependency is not its only protection.
4. If already closed, build the current `EventRead` using the active session, and exit without invoking the clock, updating, or logging closure.
5. If active, obtain one UTC closure instant and call an event repository conditional update matching event ID and active state. Verify exactly one affected row. An unexpected zero-row result must not be reported as a new successful closure; reread and handle a closed replay or raise an internal consistency failure.
6. Refresh/reload the event in the same session after the conditional update so the response cannot contain stale active state. Build current organizer stats using a shared in-session helper, then build `EventRead` before transaction exit. Summary or response-building failure rolls back the transition.
7. After the transaction context successfully commits, emit `event_closed` at INFO with `event_id`, `participant_id` (actor), and `invalidated_proposal_count=0` for this schema. Return the prepared result. Replays emit no such event.

### Interface and storage

[close-event.openapi.yaml](contracts/close-event.openapi.yaml) defines the existing decided path, bodyless request, bearer security, headers, shared Event schema reference, and 200/401/403/404/500 responses. Explicitly document 403 through the existing error helper. The close operation has no event-closed conflict: its authorized replay is a success.

Remove only framework-generated `HTTPValidationError` 422 documentation from the two known bodyless event operations. Keep create's intentional 400/422 contract and any other operation's actual validation. Do not globally delete validation schemas that remain referenced. The route may set `operation_id="closeEvent"` to match the design artifact without changing existing operation IDs.

[data-model.md](data-model.md) defines the active-to-closed invariant, read result, and deferred proposal transitions. No schema migration is necessary.

### Acceptance allocation

| Requirements / outcomes | Current increment evidence | Dependency / limitation |
|---|---|---|
| FR-001–FR-004; SC-001–SC-002 | Organizer close, current result, all auth categories, active/closed non-organizer denial, direct-service protection, closed GET | None for existing tables |
| FR-005–FR-006; SC-003–SC-004 | Sequential/concurrent replay, unchanged clock/time, one success log, pre-commit rollback and retry | Durable crash-safe audit delivery is not provided by stdout logging |
| FR-007; SC-005 | Reuse proven write serialization; test overlapping close calls | Actual final-consent ordering remains pending until consent exists |
| FR-008–FR-009; SC-006 | Close replay and existing closed event GET | Every missing operation must add its own state/replay tests when built |
| FR-010–FR-011; SC-007 and preservation portions | Conditional design recorded only | Explicit policy approval and proposal/garment features required |
| FR-012 | No reopening or handover changes; event identity and other records unchanged | Handover/retention remain open |

## Implementation Notes for `/speckit-tasks`

Use these dependency-ordered TDD cycles; this plan does not generate tasks or implementation code.

1. **Organizer authorization gate**: `test-author` writes/runs failing tests for the read-only organizer service and dependency, including closed-event non-organizer denial, scope/existence precedence, and unchanged records. `implementer-be` adds the error, service gate, and dependency; run checks, refactor, review, and commit green.
2. **Complete closure behavior and HTTP/schema**: Before writing any closure behavior, `test-author` writes/runs the T006–T008 API, service, concurrency, and schema tests. T006 includes authorized replay, original closure time, safe correlated 500 responses, rollback, and retry. T007 includes replay clock suppression, current summary, one initial success log, no replay/failure success log, confidentiality, failures after update/during result construction/at commit, successful retry, and overlapping independent sessions with one timestamp/update/log. Verify expected Red while the close service/route is absent. Only then may `implementer-be` add conditional closure, transaction-scoped authorization, shared summary, replay handling, post-commit logging, route, 403 description, and targeted schema cleanup. T011 requires all these tests and existing create/read checks green before review and commit. US3 tests are authored here even though their later regression verification has a separate story phase.
3. **Concurrency and failure regression verification**: T012–T013 rerun the already-authored replay/rollback/API and concurrency tests and record actual results. They do not introduce the first tests for behavior already committed at T011. If a new gap is found, T014 starts a fresh `test-author` reproduction and confirmed Red before `implementer-be` fixes it and refactors green. If existing tests pass, add no production changes merely to force Red; review/commit only content actually changed.

For each behavior cycle, follow `test-author` → `implementer-be` → `commit-reviewer` → commit, never committing Red alone. Profile selection must use fresh Paseo `list_profiles` notes and execute in this feature's workspace. Delegates must not delegate. Re-run checks in the orchestrator before marking tasks done. Resolve Critical/High findings and obtain re-review after fixes. PR work requires a separate `pr-reviewer` review. No commit or PR is part of planning.

Before implementation is reported complete, run:

```bash
cd backend
uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest
```

[quickstart.md](quickstart.md) supplies local validation steps and identifies future integration scenarios that must not be reported as passing now.

## Complexity Tracking

No constitution violations or additional architectural layers to justify.
