# Feature Specification: Close Event (Backend)

**Feature Branch**: `docs/backend-close-event-spec`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: `"docs/plans/api/03-close-event.md" backend`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organizer ends an active event (Priority: P1)

The organizer closes the clothing exchange corner when the event finishes. They receive the event's current details with a closed state and closure time, so participants can understand that exchanging has ended.

**Why this priority**: Closure establishes the boundary after which participants cannot start or change exchanges.

**Independent Test**: Create an event, close it as its organizer, and read it again to verify the persisted closed state and original event details.

**Acceptance Scenarios**:

1. **Given** an active event and its organizer's valid credential, **When** the organizer closes it, **Then** the event becomes closed with a closure time and the result includes its identity, name, entry information, organizer identity, creation time, caller information, and current organizer summary.
2. **Given** an event containing only the organizer and no garments or proposals, **When** the organizer closes it, **Then** closure succeeds and the summary reports one participant, zero available garments, and zero confirmed exchanges.
3. **Given** a closed event, **When** an authorized participant reads it, **Then** its state and closure time agree with the closure result.

---

### User Story 2 - Only the event's organizer can close it (Priority: P1)

Participants can trust that another participant or someone from another event cannot end their exchange corner.

**Why this priority**: An unauthorized closure would stop every participant's exchange activity.

**Independent Test**: Attempt closure with missing, invalid, regular-participant, and other-event credentials, and verify both the error category and unchanged event state.

**Acceptance Scenarios**:

1. **Given** a missing, malformed, or unknown credential, **When** closure is requested, **Then** an unauthenticated error is returned before event existence is disclosed.
2. **Given** a valid credential belonging to another event, **When** closure is requested, **Then** a not-found error is returned without revealing whether the target event exists.
3. **Given** a valid credential and a nonexistent or malformed event identifier, **When** closure is requested, **Then** a not-found error is returned.
4. **Given** a regular participant in the target event, **When** they request closure, **Then** a forbidden error is returned and nothing changes, whether the event is active or already closed.
5. **Given** only an entry code or join link without a participant credential, **When** closure is requested, **Then** the request is unauthenticated.

---

### User Story 3 - Repeated or interrupted closure stays consistent (Priority: P1)

The organizer can repeat a closure request after a double tap or lost response without changing the original closure time or applying closure effects twice. If closure fails, participants do not encounter a partly closed event.

**Why this priority**: Mobile retransmissions and failures must not corrupt the event's final state.

**Independent Test**: Repeat closure sequentially and concurrently, then simulate failure during the first closure and verify that either all closure effects succeed or none do.

**Acceptance Scenarios**:

1. **Given** an already closed event, **When** its organizer requests closure again, **Then** the request succeeds with the current event, preserves the original closure time, and creates no additional closure activity record or state changes.
2. **Given** an active event, **When** two organizer closure requests overlap, **Then** both successful results describe the same closure and exactly one closure activity record exists.
3. **Given** a failure before closure finishes, **When** the organizer receives the failure, **Then** the event remains active and every related record retains its previous state; a later retry can succeed.

---

### User Story 4 - Closure protects exchange outcomes (Priority: P1)

Participants cannot finalize or change exchanges after closure, while permitted reads and successful-action replays continue to work. The source document's proposed first-version behavior also ends pending proposals and preserves confirmed exchanges for viewing.

**Why this priority**: Closure must have one unambiguous boundary with final consent, and must not erase a participant's confirmed exchange.

**Independent Test**: Exercise closure against final consent in both orders, check post-closure actions and replays, and inspect pending and confirmed records under the proposed proposal-handling policy.

**Acceptance Scenarios**:

1. **Given** closure finishes before a new final consent is processed, **When** that consent is attempted, **Then** it fails because the event is closed and no exchange is confirmed.
2. **Given** unanimous consent validly confirms an exchange before closure, **When** closure finishes, **Then** that exchange stays confirmed with its original participants, garments, and confirmation details under the proposed preservation policy.
3. **Given** pending proposals, **When** closure succeeds under the proposed invalidation policy, **Then** all pending proposals in that event become invalidated with the event-closed reason and an ending time; proposals in other events and already terminal proposals do not change.
4. **Given** a closed event, **When** a participant attempts a new exchange-related action or asks for AI recommendations, **Then** the action fails because the event is closed and makes no state change.
5. **Given** a closed event and an action qualifying as a successful replay under the shared contract, **When** an authorized caller repeats it, **Then** its normal success result is returned without new state changes.
6. **Given** a pending proposal with recorded consent that closure invalidates under the proposed policy, **When** that consent is repeated, **Then** it fails because the event is closed; an invalidated proposal does not qualify for a consent replay.
7. **Given** a closed event and an authorized participant, **When** they read existing records or decline an alternative suggestion without storing anything, **Then** the operation remains available under the source document's proposed read-access policy and existing visibility rules.

### Edge Cases

