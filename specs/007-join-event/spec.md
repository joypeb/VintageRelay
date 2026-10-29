# Feature Specification: Join Event (Backend)

**Feature Branch**: `feature/backend-join-event`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: `"docs/plans/api/04-join-event.md" backend develop`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visitor previews an event from its entry code (Priority: P1)

A visitor scans the QR code or types the entry code at the clothing exchange corner. Before choosing a display name, they see the event's name and whether it is still accepting participants, so they know they are joining the right event.

**Why this priority**: The preview is the first step of every join and confirms the visitor has the correct code.

**Independent Test**: Create an event, look it up with its entry code in different letter cases and with surrounding spaces, and look up an unknown code.

**Acceptance Scenarios**:

1. **Given** an active event, **When** a visitor looks up its entry code, **Then** they receive the event's identity, name, and active state, and nothing else about the event.
2. **Given** an active event, **When** the code is entered in a different letter case or with leading/trailing spaces, **Then** the same event is returned.
3. **Given** a closed event, **When** a visitor looks up its code, **Then** the event is returned with its closed state so the visitor can be told joining is unavailable.
4. **Given** no event uses the code, **When** a visitor looks it up, **Then** a not-found error is returned with the message "We couldn't find an event with this code. Check the code and try again."
5. **Given** any lookup, **When** it is processed, **Then** no participant credential is required and no participant is created.

---

### User Story 2 - Visitor joins with a display name (Priority: P1)

After the preview, the visitor enters a display name and joins. They become a regular participant of that event and receive a personal credential they use for all later actions in it.

**Why this priority**: Joining is how every non-organizer participant enters the exchange.

**Independent Test**: Join an active event with its entry code and a valid name, then read the event with the returned credential.

**Acceptance Scenarios**:

1. **Given** an active event and its correct entry code, **When** a visitor joins with a valid display name, **Then** a new participant is created and the result contains the event in the shared event-session shape, caller information marking them as a non-organizer, no organizer summary, and a new participant credential.
2. **Given** a successful join, **When** the participant reads the event with the returned credential, **Then** access succeeds as a regular participant of that event only.
3. **Given** a display name with leading/trailing spaces, **When** the visitor joins, **Then** the stored name is trimmed.
4. **Given** the entry code in a different letter case, **When** the visitor joins, **Then** the join succeeds.

---

### User Story 3 - Invalid or unavailable joins are rejected safely (Priority: P1)

The event's participants are protected from joins through guessed codes or wrong events, and visitors receive clear reasons when they cannot join.

**Why this priority**: Joins without the correct code, or into closed events, would break the event's entry boundary and closure rules.

**Independent Test**: Attempt joins with missing/invalid fields, a wrong code, a nonexistent or malformed event identifier, a closed event, and a duplicate name; verify the error and that no participant is created.

**Acceptance Scenarios**:

1. **Given** a missing entry code or display name, or a name that is empty or longer than 30 characters after trimming, **When** a visitor joins, **Then** a validation error is returned.
2. **Given** an entry code that does not match the target event, **When** a visitor joins, **Then** the same not-found response is returned as for a nonexistent event, so the event's existence is not revealed.
3. **Given** a nonexistent or malformed event identifier, **When** a visitor joins, **Then** a not-found error is returned.
4. **Given** a closed event and its correct code, **When** a visitor joins, **Then** an event-closed error is returned.
5. **Given** a display name already used in the event, ignoring letter case and surrounding spaces, **When** a visitor joins, **Then** a display-name-taken error identifying the display name field is returned.
6. **Given** any rejected join, **When** the error is returned, **Then** no participant or credential is created.

---

### User Story 4 - Join credentials and logs protect participants (Priority: P2)

Participant credentials are never stored raw, logged, or returned again; entry codes are never logged raw. Entry codes remain stored and visible to authenticated participants, as with event creation.

**Why this priority**: Leaked credentials would let someone act as a participant; leaked codes would let outsiders join.

**Independent Test**: Join, then inspect stored participant data, log output, and later responses; issue many rapid lookups from one client.

**Acceptance Scenarios**:

1. **Given** a successful join, **When** stored data is inspected, **Then** only a non-reversible fingerprint of the credential is stored, never the credential itself.
2. **Given** lookups and joins, **When** logs are inspected, **Then** no raw credential or raw entry code appears; entry codes, if logged, are masked.
3. **Given** a successful join, **When** it is logged, **Then** one participant-joined record identifies the event and new participant.
4. **Given** a successful join, **When** the participant later reads the event, **Then** the credential is not returned again.

### Edge Cases

