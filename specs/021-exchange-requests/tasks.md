# Tasks: 020 Exchange Requests and Proposals

**Input**: specs/021-exchange-requests/ (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan.md, spec.md — plus research.md, data-model.md, contracts/.

**Tests**: TDD required — test tasks first (Red, confirmed failing), then implementation (Green → Refactor). Never delete/skip failing tests; use `xfail(reason=...)`. Backend order follows feature doc §7: migrations → matching → register/list/withdraw → accept/decline → reads → consent/reject/confirm → retrofits. Each behavior ships with its preceding test; rejection-dependent tests run only after rejection exists.

**Organization**: By user story; backend before the frontend that calls it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependencies)
- **[Story]**: US1–US5 maps to spec.md stories

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch + artifact baseline (already done, verify)

- [x] T001 Verify branch `feature/020-exchange-requests` tracks `origin/main` and specs/021-exchange-requests/ contains spec.md, plan.md, tasks.md, research.md, data-model.md, contracts/, quickstart.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tables, pure matching, error codes — blocks all stories

**Checkpoint**: Foundation ready — no endpoint work until complete

- [x] T002 [P] Write failing migration test verifying an actual Alembic upgrade creates `exchange_intents`, `trade_proposals`, `trade_participants` with required partial unique indexes in backend/tests/test_migrations.py
- [x] T003 Implement models + Alembic revision in backend/app/models/exchange_intent.py, backend/app/models/trade_proposal.py, backend/app/models/trade_participant.py, backend/app/models/__init__.py, backend/alembic/versions/*_exchange_requests.py
- [x] T004 [P] Write failing pure tests for two-/three-person cycle detection, `cycleKey` order-independence, and suppression in backend/tests/unit/test_matching.py
- [x] T005 Implement pure `domain/matching.py` (cycles, `cycleKey`, suppression) with no DB imports in backend/app/domain/matching.py
- [x] T006 [P] Add intent/proposal error codes (`INTENT_NOT_ACTIVE`, `PROPOSAL_VERSION_MISMATCH` with `currentStatus`/`latestProposalId` details) in backend/app/domain/errors.py and wire through backend/app/api/errors.py

**Checkpoint**: `uv run pytest backend/tests/unit/test_matching.py backend/tests/test_migrations.py` green; ruff/mypy clean

---

## Phase 3: User Story 1 — Request register/list + withdraw (P1) 🎯 MVP base

**Goal**: Register offer/want, list sent/received, withdraw own; visibility 404-hiding; generation runs on register

**Independent Test**: Own available + other's available → register 201, same pair → 200 replay; sent/received filters; cross-participant reads 404; withdraw → withdrawn + dependents invalidated; withdrawn replay → 204 incl. after closure

### Tests for US1 (REQUIRED — write first) ⚠️

- [x] T007 [P] [US1] Failing API tests for intent register/list in backend/tests/api/test_intents_register_list.py (pair validation, own_clothing 422, active-pair replay 200, sent/received + status/wantedClothingId filters, visibility 404, check order, closure rules)
- [x] T008 [P] [US1] Failing API tests for withdraw in backend/tests/api/test_intents_withdraw.py (sender-only 403, replay 204 incl. after closure, `INTENT_NOT_ACTIVE` paths, pending `intent_changed` invalidation, confirmed untouched)

### Implementation for US1

- [x] T009 [US1] Implement intent register + list (`POST/GET /events/{id}/intents`) with check order + same-transaction cycle recalculation in backend/app/services/intent.py, backend/app/repositories/intent.py, backend/app/schemas/intent.py, backend/app/api/routers/intents.py (register in backend/app/main.py)
- [x] T010 [US1] Implement withdraw (`DELETE /intents/{id}`) with same-transaction pending invalidation in backend/app/services/intent.py, backend/app/api/routers/intents.py

**Checkpoint**: US1 API tests green

---

## Phase 4: User Story 1b — Accept/decline (P1)

**Goal**: Owner accepts (reverse intent + 2-person proposal + accepter consent + suppression lift) or declines

**Independent Test**: Accept → reverse reused, `updatedAt` touched, 2-person proposal pending with accepter consented; accept replay while pending/confirmed → 200 proposal; ended-proposal accept replay → 409; decline → declined + dependents invalidated; decline replay → 200 incl. after closure

### Tests for US1b (REQUIRED — write first) ⚠️

- [x] T011 [P] [US1] Failing API tests for accept in backend/tests/api/test_intents_accept.py (owner-only 403, replay 200 while its proposal pending/confirmed, reaccept after reject in active event creates next version with fresh accepter consent, 409 only on closure/inactive-intent/unavailable-garment, `INTENT_NOT_ACTIVE`/`CLOTHING_*`)
- [x] T012 [P] [US1] Failing API tests for decline in backend/tests/api/test_intents_decline.py (owner-only 403, replay 200 incl. after closure, pending `intent_changed` invalidation)

### Implementation for US1b

- [x] T013 [US1] Implement accept (`POST /intents/{id}/accept`) with replay-while-pending/confirmed and reaccept-after-reject new-version path in backend/app/services/intent.py, backend/app/services/proposal.py
- [x] T014 [US1] Implement decline (`POST /intents/{id}/decline`) in backend/app/services/intent.py, backend/app/api/routers/intents.py

**Checkpoint**: US1 + US1b green together

---

## Phase 5: User Story 1c — Proposal reads (P1)

**Goal**: Participant-only list + single versioned read, newest-first

**Independent Test**: Participant sees own proposals; outsider gets 404; status/clothingId filters; ordering newest-first

### Tests for US1c (REQUIRED — write first) ⚠️

- [x] T015 [P] [US1] Failing API tests for proposal reads in backend/tests/api/test_proposals_reads.py (participant-only 404, filters, newest-first ordering per v1 decision)

### Implementation for US1c

- [x] T016 [US1] Implement proposal reads (`GET /events/{id}/proposals`, `GET /proposals/{id}`) in backend/app/services/proposal.py, backend/app/schemas/proposal.py, backend/app/api/routers/proposals.py (register in backend/app/main.py)

**Checkpoint**: Reads green; US1 request→accept→read path complete

---

## Phase 6: User Story 1d + 4 — Consent/reject/confirm + failure paths (P1)

**Goal**: Exact-version consent/reject; unanimous confirm exclusive per garment; savepoint-rollback failures; closure-vs-consent serialization; ended-proposal replays

**Independent Test**: Stale version → 409 + `currentStatus`/`latestProposalId`; consent replay while pending/confirmed → 200; consent replay after end (before closure → mismatch, after closure → `EVENT_CLOSED`); overlapping confirms → one winner + `clothing_confirmed_elsewhere`; each recheck failure (inactive intent, withdrawn garment, conditional-update/unique failure) → mapped code, no new consent/garment change, committed `invalidated` + matching `endReason`/`endedAt`, `is_confirmed` invariant; closure-vs-final-consent both orders deterministic

### Tests for US1d (REQUIRED — write first) ⚠️

- [x] T017 [P] [US1] Failing tests for consent/reject happy + conflict paths in backend/tests/api/test_proposals_consent_conflicts.py (version match, stale 409, replay rules incl. ended before/after closure, overlapping double-confirm, reject replay)
- [x] T018 [P] [US1] Failing tests for confirmation recheck failures in backend/tests/api/test_proposals_confirm_failures.py (per-code: `INTENT_NOT_ACTIVE`, `CLOTHING_NOT_AVAILABLE`, `CLOTHING_ALREADY_CONFIRMED` via conditional-update + unique paths; assert no consent/garment change, committed invalidated state, `is_confirmed` invariant)
- [x] T019 [P] [US1] Failing closure-vs-final-consent serialization test (separate SQLite connections; closure-first blocks confirm, confirm-first stays confirmed) in backend/tests/api/test_close_consent_serialization.py

### Implementation for US1d

- [x] T020 [US1] Implement consent/reject/confirm (`POST /proposals/{id}/consents`, `/reject`) with version checks, `BEGIN IMMEDIATE` serialization, savepoint-rollback recheck mapping in backend/app/services/proposal.py

**Checkpoint**: Request → accept → consent → confirmed green incl. conflicts; contract §5-1 replay matrix covered

---

## Phase 7: User Story 3 — Automatic three-person cycle (P2)

**Goal**: Third request closing A→B→C→A auto-creates 3-person proposal (rejection exists now, so suppression-after-reject testable); unanimous consent confirms

**Independent Test**: Seed A→B, B→C, submit C→A → 3-person pending; three consents → confirmed; reject → same loop suppressed until intent/clothing change

### Tests for US3 (REQUIRED — write first) ⚠️

- [ ] T021 [P] [US3] Failing 3-person tests in backend/tests/api/test_proposals_three_person.py (auto-create on loop close, cycleKey reuse, suppression after reject until change, unanimous confirm)

### Implementation for US3

- [ ] T022 [US3] Extend generation to 3-person cycles via `domain/matching.py` in backend/app/services/proposal.py (no new endpoints)

**Checkpoint**: US1–US3 backend green (2-person + 3-person confirm)

---

## Phase 8: Retrofits + event stats (P1 backend hardening)

**Goal**: Edit/withdraw/close invalidation + recalculation; `confirmedExchangeCount` real value

**Independent Test**: Edit → old invalidated `clothing_changed` + new version needs fresh consent; withdraw → active intents invalidated + pending `clothing_withdrawn`; close → pending `event_closed`, mutations 409, replays succeed; close response + organizer read show real confirmed count after confirm and after closure

### Tests for retrofits (REQUIRED — write first) ⚠️

- [ ] T023 [P] [US4] Failing retrofit tests in backend/tests/api/test_retrofits_020.py (07 PATCH steps 6–7, DELETE steps 6–7, 03 close `event_closed`, permission matrix, closure rejections + replay matrix)
- [ ] T024 [P] [US4] Failing event-stats test for real `confirmedExchangeCount` after confirm and after closure in backend/tests/api/test_event_stats_confirmed.py

### Implementation for retrofits

- [ ] T025 [US4] Retrofit clothing edit/withdraw invalidation + recalculation in backend/app/services/clothing.py and event-close pending invalidation in backend/app/services/event.py (same transactions; keep confirmed checks; real `invalidated_*_count` logs) + confirmed-proposal counting in `EventService._read` (replace `TODO(feature 06/11)` zero)

**Checkpoint**: Full backend suite green: `cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest`

---

## Phase 9: User Story 5 — Trades UI: I1, T1, T2, C4, C2 warning, badge/polling (P2 frontend)

**Goal**: Offer sheet, Received/Sent/Exchanges, proposal detail + changed-modal, my-item requests, edit warning

**Badge definition (v1)**: `badge = active received intents with acceptedProposalId == null + pending proposals where myResponse == pending`. Accepted intents excluded (they live in Exchanges now) to avoid double count. After closure counts freeze (no polling) and screens are read-only. `BottomTabBar` hosts the badge so it stays visible outside Trades.

**Independent Test**: Seeded states across Received/Sent/Exchanges + T2 version passthrough/conflict/disable + polling invalidation + badge; manual 360–430px screenshots of I1, T1, T2, C4

### Tests for US5 (REQUIRED — write first where logic exists) ⚠️

Frontend unit tests target pure logic + interaction contracts; layout verified manually + `/impeccable critique|audit`.

- [ ] T026 [P] [US5] Failing frontend tests for intent/proposal API + mappers in frontend/src/lib/api/intents.test.ts, frontend/src/lib/api/proposals.test.ts, frontend/src/lib/api/query-keys.test.ts (eventId-first token selection for top-level paths; version passthrough unchanged; 409 `PROPOSAL_VERSION_MISMATCH` → modal data)
- [ ] T027 [P] [US5] Failing tests for proposal grouping/sorting (newest-first) + badge counts per definition above in frontend/src/lib/trades.test.ts
- [ ] T028 [P] [US5] Failing T2 interaction tests in frontend/src/components/trade/ProposalDetail.test.tsx (sends displayed version for consent/reject; shows conflict notice + reload on 409; disables consent when invalidated/closed or version changes via polling)

### Implementation for US5

- [ ] T029 [US5] Implement `lib/api/intents.ts`, `lib/api/proposals.ts`, `src/types/intent.ts`, `src/types/proposal.ts`, extend `query-keys.ts` + `mutationKeys` in frontend/src/lib/api/query-keys.ts (no direct fetch; `apiFetch(eventId, …)`; `retry: 0` on mutations; disable buttons while pending)
- [ ] T030 [US5] Enable B3 Request exchange + I1 offer sheet (pick owned available garment; empty → Register item) + Withdraw in frontend/src/components/clothing/ClothingDetailScreen.tsx + new OfferSheet component (Astryx template-first; Next docs pattern; run `pnpm exec astryx doctor --built`)
- [ ] T031 [US5] Implement T1 Trades Received/Sent/Exchanges segments in frontend/src/app/events/[eventId]/(tabs)/trades/page.tsx + frontend/src/components/trade/* and badge in frontend/src/components/ui/BottomTabBar.tsx (accept/decline/withdraw; polling 15s badge/lists; closed banner + disabled actions)
- [ ] T032 [US5] Implement T2 `trades/[tradeId]` detail (cycle view, responses, version; Consent/Reject confirmations; 5s polling while pending; proposal-changed modal + reload; stop when terminal) — new route under frontend/src/app/events/[eventId]/trades/[tradeId]/page.tsx
- [ ] T033 [US5] Implement C4 Requests section + related exchanges in frontend/src/components/clothing/MyItemDetailScreen.tsx and C2 edit invalidation warning in frontend/src/components/clothing/EditClothingForm.tsx
- [ ] T034 [US5] Run `/impeccable critique` (or `audit`) on new/changed I1, T1, T2, C4 screens within Astryx rules and apply findings before review

**Checkpoint**: `cd frontend && pnpm lint && pnpm typecheck && pnpm test` green (+ `pnpm build` before PR); screenshots attached

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Contract sync + verification

- [ ] T035 Update docs/plans/api/09-intents.md, 11-proposals.md open-decision notes + README proposal-ordering if implementation deviates (same PR) and mark README status row for 020
- [ ] T036 [P] Run full verification: backend checks + frontend checks + quickstart.md E2E (2-person + 3-person + stale-version modal) and record results
- [ ] T037 Pre-PR: `pr-reviewer` review → open PR (Changes/Verification/Notes + "API change", screenshots) → English review comments → CI green → squash merge

---

## Dependencies & Execution Order

- Setup (T001) → Foundational (T002–T006) BLOCKS all stories
- B1 register/withdraw (T007–T010) → B2 accept/decline (T011–T014) → B3 reads (T015–T016) → B4 consent/reject (T017–T020) → US3 3-person (T021–T022) → Retrofits+stats (T023–T025) → US5 frontend (T026–T034) → Polish (T035–T037)
- Within each behavior: tests (Red, confirmed failing) → implementation (Green → Refactor) → `commit-reviewer` → commit; never commit Red alone
- Rejection-dependent tests (suppression-after-reject) run only after rejection exists (Phase 7)
- Backend tasks before the frontend tasks that call them; one implementer per workspace at a time; boilerplate only via `scaffolder`

### Parallel Opportunities

- T002 ∥ T004 ∥ T006; T007 ∥ T008; T011 ∥ T012; T015 single; T017 ∥ T018 ∥ T019; T021 single; T023 ∥ T024; T026 ∥ T027 ∥ T028
- Sequential: T009→T010 (same service); T013+T014 (same service, one worker); T016; T020; T022; T025; T029→T030–T033

## Implementation Strategy

- MVP: T001–T016 (register/withdraw + accept/decline + reads)
- Then consent/reject/confirm → 3-person → retrofits/stats → frontend → Polish/PR
- Delegation per task: `test-author` → `implementer-be`/`implementer-fe` → `commit-reviewer` → commit; `advisor` re-review after fixes; `pr-reviewer` before PR; `explorer` research applied
