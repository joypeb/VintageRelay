# Feature Specification: 020 Exchange Requests and Proposals

**Feature Branch**: `feature/020-exchange-requests`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "020 Exchange requests and proposals (backend + frontend). Backend: exchange_intents, trade_proposals, trade_participants tables; pure two-/three-person cycle detection with cycleKey and suppression; exchange request API per docs/plans/api/09-intents.md (register, list sent/received, withdraw, accept creating the reverse intent and the two-person proposal with the accepter's consent, decline), proposal generation and reads per 11, consent/reject with version checks and serialized exclusive confirmation per 12; retrofit clothing edit/withdraw (07) and event close (03) invalidation. Idempotency per api-contract 5-1. Frontend: enable Request exchange on item detail with the offer sheet (I1) and withdraw; Trades tab with Received (accept/decline), Sent, and Exchanges segments; proposal detail (T2) with consent/reject and proposal-changed handling; received requests on My item detail (C4); Trades badge and polling."

> Roadmap ID is 020; the spec directory is `021-exchange-requests` because `specs/020-*` was taken by the 020 AI search spec.

## Clarifications

### Session 2026-11-03

- Q: When a garment is confirmed elsewhere, should its other active requests also be invalidated, or only pending proposals? → A: Only pending proposals (keep current draft rule).
- Q: Proposal ordering in T1 Exchanges? → A: Newest first (`createdAt` descending) as the v1 rule.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Request, accept, and confirm a two-person exchange (Priority: P1)

A participant (requester) sees another participant's garment, picks one of their own available garments as the offer, and sends an exchange request. The owner sees the request, accepts it, and both participants consent to the same proposal version. The exchange becomes confirmed and both garments leave the available pool.

**Why this priority**: The core exchange flow; without it no trade can complete.

**Independent Test**: Seed two participants with one available garment each; send request, accept as owner, consent as requester, and assert a confirmed proposal with both garments confirmed and other pending proposals sharing those garments invalidated.

**Acceptance Scenarios**:

1. **Given** I own an available garment and another participant owns an available garment, **When** I request their garment offering mine, **Then** a request is created and visible to me (Sent) and to the owner (Received) but to nobody else.
2. **Given** an active request, **When** the owner accepts it, **Then** a two-person proposal appears with the owner's consent already recorded, and I only need to consent.
3. **Given** a pending proposal where everyone except me has consented, **When** I consent to the current version, **Then** the exchange becomes confirmed.
4. **Given** I already sent the same offer/want pair, **When** I send it again, **Then** I get the existing request back without a duplicate.
5. **Given** my garment was confirmed in another exchange, **When** I try to request with it, **Then** the request is refused.

---

### User Story 2 - Decline or withdraw a request (Priority: P1)

The owner declines an unwanted request, or the requester withdraws their own request before it is accepted. Declined/withdrawn requests never produce confirmable proposals.

**Why this priority**: Participants must be able to say no and undo their own requests; acceptance is never forced.

**Independent Test**: Create a request, decline it as owner (or withdraw as sender), and assert its status plus that dependent pending proposals are invalidated while confirmed exchanges are untouched.

**Acceptance Scenarios**:

1. **Given** an active request for my garment, **When** I decline it, **Then** its status becomes declined and it stays visible in history.
2. **Given** my sent active request, **When** I withdraw it, **Then** it becomes withdrawn.
3. **Given** a declined request, **When** the owner declines again, **Then** the same declined request returns without changes.
4. **Given** a request I only received, **When** I try to withdraw it, **Then** I am refused and told to use decline.

---

### User Story 3 - Automatic three-person cycle (Priority: P2)

Three participants each want the next person's garment (A wants B, B wants C, C wants A). Once the third request completes the loop, a three-person proposal appears automatically and confirms when all three consent to the same version.

**Why this priority**: The headline differentiator beyond direct swaps; builds on the same request primitive.

**Independent Test**: Seed A→B, B→C intents, then submit C→A and assert a 3-person pending proposal covering all three pairs; consent from all three and assert confirmation.

**Acceptance Scenarios**:

1. **Given** two legs of a three-person loop exist, **When** the third request is sent, **Then** a three-person proposal appears without anyone accepting.
2. **Given** a three-person proposal, **When** all three consent to the current version, **Then** it confirms and all three garments become confirmed.
3. **Given** one participant rejects, **When** rejection lands, **Then** the proposal becomes rejected and the same loop is not immediately re-proposed until something changes.

---

### User Story 4 - Consent to the exact version I reviewed (Priority: P1)

Proposals are versioned. If the garments or requests change while I am reviewing, my consent to the old version is rejected and I see a "proposal changed" notice instead of silently consenting to something new.

**Why this priority**: Prevents consenting to terms the participant never saw; a correctness requirement.

**Independent Test**: Consent with a stale version number and assert a version-mismatch refusal; edit a garment in a pending proposal and assert the old proposal is invalidated and a new version requires fresh consent.

**Acceptance Scenarios**:

1. **Given** a pending proposal at version 2, **When** I consent with version 1, **Then** my consent is refused with the current status and a pointer to the replacement when one exists.
2. **Given** a garment in my pending proposal was edited, **When** I reload, **Then** I see the old proposal as invalidated and a new version awaiting fresh consent.
3. **Given** I already consented to the current version, **When** I consent again, **Then** I get the current proposal back without a duplicate action.

---

### User Story 5 - Trades tab and proposal detail (Priority: P2)

Participants track everything in the Trades tab: Received (accept/decline), Sent (state: waiting, accepted, declined, plus withdraw), and Exchanges (awaiting my consent, found 3-person, confirmed, history). The proposal detail shows who gives/receives what, responses, and version, with Consent/Reject actions and a proposal-changed notice on conflicts. My-item detail shows requests received for that item; the item detail offer sheet lets me pick one of my garments (or prompts me to register one first).

**Why this priority**: Without readable tracking and actions, the backend flow is unusable on mobile.

**Independent Test**: Drive the UI states with seeded requests/proposals (received, sent, pending/consented/confirmed/rejected) and assert accept/decline/consent/reject/withdraw controls, the version-conflict notice path, and the Trades badge count.

**Acceptance Scenarios**:

1. **Given** requests received for my garments, **When** I open Trades → Received, **Then** I can accept or decline each.
2. **Given** my sent requests, **When** I open Trades → Sent, **Then** I see waiting / accepted / declined states and can withdraw an active one.
3. **Given** proposals I participate in, **When** I open Trades → Exchanges, **Then** awaiting-my-consent, 3-person, confirmed, and history groups are distinguishable.
4. **Given** I open a proposal whose version changed underneath me, **When** consent fails with a mismatch, **Then** I see a proposal-changed notice and a reload path.
5. **Given** I own no available garments, **When** I tap Request exchange, **Then** I am guided to register an item first instead of an empty offer sheet.

---

### Edge Cases