- Two visitors join concurrently with names that differ only in letter case: exactly one succeeds and the other receives display-name-taken.
- A display name matching the organizer's name, ignoring case, is rejected as taken.
- Names of exactly 1 and 30 characters after trimming are accepted; whitespace-only names are rejected.
- Repeated join requests are not idempotent: each success creates a separate participant; a repeat with the same name fails as taken.
- Joining from a new device with the same person creates a new participant; no recovery of an earlier participant is offered.
- A credential supplied on lookup or join is ignored; it neither grants nor blocks access.
- An event closed between preview and join rejects the join as event-closed.
- If creating the participant fails partway, no participant without a stored credential fingerprint remains, and no success record is logged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let anyone look up an event by entry code without a participant credential, matching codes case-insensitively after trimming. Verified by User Story 1.
- **FR-002**: The lookup MUST return only the event's identity, name, and active/closed state, including for closed events. Verified by User Story 1, scenarios 1 and 3.
- **FR-003**: An unknown entry code MUST produce a not-found error with the message defined in the source document. Verified by User Story 1, scenario 4.
- **FR-004**: The system MUST let a visitor join an event by supplying the event identity, its entry code, and a display name, without a participant credential. Verified by User Story 2.
- **FR-005**: The display name MUST be 1–30 characters after trimming and unique within the event ignoring letter case; it is stored trimmed. Violations MUST produce validation or display-name-taken errors as defined by the shared contract. Verified by User Stories 2 and 3 and the edge cases.
- **FR-006**: The entry code check MUST be case-insensitive, and the supplied code MUST be compared in constant time. A wrong code and a nonexistent event MUST produce not-found responses with identical status, code, message, and details (excluding the correlation ID). Verified by User Story 3, scenarios 2 and 3.
- **FR-007**: Joining a closed event MUST produce an event-closed error, checked after the code is verified. Verified by User Story 3, scenario 4.
- **FR-008**: A successful join MUST create one regular (non-organizer) participant and issue a new credential returned only in that response, in the same event-session shape used by event creation, with caller information marking a non-organizer and no organizer summary. Verified by User Story 2.
- **FR-009**: Creating the participant and storing its credential fingerprint MUST succeed or fail together; the raw credential MUST never be stored. Verified by User Story 4, scenario 1, and the partial-failure edge case.
- **FR-010**: Concurrent joins MUST NOT produce two participants with the same case-insensitive display name in one event. Verified by the concurrency edge case.
- **FR-011**: A successful join MUST record one participant-joined log entry with the event and participant identities. Raw credentials and raw entry codes MUST NOT be logged. Verified by User Story 4, scenarios 2 and 3.
- **FR-012**: Rejected lookups and joins MUST NOT create participants or credentials. Verified by User Story 3, scenario 6.
- **FR-013 (SHOULD)**: The system should limit entry-code lookups per client network address to slow code guessing. Verified by issuing rapid lookups from one address if implemented.

### Key Entities

- **Event**: An exchange session with a name, entry code, active/closed state, and organizer.
- **Entry code**: A human-entered value granting entry to one event; it is not an identifier and never authenticates later requests.
- **Participant**: A person in one event with a display name unique in that event; joined participants are not organizers.
- **Participant credential**: A secret issued once on join that identifies one participant in one event; only its fingerprint is stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of valid lookups, visitors see the correct event name and state, regardless of code letter case or surrounding spaces.
- **SC-002**: In 100% of valid joins, the new participant can immediately read the event as a non-organizer using the issued credential.
- **SC-003**: Wrong-code and nonexistent-event join attempts return identical status, code, message, and details (excluding the correlation ID) in 100% of tested cases.
- **SC-004**: Zero rejected joins create participants, and zero events contain two participants with case-insensitively equal display names, including under concurrent joins.
- **SC-005**: Zero raw credentials or raw entry codes appear in stored participant data or logs.
- **SC-006**: A client can complete joining with two backend calls: preview, then join.

## Assumptions

- Sources are [Join Event](../../docs/plans/api/04-join-event.md), the [API README](../../docs/plans/api/README.md), the [shared API contract](../../docs/rules/dev/common/api-contract.md), the [database design](../../docs/plans/database-design-v1.md), and the [initial development plan](../../docs/plans/vintage-relay-plan-v1.md). Request/response formats and error codes are defined there.
- Existing create-event, read-event, and close-event features supply events, entry codes, credential issuing/fingerprinting, participant authentication, and the shared event-session result. They are reused rather than redefined.
- **Rate limiting is a SHOULD**: FR-013 may be deferred in this prototype if planning finds it disproportionate; any deferral must be recorded in planning. Its limits are not defined by the source and must be chosen during planning.
- Join's not-found responses reuse the lookup message fixed by the source.
- **Backend scope**: This feature delivers the two backend operations. The participant entry screen, code entry, and QR handling are outside this feature.
- Returning-participant verification and session recovery remain open decisions and outside this feature. Participant limits per event remain undecided; no limit is enforced.