- Organizer authorization is checked before a closed-event replay: regular participants cannot obtain closure success by targeting an already closed event.
- No pending proposals is a valid closure case, including when proposal functionality is not yet available.
- Already rejected, invalidated, or cancelled proposals retain their existing reasons and timestamps; closure does not rewrite history.
- Concurrent closure and final consent have one consistent order: confirmation either finishes before closure or is rejected after closure; partial confirmation is never visible.
- A recorded consent is a replay only for the same proposal version while the proposal remains pending or confirmed. Recorded consent alone does not bypass closure.
- A repeated closure returns current summary counts rather than assuming every field equals a previously received response.
- Closure does not mark physical handover complete, release confirmed garments, or reopen the event.
- Failures leave no successful closure activity record and no partly applied proposal changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow only the participant identified as the target event's organizer to close it using their existing participant credential. Entry information MUST NOT grant organizer authority. Verified by User Stories 1 and 2.
- **FR-002**: The system MUST check credential validity, event existence and scope, and organizer authority before considering an already-closed request a successful replay. Missing or invalid credentials, inaccessible or missing events, and same-event non-organizers MUST produce the respective unauthenticated, not-found, and forbidden error categories defined by the shared contract. Verified by User Story 2 and the first edge case.
- **FR-003**: Successful initial closure MUST persist a closed state and a nonempty closure time, leaving the event's identity, name, entry information, organizer, and creation time unchanged. Verified by User Story 1.
- **FR-004**: Initial closure and successful replays MUST return the current event details in the existing read-event shape, including organizer caller information and summary counts. Credentials MUST NOT be exposed. Verified by User Stories 1 and 3.
- **FR-005**: Repeated and concurrent organizer closure requests MUST be idempotent: preserve the first closure time, apply closure effects once, and record successful closure once with the event identity and number of pending proposals invalidated. Verified by User Story 3.
- **FR-006**: All closure effects MUST succeed or fail together. A failed first closure MUST report an internal failure, retain the active state and original related records, and permit a later valid retry. Verified by User Story 3.
- **FR-007**: Closure and final consent MUST have a single consistent processing order. New consent processed after successful closure MUST NOT confirm an exchange; an exchange validly confirmed before closure MUST NOT be retroactively treated as pending. Verified by User Story 4, scenarios 1 and 2.
- **FR-008**: After closure, the system MUST reject new participation, photo uploads, garment registration/editing/withdrawal, preference changes, AI analysis/interpretation, intent registration/withdrawal, alternative acceptance, proposal consent/rejection, exchange confirmation/cancellation, and AI recommendations as event-closed actions, subject to FR-009. Verified by User Story 4, scenario 4, for each available operation.
- **FR-009**: Authorized successful-action replays MUST retain their normal results after closure as defined by the shared contract, without duplicate effects. A consent replay MUST require recorded consent to the same version of a pending or confirmed proposal; invalidated proposals MUST NOT qualify. Local-only alternative rejection MUST remain a successful no-change action. Verified by User Story 4, scenarios 5–7.
- **FR-010 (Proposed policy)**: If the source document's pending-proposal policy is approved for implementation, closure MUST invalidate every pending proposal in the target event with an event-closed reason and ending time as part of the same all-or-nothing closure. Already terminal proposals and other events MUST remain unchanged. Verified by User Story 4, scenario 3.
- **FR-011 (Proposed policy)**: If the source document's record-preservation policy is approved for implementation, closure MUST preserve confirmed proposals, garment confirmation associations, and existing participant access to records under their normal visibility rules. AI recommendations remain excluded by FR-008. Verified by User Story 4, scenarios 2 and 7.
- **FR-012**: Closure MUST NOT reopen an event, record physical handover completion, or imply that confirmation means physical handover has occurred. Verified by comparing event and exchange records before and after closure.

### Key Entities

- **Event**: A neighborhood exchange session with an organizer, active/closed state, creation time, and a single closure time.
- **Participant**: A person authenticated within one event; only the organizer participant has closure authority.
- **Exchange proposal**: A versioned exchange involving participants and garments, with a state, ending reason, and relevant times. Pending proposals may end on closure under the proposed policy.
- **Confirmed exchange**: A proposal with unanimous consent and associated confirmed garments; confirmation is separate from physical handover.
- **Closure activity record**: A single record of successful initial closure identifying the event and the number of proposals invalidated, without session secrets or participant free text.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of valid initial closure scenarios, the organizer receives the closed event with a closure time and matching event identity, caller information, and summary.
- **SC-002**: Zero unauthorized closure attempts change event or exchange records, including attempts against already closed events.
- **SC-003**: Across sequential and overlapping repeat requests, each event has exactly one original closure time and one successful closure activity record.
- **SC-004**: In 100% of failure scenarios before closure completes, participants retain the original active event and unchanged exchange records.
- **SC-005**: Across both tested closure/final-consent orderings, zero exchanges are newly confirmed after closure and zero earlier valid confirmations are lost under the proposed preservation policy.
- **SC-006**: In 100% of applicable post-closure acceptance scenarios, new exchange actions are blocked while authorized qualifying replays and permitted reads succeed.
- **SC-007**: Under the proposed proposal-handling policy, 100% of target-event pending proposals end on successful closure, with zero changes to already terminal proposals or other events.

## Assumptions

- Sources are [Close Event](../../docs/plans/api/03-close-event.md), the [initial development plan](../../docs/plans/vintage-relay-plan-v1.md), the [shared API contract](../../docs/rules/dev/common/api-contract.md), and the [proposal lifecycle and check order](../../docs/plans/api/README.md). This specification describes user-visible behavior; operation formats and implementation choices remain in those contracts and subsequent planning artifacts.
- Existing create-event and read-event features supply event identity, participant authentication, organizer identity, and the shared event result. No new authentication or organizer recovery mechanism is introduced.
- **Proposal policies remain proposed**: FR-010 and FR-011 describe the source document's initial design, not newly settled business rules. Planning must explicitly identify their approval dependency before implementation; writing this specification does not resolve that dependency.
- **Backend scope**: Deliver the closure behavior and its integration with currently available capabilities. The post-closure rules are acceptance obligations for affected operations as they become available; this feature does not require building all missing garment, intent, proposal, or AI features. Planning must identify which integrations can be verified now and which depend on later features, including final-consent concurrency.
- Frontend manage/confirmation screens, banners, and client navigation are outside this backend feature.
- Reopening is excluded from v1. Handover recording after closure, partial-handover cancellation, session recovery, event/photo retention, and the duration of post-closure read access remain open and outside this feature. No unlimited retention or permanent access is promised.