- Requesting my own garment is refused as my own clothing.
- Requests and proposals are invisible to uninvolved participants (treated as not found).
- Withdrawing a garment invalidates its active requests and pending proposals; confirmed garments cannot be edited or withdrawn until the exchange is cancelled.
- Closing the event invalidates pending proposals; new requests/consents are refused but replays of already-completed actions still return their stored result.
- A garment confirmed in one exchange blocks confirmation of any other proposal sharing it; the loser is invalidated. Other active requests for the same garment stay active (decided 2026-11-03).
- Proposal ordering in Exchanges history is newest first (`createdAt` descending, decided 2026-11-03).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Participants MUST be able to register an exchange request naming one owned available garment as the offer and one other participant's available garment as the want.
- **FR-002**: The system MUST return the existing active request (no duplicate) when the same offer/want pair is registered again.
- **FR-003**: Participants MUST be able to list their sent requests and requests received for their garments, filtered by status and by wanted garment.
- **FR-004**: Requesters MUST be able to withdraw their own sent requests; owners MUST be able to decline requests for their garments. Both MUST invalidate dependent pending proposals without touching confirmed exchanges.
- **FR-005**: Owners MUST be able to accept a request, which creates (or reuses) the reverse request, creates (or reuses) the two-person proposal for the pair, records the accepter's consent, and lifts re-proposal suppression for that pair.
- **FR-006**: The system MUST detect two-person and three-person cycles from active requests, keyed by a participant/order-independent cycle key, reuse an equal pending proposal, otherwise create the next version, and suppress recreation of rejected/cancelled cycles until an intent or garment content changes.
- **FR-007**: Participants MUST be able to read only proposals they take part in, as a list and as a single versioned proposal showing who gives/receives what, per-participant responses, and which actions are currently allowed.
- **FR-008**: Participants MUST consent or reject only a specific proposal version; consent MUST record per version and confirm the exchange only on unanimous consent to the same version with rechecked intent liveness, ownership, and garment availability.
- **FR-009**: Confirmation MUST be exclusive per garment (no garment in two confirmed exchanges), MUST mark other pending proposals sharing those garments invalidated, and MUST serialize concurrent confirmations and event closure so no confirmation lands after closure.
- **FR-010**: Editing a garment MUST invalidate its pending proposals and re-propose affected cycles as new versions requiring fresh consent; withdrawing a garment MUST invalidate its active requests and pending proposals. Confirming elsewhere invalidates pending proposals only, not other active requests.
- **FR-011**: Closing the event MUST invalidate pending proposals and refuse new requests, consents, rejections, edits, and withdrawals (except idempotent replays).
- **FR-012**: Duplicate state transitions MUST be idempotent with no duplicate rows or side effects, returning the current stored result only when its state/version conditions still hold per contract §5-1: active-pair register → existing intent; withdraw replay of withdrawn/declined/invalidated → `204`; decline replay of declined → `200`; accept replay while its proposal is `pending`/`confirmed` → `200` proposal; consent replay while already consented to that version and proposal `pending`/`confirmed` → `200`; reject replay of `rejected` → `200`. Consent/reject replays against ended proposals follow mismatch/closure rules (FR-008/FR-011), not blanket success.
- **FR-013**: Requests MUST be visible only to the sender and the wanted-garment owner; proposals MUST be visible only to their participants; all others receive not-found.
- **FR-014**: The item detail MUST offer Request exchange with an offer sheet (pick one owned available garment; empty state guides to registration) and Withdraw when a request already exists.
- **FR-015**: The Trades tab MUST show Received (accept/decline), Sent (state + withdraw), and Exchanges (awaiting consent, 3-person, confirmed, history) segments with badge and polling updates.
- **FR-016**: The proposal detail MUST show the cycle, responses, and version with Consent/Reject confirmations and a proposal-changed notice with reload on version conflicts.
- **FR-017**: My-item detail MUST show received requests for that item with accept/decline plus related exchanges; the edit form MUST warn that edits invalidate unconfirmed proposals.

### Key Entities

- **Exchange request (intent)**: Offered garment (mine), wanted garment (theirs), status (active, withdrawn, declined, invalidated), accepted-proposal link; visible only to sender and wanted-garment owner.
- **Proposal**: One version of a two-/three-person cycle; version, status (pending, confirmed, rejected, invalidated, cancelled), end reason, participants each giving one garment and receiving the next, per-participant response; consent applies to one version only.
- **Cycle key**: Order-independent identity of a (participant, offered, received) loop used to reuse pending proposals and suppress immediate re-proposal after rejection/cancellation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two participants complete request → accept → consent → confirmed, and three participants complete an automatic 3-person request → consent → confirmed flow.
- **SC-002**: Concurrent final consents for overlapping proposals confirm at most one proposal per garment; the others are invalidated.
- **SC-003**: Consenting with a stale version is always refused and surfaces a proposal-changed path; old consents never apply to new versions.
- **SC-004**: Requests and proposals are unreachable (not found) for participants outside them, verified by cross-participant read attempts.
- **SC-005**: On mobile, a participant can send, accept/decline, withdraw, consent/reject, and track requests and proposals across Received/Sent/Exchanges with visible state changes and badge updates.

## Assumptions

- Event creation/participation, garment registration/edit/withdrawal, search, and auth already exist (015–019 done); this feature adds requests/proposals on top.
- Cancellation and handover views are out of scope (021); alternative suggestions and counter-offers stay deferred.
- Proposal history ordering is newest first (`createdAt` descending, decided 2026-11-03).
- Confirming elsewhere invalidates pending proposals only; other active requests for the same garment stay active (decided 2026-11-03). API 09/11 open-decision notes defer to these two decisions for v1.
