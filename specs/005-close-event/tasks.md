# Tasks: Close Event (Backend)

**Input**: Design documents from `specs/005-close-event/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [operation contract](contracts/close-event.openapi.yaml), [integration obligations](contracts/closure-integration.md), [quickstart.md](quickstart.md), and `.specify/memory/constitution.md`.

**Tests**: Required. Every production behavior change follows test-author Red → implementer-be Green → Refactor. Run new tests before changing production behavior and record the expected failure. Existing behavior that already passes an added regression test stays green; never break working code to manufacture Red. Do not delete or skip failing tests; genuinely unimplemented cases use `xfail(reason=...)` under the testing rules.

**Organization**: One phase per user story. All four stories have priority P1. US2 precedes US1 because organizer authorization is a prerequisite to exposing closure. Story phases provide independently runnable checks; full US2 HTTP acceptance joins US1's endpoint cycle. Full US4 acceptance remains dependency-gated as explicitly allowed by the spec and plan.

## Format: `[ID] [P?] [Story] Description`

- All paths are relative to the repository root. `[P]` identifies disjoint test-author work or independent regression runs eligible to run together after its phase dependencies finish; it does not permit parallel production implementers in one workspace.
- Every checkbox starts unchecked. This file schedules work; task generation runs no implementation, commits, or PR work.
- Do not add tables, migrations, dependencies, frontend behavior, or absent exchange/AI endpoints for this increment.

## Execution Rules

The orchestrator writes Spec Kit artifacts only. Before each delegation, call Paseo `list_profiles`, read notes, and materialize the selected profile's provider/model/settings. Required profiles: `test-author`, `implementer-be`, `commit-reviewer`; missing profiles stop that delegated cycle. Use the current feature workspace and one implementer at a time; delegates must not delegate.

Each prompt includes task IDs/text, allowed paths, this feature's artifacts, `AGENTS.md`, `.specify/memory/constitution.md`, `docs/rules/dev/common/api-contract.md`, `docs/rules/dev/common/testing.md`, `docs/rules/dev/backend/testing.md`, applicable backend rules, and `docs/plans/vintage-relay-plan-v1.md`. Test authors may edit `backend/tests/**`; implementers may edit only the named production paths under `backend/app/**`. Reviewers are read-only.

Each review/checkpoint task below completes its preceding test/implementation cycle: run focused tests and all backend checks, have the orchestrator rerun checks, then obtain a fresh-profile `commit-reviewer` OCR delegate review in the same workspace of the exact proposed commit content. The reviewer runs `ocr delegate preview --format json`, `ocr delegate rule --format json <selected-paths>`, and, for index scope, `git --no-pager diff --cached --no-ext-diff --no-textconv --no-color`; reads the OCR delegate skill and applicable rules; and reports English findings with severity, file/line, trigger/impact, suggested fix, and reviewed/skipped coverage. Include base/HEAD, requirements, actual check results, and staged/index scope if applicable. Resolve Critical/High findings, rerun checks, and obtain re-review after content changes. Commit only the green reviewed cycle, never a Red task alone. If content was already committed in an earlier cycle, do not create an empty commit. Any later PR task needs its separate `pr-reviewer`; this task list does not authorize PR creation or publishing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing checkout and tooling; no project scaffolding is necessary.

- [X] T001 Verify the feature branch and active `specs/005-close-event/` pointer in `.specify/feature.json`; read `AGENTS.md` and the common/backend rule indexes, reuse `backend/pyproject.toml` and `backend/uv.lock` without upgrades, and record the existing backend full-check baseline in `specs/005-close-event/quickstart.md` with actual results rather than the prior explorer's report.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Confirm reusable fixtures and unchanged schema constraints before behavior work.

- [X] T002 Inspect `backend/tests/conftest.py`, `backend/app/core/db.py`, `backend/app/models/event.py`, and `specs/005-close-event/data-model.md`; reuse file-backed `tmp_path`, `add_participant`, fixed-clock injection, and `client_no_raise`, recording any fixture additions needed in the relevant test task. Preserve the existing field constraints verbatim: ID "String primary key"; name "Non-null string"; status "String with CHECK for `active`, `closed`"; entry code "Unique string"; organizer reference "Nullable FK to `participants.id`, populated at creation"; creation time "UTC-aware timestamp through `UtcDateTime`"; closure time "Nullable `UtcDateTime`". Do not introduce schema changes or shared test state.

**Checkpoint**: T001–T002 complete before any story implementation. New fixture code, if needed, belongs to its test-author's Red cycle rather than a separate scaffolding commit.

## Phase 3: User Story 2 - Only the event's organizer can close it (Priority: P1)

**Goal**: Build a reusable read-only organizer gate before exposing a mutating endpoint.

**Independent Test**: Invoke the actual service authorization method and organizer dependency with real SQLite-backed event/participant fixtures. Organizer succeeds; a regular participant fails for both active and closed events; another event's participant, absent event, and malformed ID produce not-found. Neither event nor participant records change. The complete HTTP credential/error matrix is tested in T006 after the route is scheduled.

### Tests for User Story 2 (write first)

- [X] T003 [US2] Have `test-author` add organizer authorization tests in `backend/tests/services/test_close_event.py` for the planned read-only `EventService.require_organizer(actor, event_id)` and direct `require_organizer` dependency invocation using the real service: organizer success, same-event regular participant forbidden even when closed, cross-event/missing/malformed target not-found, and unchanged records. Run `cd backend && uv run pytest tests/services/test_close_event.py`; confirm failure because the organizer capability is absent, rather than unrelated fixture/import configuration errors.

### Implementation for User Story 2

- [X] T004 [US2] Have `implementer-be` satisfy T003 by adding `ForbiddenError` with status 403/code `FORBIDDEN` in `backend/app/domain/errors.py`, a read-only scope/existence/organizer check in `backend/app/services/event.py`, and `require_organizer`/`Organizer` in `backend/app/api/deps.py` that calls the service without querying repositories directly. Follow the data-model relationship "A participant belongs to one event" and `event.organizer_participant_id == participant.id`; do not add a separate organizer credential or unused `EventClosedError`.
- [X] T005 [US2] Validate and review the T003–T004 green cycle across `backend/tests/services/test_close_event.py`, `backend/app/domain/errors.py`, `backend/app/services/event.py`, and `backend/app/api/deps.py` under Execution Rules; record exact results in `specs/005-close-event/quickstart.md` before the reviewed commit. Recheck missing-resource precedence and denied closed-event requests.

**Checkpoint**: Organizer gate is independently testable. US2's full endpoint acceptance remains due in T006–T011; do not claim the close route exists yet.

## Phase 4: User Story 1 - Organizer ends an active event (Priority: P1)

**Goal**: Provide the bodyless close endpoint with transaction-scoped authorization and a current event result.

**Independent Test**: Create an event through the existing endpoint, close it as organizer, and read it again. Verify closed state, non-null UTC closure time, unchanged identity/details, organizer caller information, summary 1/0/0 for a fresh event, and no credential in the response. Test US2's full HTTP denial matrix against the same endpoint.

### Tests for User Story 1 (write first)

- [X] T006 [P] [US1] Have `test-author` create `backend/tests/api/test_close_event.py` covering bodyless POST without Content-Type, closed result/GET agreement, real participant count with fixture-added participants, and no token/hash exposure; also cover US2's missing/non-Bearer/empty/unknown credentials (401, before target lookup), other/missing/malformed event (indistinguishable 404), same-event regular participant on active and closed events (403), and entry-code/link without bearer credential (401). Also write US3 API tests now for repeated close returning 200 with the original `closedAt`, injected pre-commit failure returning safe 500 `INTERNAL_ERROR` with matching request IDs, unchanged active state after rollback, and successful retry using `client_no_raise`. Assert unchanged state on denials, shared error envelopes, and no sensitive internals; run the file and confirm expected missing-route failures before T009–T010 implementation.
- [X] T007 [P] [US1] Have `test-author` extend `backend/tests/services/test_close_event.py` with direct `EventService.close` tests: fixed-clock active-to-closed persistence, event-scoped authorization repeated despite bypassing the dependency, unchanged identity/name/entry/organizer/creation fields, other-event isolation, current summary, and participants unchanged. Quote and assert "Normal creation produces active/null closure time", "Successful closure produces closed/non-null closure time", and "Closure inserts, deletes, and modifies no participants." Also write US3 tests now for sequential replay, a clock that fails if called on replay, current summary on replay, exactly one initial closure log, no extra success log on replay or failure, no token/entry-code/free-text leakage, and failure injection after update/during result construction/at commit followed by rollback and successful retry. Assert "Replay never clears or overwrites the closure time." Create `backend/tests/services/test_close_event_concurrency.py` now with two independent sessions against the same per-test SQLite file, bounded synchronization before acquiring the write lock, and assertions that overlapping closes return the same timestamp with one update/log. Use no sleeps, shared sessions, in-memory database, or barrier requiring two write-lock holders. Run both service test files and confirm failures because close behavior is absent before T009; do not edit T003's tests or inject failures after a successful commit into rollback claims.
- [X] T008 [P] [US1] Have `test-author` extend `backend/tests/api/test_openapi_contract.py` from `specs/005-close-event/contracts/close-event.openapi.yaml`: bodyless POST, string event ID, bearer security, Event result with required fields, 200/401/403/404/500 envelopes/headers, and no automatic close 422; retain create's intentional 400/422 and existing read/security checks. Run this file and confirm the new operation is absent before implementation.

### Implementation for User Story 1

- [X] T009 [US1] Only after T006–T008, including all US3 replay/logging/rollback/concurrency tests assigned to T006–T007, establish and record their expected Red results, have `implementer-be` add a conditional active-to-closed repository update with affected-row validation and same-session refresh in `backend/app/repositories/event.py`, and `EventService.close(actor, event_id)` plus an in-session shared read/close summary helper in `backend/app/services/event.py`. Use one existing `Db.write()`; repeat scope/existence/organizer checks before replay; use the injected UTC clock once only for initial closure; prepare `EventRead` before commit; log INFO `event_closed` only after commit with `event_id`, `participant_id`, and `invalidated_proposal_count=0`. Preserve "Change only `active` to `closed`" and "Set once on successful initial closure; preserved on replay" from the data model. Do not open `EventService.get()`'s separate transaction inside closure or implement proposal policies.
- [X] T010 [US1] Have `implementer-be` add the synchronous bodyless `POST /{event_id}/close` route using `Organizer`, `EventServiceDep`, and `EventRead` in `backend/app/api/routers/events.py`; add the missing 403 description to `backend/app/api/errors.py`; extend `backend/app/main.py`'s narrowly scoped automatic-422 cleanup to this operation while retaining genuine validation responses elsewhere. Match `closeEvent` operation ID without renaming existing operations; repeated close returns 200 rather than 409. Pass T006–T008 and all existing create/read checks before refactoring.
- [X] T011 [US1] Validate and review the T006–T010 green cycle for `backend/app/api/`, `backend/app/services/event.py`, `backend/app/repositories/event.py`, `backend/app/main.py`, and their test files under Execution Rules; record actual results in `specs/005-close-event/quickstart.md` and commit only reviewed green content. Require all T006–T008 tests, including the US3 API failure/replay and service concurrency/rollback cases, to pass before this review and commit. This checkpoint closes US1 and US2 HTTP acceptance together and supplies initial US3 behavior evidence.

**Checkpoint**: Secure create → close → read works. This is the minimum demonstrable endpoint; complete US3 before presenting it as resilient to repeated/interrupted mobile requests.

## Phase 5: User Story 3 - Repeated or interrupted closure stays consistent (Priority: P1)

**Goal**: Verify repeat, concurrency, failure rollback, and retry without duplicate closure effects.

**Independent Test**: Run sequential and overlapping closes using separate SQLite sessions; assert one timestamp/state transition/log. Inject failures after update, during result preparation, and at commit; verify rollback and a subsequent successful retry. Verify the API's safe 500 and request ID.

### Regression Verification for User Story 3 (tests authored before T009)

- [X] T012 [P] [US3] Rerun the replay/logging/rollback/retry tests already authored in T006–T007 in `backend/tests/services/test_close_event.py` and `backend/tests/api/test_close_event.py`; report actual results to the orchestrator for the T015 update of `specs/005-close-event/quickstart.md`, including original closure time, replay clock suppression, current summary, one initial success log, safe correlated 500 responses, rollback, retry, and confidentiality. This is regression verification, not the first test-author step for behavior implemented in T009–T010. If a new gap appears, request a test-author reproduction before T014; do not manufacture Red by breaking working code.
- [X] T013 [P] [US3] Rerun `backend/tests/services/test_close_event_concurrency.py`, whose independent-session overlap tests were authored in T007 before T009. Verify finite synchronization timeouts, two successful results with one original timestamp and one update/log, and report actual evidence to the orchestrator for the T015 update of `specs/005-close-event/quickstart.md`; T012–T013 must not write that shared document concurrently. These tests validate closure overlap only, not real final-consent ordering; any new regression needs a test-author reproduction before T014.

### Reproducing-Test Fixes for User Story 3

- [X] T014 [US3] If T012–T013 expose a new gap, have `test-author` add or refine the smallest reproducing test in `backend/tests/services/test_close_event.py`, `backend/tests/services/test_close_event_concurrency.py`, or `backend/tests/api/test_close_event.py` and confirm expected Red first. Then have `implementer-be` fix only that gap in `backend/app/services/event.py` or `backend/app/repositories/event.py` (or `backend/app/api/errors.py` / `backend/app/core/logging.py` only when the reproduction proves an error-boundary defect), and run Green → Refactor. If all regression checks pass, make no production change. Add no speculative retry engine or audit table.
- [X] T015 [US3] Record actual T012–T013 regression results and the stdout crash-delivery limitation in `specs/005-close-event/quickstart.md`; run all backend checks. If T014 changed tests/production or verification documentation changed, validate and obtain exact-content commit review under Execution Rules for those changed paths before committing green content. Do not create a redundant code review or empty commit when no content changed; initial behavior and tests were already reviewed at T011.

**Checkpoint**: Normal processing/retransmission/concurrency produces one initial closure log. Durable crash-safe exactly-once logging is not claimed. No actual consent concurrency has been tested by overlapping close requests.

## Phase 6: User Story 4 - Closure protects exchange outcomes (Priority: P1)

**Goal**: Verify the available close/read integration and preserve explicit future exchange acceptance obligations without implementing absent subsystems.

**Independent Test (available increment)**: Close through the real endpoint, replay as organizer, and read as organizer/regular participant; verify unchanged original closure time, consistent closed state, existing stats visibility, and other-event isolation. No reopening/handover side effects are introduced.

**Full-story dependency gate**: Real final-consent ordering, post-closure mutations/AI recommendations, alternative behavior, and proposal lifecycle tests require their actual future features. FR-010/FR-011 additionally need explicit policy approval. T016–T018 do not close those acceptance criteria.

### Tests for User Story 4 (write first)

- [X] T016 [US4] Have `test-author` create `backend/tests/api/test_close_event_integration.py` exercising real create/close/replay/read and regular-participant visibility with fixtures from `backend/tests/conftest.py`; verify `stats=null` for regular participants, current organizer summary, stable closure time, unrelated event unchanged, and no participant changes. Run before any integration fix; already-working close/read scenarios are regression evidence, not a reason to manufacture Red. Add no fake consent endpoint or proposed-policy test before approval.

### Integration for User Story 4

- [X] T017 [US4] If T016 reveals a gap, have `implementer-be` fix only that reproduced current-capability behavior in `backend/app/services/event.py` or `backend/app/api/routers/events.py` after recorded Red; otherwise make no production change. Have the orchestrator update `specs/005-close-event/contracts/closure-integration.md` with the verified close/read scope and still-pending real consent orderings, per-operation closed/replay checks, proposal policy approval, and missing table dependencies. Preserve FR-007–FR-011/SC-005–SC-007 pending status rather than marking the full story complete.
- [X] T018 [US4] Validate the T016–T017 current integration tests and all backend checks, then obtain the same-workspace read-only commit review of `backend/tests/api/test_close_event_integration.py`, any corrected app paths, and `specs/005-close-event/contracts/closure-integration.md` under Execution Rules; record what was actually tested in `specs/005-close-event/quickstart.md`, and commit only reviewed green content.

**Checkpoint**: Current integration is verified; full US4 remains deferred until its listed feature/policy dependencies are satisfied. The orchestrator must state that distinction in implementation reports.

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Reconcile artifacts and verify the delivered increment without overstating the broader exchange workflow.

- [X] T019 Reconcile `specs/005-close-event/plan.md`, `specs/005-close-event/data-model.md`, `specs/005-close-event/contracts/close-event.openapi.yaml`, and `specs/005-close-event/quickstart.md` with actual implementation, including any test filename adjustments; validate local links, YAML references, response examples, and requirement allocation. Do not turn conditional proposal policy into an approved rule or remove unmet acceptance criteria from the spec.
- [X] T020 Run the local create → close → replay → read validation in `specs/005-close-event/quickstart.md` using a synthetic isolated database and inspect `/openapi.json` plus the existing requests in `postman/collections/Vintage Relay API/09 Close event/`; record actual responses/headers/log evidence and tools used in the guide. Do not run the entire collection as though unbuilt join/proposal features exist or publish workspace changes.
- [X] T021 Run the full backend checks from `backend/pyproject.toml`: `cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest`; independently run the full frontend checks from `frontend/package.json`: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`. The orchestrator records actual outputs/results or concrete blockers in `specs/005-close-event/quickstart.md`; do not infer a pass from earlier baseline reports or modify unrelated frontend code to conceal a failure.
- [X] T022 Inspect the final diff for the intended `backend/` changes and `specs/005-close-event/` artifacts, verify task/requirement evidence and all outstanding US4 dependencies, and obtain a fresh-profile same-workspace `commit-reviewer` OCR delegate review for any content changed since its last review. Resolve Critical/High findings, rerun affected/full checks, and obtain re-review before the final green commit; leave PR creation/push/publication outside this task. Record the final verification scope and deferred requirements in `specs/005-close-event/quickstart.md` before reviewing that final content.

## Dependencies & Execution Order

### Phase and story graph

```text
T001 Setup → T002 Foundation
                    ↓
          US2 gate: T003 → T004 → T005
                    ↓
   US1: {T006, T007, T008} → T009 → T010 → T011
                    ↓
          US3: {T012, T013} → T014 → T015
                    ↓
          US4 current integration: T016 → T017 → T018
                    ↓
              T019 → T020 → T021 → T022

US4 full acceptance ← real join/clothing/intent/AI/proposal/consent features
US4 proposed transitions ← explicit FR-010/FR-011 approval + real models
```

### Within each cycle

- Test-author completes the cycle's test tasks and runs them before its corresponding behavior implementation. Preserve existing green tests during refactoring.
- T006–T008 jointly precede T009, including US3 replay, clock, log, rollback/retry, and concurrency tests in T006–T007. Do not commit route tests Red alone. T012–T013 rerun those existing tests; any additional T014 fix requires a test-author reproduction and confirmed Red before production edits.
- Each review task gates the next cycle's commit. Follow the repository's exact-content OCR review procedure; later changes invalidate the corresponding reviewed content.
- All stories share the event service/repository; production work across stories is sequential in this workspace.

## Parallel Execution Examples

| Story | Eligible example | Boundary |
|---|---|---|
| US2 | None: T003 → T004 → T005 | One prerequisite security cycle; no independent production tasks |
| US1 | T006 API tests, T007 service tests, and T008 OpenAPI tests can be authored in disjoint files after T005 | Coordinate fixture needs first; one test-author may simply execute sequentially; all three finish before T009 |
| US3 | T012 replay/rollback/API regression runs and T013 concurrency regression runs can execute independently after T011 | Their tests were authored in T006–T007 before T009; each run uses isolated test data, and any new fix requires its own Red reproduction |
| US4 | No parallel task pair: T016 → T017 → T018 | Future policy/feature work is gated, not a parallel task in this increment |

No subagents are spawned during task generation. These opportunities apply only during an authorized implementation stage and do not override Paseo profile/workspace restrictions.

## Implementation Strategy

### MVP First

Complete T001–T011: setup, reusable organizer authorization (US2), and the secure close endpoint (US1). Demonstrate organizer close/read plus denied non-organizer closure. US1 alone is not a safe endpoint without US2. Complete US3 before treating the endpoint as ready for mobile retries or failures.

### Incremental Delivery

1. US2 delivers the tested authorization gate.
2. US1 adds the endpoint and completes HTTP authorization acceptance.
3. US3 reruns concurrency/failure tests already authored before T009 and fixes only newly reproduced gaps through a fresh Red → Green → Refactor cycle.
4. US4 verifies current close/read integration while retaining unbuilt-feature/policy obligations.
5. Final validation checks both applications, reconciles evidence, and reviews the final changed content.

### Requirement Allocation

| Requirement / outcome | Tasks | Completion boundary |
|---|---|---|
| FR-001–FR-002 / SC-002 | T003–T011 | Gate + in-write recheck + real HTTP denial matrix |
| FR-003–FR-004 / SC-001 | T006–T011 | Closed state/time, current shared result, no credential |
| FR-005–FR-006 / SC-003–SC-004 | T006–T011, T012–T015 | Red tests precede initial replay/logging/rollback/concurrency implementation; later regression verification |
| FR-007 / SC-005 | T017 records dependency | Real final-consent tests pending; double-close is insufficient |
| FR-008–FR-009 / SC-006 | T006–T007, T012, T016–T018 | Close replay/read verified now; missing actions/replays remain pending |
| FR-010–FR-011 / SC-007 and confirmed preservation | T017 records dependency | Policy approval and real proposal/garment implementation required |
| FR-012 | T007, T016–T018 | Existing records preserved, no reopen/handover feature introduced |

## Notes

- 22 tasks: US1 6, US2 3, US3 4, US4 3, setup/foundation/polish 6. Five `[P]` opportunities form two parallel groups: three test-author tasks and two later regression runs.
- Every implementation task names its reproducing or preceding test task. Test-only validation of existing green behavior does not require an artificial production change.
- Finishing all present checkboxes delivers the plan's bounded increment, not all of US4 or a complete clothing exchange product. Keep the remaining requirements visible in the integration artifact and final report.
