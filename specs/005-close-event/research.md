# Research: Close Event (Backend)

**Date**: 2026-10-29
**Scope**: Existing backend and repository rules; no dependency upgrades or application changes.

## R1. Reuse event authentication and the read model

**Decision**: Reuse `CurrentParticipant`, `EventServiceDep`, `EventRead`, and `build_event_read`. Add `require_organizer`/`Organizer` following the backend API rules, with a service-level authorization check repeated inside the write transaction.

**Rationale**: `backend/app/api/deps.py:33` already authenticates hashed bearer tokens and hides cross-event resources with 404. `backend/app/services/event.py:23` builds the complete shared result without exposing tokens. The service must independently check actor event scope, event existence, and organizer identity before replay; dependency checks alone do not protect the mutation transaction.

**Alternatives considered**: A separate organizer token contradicts the shared contract. A router-only organizer check violates the required transaction recheck. Returning the creation session would expose a credential and change the response shape.

## R2. Existing write transactions own the closure boundary

**Decision**: Implement `EventService.close(actor, event_id)` with one `Db.write()` context. Read current event/organizer/state there, authorize before replay, conditionally update only an active event, refresh the current event after the update, calculate summary, and construct the response before the context commits. Never call `EventService.get()` from that context because it opens a separate read transaction.

**Rationale**: `backend/app/core/db.py:36` already provides separate read and write engines, disabled autobegin, WAL, and `BEGIN IMMEDIATE` for writes. `docs/rules/dev/backend/database.md` requires checks and dependent updates in the same write transaction. Conditional update and affected-row validation document the state transition explicitly even though writes are serialized.

**Alternatives considered**: A read-then-write sequence can use stale state. A process mutex does not express database guarantees. A second read session could observe the old state while closure is uncommitted. No new engine or transaction framework is needed.

## R3. Replay and failures

**Decision**: Authorize first. For an already closed event, return the current result without consulting the clock, updating any row, or emitting another closure log. For active events, use the existing injected clock once for closure. Let transaction exceptions escape to the existing error boundary; context-manager rollback precedes the error response. Log success only after commit.

**Rationale**: `backend/app/services/event.py:63` already injects a clock and logs creation after commit (`:124`). `backend/tests/services/test_event_atomicity.py` supplies the failure-injection/caplog precedent. `docs/plans/api/03-close-event.md` requires stable closure time, no replay logs, and rollback on transaction failure.

**Alternatives considered**: Logging before commit can claim a closure that rolls back. Retimestamping replays changes history. Automatically retrying writes is unnecessary for this contract. Post-commit network failure cannot undo a committed closure; the next request returns its current state.

**Operational limit**: One `event_closed` log per committed initial transition is verified for normal request processing, retries, and injected pre-commit failures. Standard stdout logging cannot guarantee durable exactly-once delivery across a process crash between commit and logging. No outbox or audit table is introduced by this feature.

## R4. No schema expansion

**Decision**: Reuse `events.status`, `events.closed_at`, and organizer linkage. No migration, proposal table, or closure audit table is needed for the current increment. Add `ForbiddenError` and its 403 documentation description; defer unused conflict errors until an operation needs them.

**Rationale**: `backend/app/models/event.py` already stores both event states and the optional UTC closure time. Its existing CHECK restricts status values. `backend/app/domain/errors.py` lacks `ForbiddenError`, and `backend/app/api/errors.py:17` lacks the 403 description required by `error_responses(403)`.

**Alternatives considered**: New audit storage adds a new retention decision. Building empty proposal tables only to invalidate them would expand scope and settle proposed design prematurely. A new status/time CHECK is not necessary to use existing storage safely; retain behavioral invariant tests.

## R5. Response summary shares the current implementation

**Decision**: Extract the existing summary calculation into a small service helper taking the active session, and use it for read and close. Keep participant counts real and clothing/confirmed-exchange counts at their existing zero placeholders, with the existing feature 06/11 TODOs. Reuse the exact `EventRead` schema.

