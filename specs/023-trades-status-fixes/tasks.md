---

description: "Task list for 023 Trades Status Fixes After Exchange QA"
---

# Tasks: Trades Status Fixes After Exchange QA

**Input**: Design documents from `specs/023-trades-status-fixes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/proposal-end-detail.md, quickstart.md

**Tests**: REQUIRED (TDD). Each test task is written first by `test-author` and confirmed failing before its implementation task.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Verify specs/023-trades-status-fixes/ contains spec.md, plan.md, research.md, data-model.md, contracts/proposal-end-detail.md, quickstart.md, tasks.md

## Phase 2: Foundational — `Proposal.endDetail` (backend, blocks US4)

**Goal**: Proposal responses tell declined vs withdrawn vs invalidated requests for `intent_changed` proposals (research R5, contracts/proposal-end-detail.md).

**Independent Test**: `cd backend && uv run pytest tests/api/test_proposals_end_detail.py`.

- [x] T002 Write failing API tests in backend/tests/api/test_proposals_end_detail.py (reuse fixtures/helpers from existing proposal/intent API tests and conftest): (a) 1:1 pending proposal, owner declines the request → listed and detail proposal `status="invalidated"`, `endReason="intent_changed"`, `endDetail="intent_declined"` for both parties; (b) requester withdraws → `endDetail="intent_withdrawn"`; (c) 3-person pending cycle A→B→C, the leg between B and C is declined → A (not party to that leg) sees `endDetail="intent_declined"`; (d) pending, confirmed, rejected, cancelled, `clothing_withdrawn`, `clothing_confirmed_elsewhere` proposals → `endDetail` is `null` and the key is present in JSON; (e) after a decline, the requester sends a new active request for the same pair → the old invalidated proposal still reports `intent_declined`; (f) OpenAPI `Proposal` schema exposes nullable `endDetail` with enum `intent_declined|intent_withdrawn|intent_invalidated`; (g) causality (analyze H1): decline R1, re-send the same pair as R2, a new proposal forms, then withdraw R2 → the new proposal reports `intent_withdrawn` (the old one still `intent_declined`); an old declined record on another leg does not affect a proposal ended by a withdraw; a consent-recheck `intent_changed` invalidation (intent changed earlier than `ended_at`) reports `null`
- [x] T003 Implement to pass T002: add `end_detail: Literal["intent_declined","intent_withdrawn","intent_invalidated"] | None` to `Proposal` in backend/app/schemas/proposal.py (camelCase alias like other fields, always serialized); in backend/app/services/proposal.py derive it when building a proposal with `status == "invalidated"` and `end_reason == "intent_changed"`: for each participant leg match intents by `(event_id, participant_id, offered_clothing_id, wanted_clothing_id == received_clothing_id)` with status in (`declined`,`withdrawn`,`invalidated`) and `updated_at == proposal.ended_at` (causal change), precedence declined > withdrawn > invalidated, else `None`; keep list endpoints free of per-row N+1 beyond the existing pattern
- [x] T004 Document `endDetail` in docs/plans/api/11-proposals.md (`Proposal` schema table row + derivation note + example JSON) per contracts/proposal-end-detail.md

**Checkpoint**: Backend checks green (`cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`).

## Phase 3: User Story 1 - Received/Sent actions only when they apply (P1) 🎯 MVP

**Goal**: No Accept/Decline while a request is a leg of a live proposal or has a confirmed garment; Withdraw while active; plain request statuses.

**Independent Test**: `cd frontend && pnpm test -- trades`.

- [x] T005 [P] [US1] Write failing vitest tests in frontend/src/lib/trades.test.ts for new pure helpers (leg match: proposal participant with `participant.participantId = intent.participantId`, `offeredClothing.id = intent.offeredClothing.id`, `receivedClothing.id = intent.wantedClothing.id`; live = proposal status `pending` or `confirmed`): `isLiveLeg(intent, proposals)`; `isReceivedActionable(intent, proposals, closed)` true only for `status="active"`, not a live leg, both garments `available`, `closed=false` — including an accepted request (`acceptedProposalId` set) whose proposal is now rejected/invalidated/cancelled (re-acceptance allowed); `isSentActionable(intent, closed)` true for `status="active"` and `closed=false` regardless of garment status; `intentStatusLabel(intent, proposals)` → "Item already exchanged" (active and either garment `confirmed`, highest precedence), "Accepted" (active, live leg, `acceptedProposalId` set), "In a proposal" (active, live leg, not accepted — e.g. 3-person legs), "Waiting" (other active), "Declined", "Withdrawn", "Item withdrawn" (status `invalidated`). Also a component test in frontend/src/components/trade/TradesOnboardScreen.test.tsx (create; mirror ProposalDetail.test.tsx mocking) that a received row with a live accepted proposal renders no Accept/Decline buttons
- [x] T006 [US1] Implement to pass T005 in frontend/src/lib/trades.ts and use the helpers in `ReceivedRow`/`SentRow` of frontend/src/components/trade/TradesOnboardScreen.tsx (pass the proposals query data; remove the local `intentStatusLabel`)

## Phase 4: User Story 2 - Faster refresh (P1)

**Goal**: Counterpart changes visible within 5 s (FR-004); poll every 4 s for headroom.

**Independent Test**: vitest asserting the query options; manual two-browser check (quickstart 1).

- [x] T007 [P] [US2] Write failing vitest tests (in frontend/src/lib/api/intents.test.ts and frontend/src/lib/api/proposals.test.ts, mirroring their existing setup) that `useIntentsQuery` and `useProposalsQuery` use `refetchInterval` 4000 when `closed=false` and `false` when `closed=true`, with `refetchOnWindowFocus: true` and `refetchIntervalInBackground: false` (export a small options/interval constant if needed to test without rendering)
- [x] T008 [US2] Implement to pass T007 in frontend/src/lib/api/intents.ts and frontend/src/lib/api/proposals.ts

## Phase 5: User Story 3 - Exchanges shows requests and waiting-for-others (P1)

**Goal**: "Requests", "Awaiting my consent", "Waiting for others", "Confirmed", "History" groups (FR-006–FR-008).

**Independent Test**: `pnpm test -- trades`; manual quickstart 2–3.

- [x] T009 [P] [US3] Write failing vitest tests in frontend/src/lib/trades.test.ts: `groupProposals` returns `{ awaitingMyConsent, waitingForOthers, confirmed, history }`; a pending 2-person proposal with `myResponse="consented"` goes to `waitingForOthers` (update the existing assertion that expects history), same for 3-person; history holds rejected/invalidated/cancelled and unknown non-pending/non-confirmed statuses; `requestStageItems(sent, received, proposals)` returns active requests whose garments are both `available` and that are not a live leg, tagged `direction` and `nextActor` (`'owner'` for sent, `'me'` for received), newest first, excluding declined/withdrawn/invalidated, confirmed-garment, and live-leg requests (cover: accepted 1:1 with its reverse intent, 3-person cycle legs, accepted request whose proposal ended → shown again); `pendingParticipantNames(proposal)` returns display names of non-me participants with `response="pending"`
- [x] T010 [US3] Implement to pass T009 in frontend/src/lib/trades.ts; in frontend/src/components/trade/TradesOnboardScreen.tsx the Exchanges panel renders "Requests" (rows linking to `?tab=sent` / `?tab=received`, text "Waiting for {owner} to answer" / "Waiting for your answer", visually distinct from proposal rows), "Awaiting my consent", "Waiting for others" (shows "Waiting for {names}"), "Confirmed", "History"; empty state only when all groups are empty; loading/error states cover intents and proposals queries; `countTradesBadge` unchanged

## Phase 6: User Story 4 - Plain-language end reasons (P2)

**Goal**: No raw internal names; "Declined" for declined-request endings (FR-009, FR-010).

**Independent Test**: `pnpm test -- trades ProposalDetail`.

- [x] T011 [P] [US4] Write failing tests: in frontend/src/lib/trades.test.ts for `proposalStatusLabel(proposal)` covering every row of research.md R6 (including `endDetail` null → "Request ended" and unknown → "Ended") and `responseLabel(response)` ("Waiting", "Consented", "Rejected"); in frontend/src/components/trade/ProposalDetail.test.tsx that a pending proposal shows "Waiting for consent" and participant responses as "Waiting"/"Consented" and an invalidated `intent_changed`+`intent_declined` proposal shows "Declined", with no raw `pending`/`consented`/`invalidated` text; the existing version-conflict dialog shows a plain label for `currentStatus` (e.g. "Declined"/"Ended", never `invalidated`); update existing Proposal fixtures in tests for the required `endDetail` field
- [x] T012 [US4] Implement to pass T011: add `endDetail: 'intent_declined' | 'intent_withdrawn' | 'intent_invalidated' | null` to frontend/src/types/proposal.ts; helpers in frontend/src/lib/trades.ts; use them in `ProposalRow` (TradesOnboardScreen.tsx) and frontend/src/components/trade/ProposalDetail.tsx (status line, participant responses, "Your response", version-conflict dialog)

- [x] T012a [US1] Review fixes (commit-review 2026-11-04 High #1, Medium #2): test-author writes failing tests — `countTradesBadge(received, proposals, closed)` counts received requests where `isReceivedActionable` is true plus pending proposals awaiting my consent (confirmed-garment request not counted; accepted request whose proposal ended counted again; closed → 0); TradesOnboardScreen Received/Sent tabs show the loading state until the proposals query has loaded (no Accept/Decline while proposals are pending) and an error/retry state if it fails. implementer-fe then updates frontend/src/lib/trades.ts, frontend/src/components/ui/BottomTabBar.tsx (pass full intents, all proposal statuses needed for live legs, closed flag), frontend/src/components/trade/TradesOnboardScreen.tsx, and drops the unused `proposals` prop from `SentRow` if unused

**Checkpoint**: Frontend checks green (`cd frontend && pnpm lint && pnpm typecheck && pnpm test`).

## Phase 7: Design polish

- [x] T013 Run `/impeccable` critique/polish limited to the UI changed in this feature (Trades Received/Sent/Exchanges rows and groups, proposal detail labels) within Astryx rules at 360–430 px; apply fixes via test-author (if behavior changes) → implementer-fe → commit-reviewer. Critique 2026-11-04 (dual-agent, 21/40) fixes:
  - (a) `intentStatusLabel`: a live **confirmed** leg reads "In your confirmed exchange" (checked before "Item already exchanged", which stays for garments confirmed elsewhere); active unanswered sent → "Waiting for {owner} to answer", received → "Your answer needed"; Sent/Received/Exchanges share these labels
  - (b) Proposal rows: label "You give {my offered title} · get {my received title}" (3-person: append " · 3-person swap"); description = status or "Waiting for {names}" for waiting-for-others, the plain end reason for History; no "Version N" and no "Your response" on rows; Requests group lists "Your answer needed" items first
  - (c) Received/Sent rows: actions grouped with their row (not separated by the list divider), Accept `primary` and Decline non-destructive secondary (fixes 3.8:1 contrast), buttons ≥ 44 px tall (`size="lg"`), accessible names include the item ("Accept request for Wool coat", "Decline request for Wool coat", "Withdraw request for Trench coat")
  - (d) Proposal detail: back link "Back to Exchanges" (`routes.trades` + `?tab=exchanges`); terminal non-handover proposals use heading "Exchange ended" with a Banner showing the plain end reason and hide Consent/Reject and per-participant responses; after my consent, Consent is hidden and Reject uses a non-destructive variant; no "Version N" in the status line when version is 1
  - (e) `countTradesBadge` returns 0 when the event is closed (commit-review Low)
## Phase 8: User Story 5 - Exception QA (P2)

- [x] T014 [US5] QA agent restarts backend (Docker) and frontend, runs quickstart.md scenarios 1–9 with computer/browser use and multiple participant sessions, and verifies stored state via the SQLite DB inside the backend container; reports pass/fail with evidence
- [x] T015 [US5] For each QA failure: reproducing test (test-author) → fix (implementer-be/fe) → commit-reviewer → commit; re-run the failed scenario. QA 2026-11-04 (/tmp/vr-qa/report.md): all scenarios PASS on API/DB; one Low — after event closure, active unanswered requests still read "Your answer needed" / "Waiting for {owner} to answer" in Received, Sent and Exchanges. Fix: `intentStatusLabel(intent, proposals, viewerId, closed)` returns "Not answered before the event closed" for active, unanswered, non-live requests when closed (other labels unchanged), and the Exchanges "Requests" group is not shown when the event is closed

## Phase 9: Polish

- [ ] T016 Run full checks and record actual results: `cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`; `cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

## Dependencies

- T002→T003→T004 before T011/T012 (frontend type needs the field contract; T005–T010 can proceed in parallel workspace).
- T005→T006, T007→T008, T009→T010, T011→T012 (Red → Green). T006/T010/T012 edit the same files → run sequentially.
- T013 after T012; T014 after T013; T015 after T014; T016 last.