**Rationale**: `backend/app/services/event.py:78` currently counts participants and explicitly defers the other two counts. No clothing/proposal models, repositories, migrations, or endpoints exist at this checkout. The closure response must agree with the existing read response rather than inventing counters.

**Alternatives considered**: A hardcoded participant count would fail after other participants are added. Copying the summary logic creates two integration points that can diverge when later features add counts.

## R6. Present scope and future integration obligations

**Decision**: Implement only settled closure behavior now. Preserve the existing closed-event GET behavior. Record FR-007–FR-011 integration dependencies in [contracts/closure-integration.md](contracts/closure-integration.md). Pending-proposal invalidation, broader confirmed-record preservation/read access, and proposal-specific tests remain approval-gated, as the source and backend testing rules require. Do not mark their acceptance criteria complete merely because the closure endpoint exists.

**Rationale**: The spec explicitly permits bounded integration with available capabilities. There are no join, garment, intent, AI, consent, or proposal operations to guard yet. All later mutations must check event state inside `Db.write()` after authorized replay handling; future AI reads must enforce their own event-state rule. This is an integration obligation, not a new endpoint in this increment.

**Alternatives considered**: Implementing all missing operations makes one closure feature encompass the whole product. Mock consent code would not prove actual consent/closure safety. Treating the word “proposed” as approval would contradict AGENTS.md and constitution V.

**Approval boundary**: Phase 1 can complete for the settled increment. No technical clarification remains for it. Before implementing conditional proposal handling, obtain a user decision and update the relevant source/spec; this plan does not grant that approval.

## R7. OpenAPI and saved Postman requests

**Decision**: Expose one bodyless POST returning 200/401/403/404/500 with the shared error envelope, bearer security, and request ID headers. Use `event_id: str`, not UUID validation. Extend the existing narrowly scoped OpenAPI postprocessing to remove only FastAPI's automatic 422 from the new bodyless operation, while preserving create-event validation and any real 422 responses elsewhere.

**Rationale**: `backend/app/main.py` already performs targeted removal for the read route. `backend/tests/api/test_openapi_contract.py` asserts that create validation remains. Existing Postman close, replay, and non-organizer requests already target the decided route; no new collection or workspace setup is needed.

**Alternatives considered**: Deleting 422 globally would break documented create validation. Adding a body model invents input. Returning 409 on repeated close contradicts idempotency. Publishing a collection is outside this local planning request.

## R8. Verification by risk

**Decision**: Plan Red → Green → Refactor cycles for authorization/service closure, route/schema, and concurrency/rollback. Reuse file-backed `tmp_path` SQLite, direct participant factories, injected clock, `client_no_raise`, and `caplog`. Run two independent write sessions against the same file for overlapping closure; synchronize before entering transactions, with finite timeouts, to avoid deadlocking a writer barrier inside the lock.

**Rationale**: `backend/tests/conftest.py` already supplies these building blocks. The required checks are formatting, lint, mypy, and the full pytest suite. Actual final-consent concurrency requires the future real consent implementation; a transaction-only probe is not equivalent evidence.

**Alternatives considered**: In-memory SQLite and one shared session do not reproduce the production concurrency boundary. Sleep-based ordering is nondeterministic. A numeric coverage target is unnecessary under the constitution.

## Research delegation and reconciliation

Paseo profile `explorer` ran in the same feature workspace (agent `64087502-effd-4583-9d91-8795ab77e390`) and returned file/line evidence for existing event/auth/DB/logging code, absent proposal functionality, and the test strategy. The orchestrator checked those sources directly. The report's draft transaction sequence placed replay before role checking; that sequence is rejected in favor of the source contract's authorization-before-replay order. The report's own acceptance strategy uses the correct order. Its suggestion to add an unused `EventClosedError` is deferred until an actual closed-event-sensitive operation needs it.

The explorer reported the existing backend checks passed: 56 files formatted, lint passing, mypy passing for 29 source files, and 110 tests passing. No close behavior was implemented or verified by that baseline. Planning validation remains separate from runtime acceptance.
