# Feature Specification: Read Event

**Feature Branch**: `003-read-event`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "docs/plans/api/02-read-event.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Participant sees the event they are in (Priority: P1)

A participant (organizer or regular) opens the app on their device. Using the session credential they received when creating or joining the event, the app fetches the event and shows its name, active/closed state, and who the caller is (their display name and whether they are the organizer). This powers the event banner on the home screen (P2) and decides whether the organizer's manage card is shown.

**Why this priority**: Every in-event screen needs to know which event the participant is in, whether it is still active, and the caller's role. Without this, the home screen cannot render.

**Independent Test**: Create an event, then read it with the organizer's credential and with a regular participant's credential; verify the event details and the caller info (participant ID, display name, organizer flag) match the caller.

**Acceptance Scenarios**:

1. **Given** an active event and a valid credential of a regular participant "Joon", **When** the participant reads the event, **Then** the result includes the event's ID, name, status `active`, entry code, join link, organizer participant ID, creation time, closure time = none, and caller info with display name "Joon" and organizer flag = false.
2. **Given** an active event and the organizer's valid credential, **When** the organizer reads the event, **Then** the caller info shows the organizer's participant ID and display name with organizer flag = true.
3. **Given** any participant of the event, **When** they read the event, **Then** the entry code and join link are included so anyone can share the event.
4. **Given** an event is read twice with no changes in between, **When** results are compared, **Then** they are identical and nothing in the event changed (the read has no side effects).

---

### User Story 2 - Organizer sees event summary counts (Priority: P1)

The organizer opens the manage screen (M1) and sees how many people have joined, how many garments are currently available, and how many exchanges are confirmed. Regular participants do not see these counts.

**Why this priority**: M1 is the organizer's only operational view of the event and is required before closing the event; hiding counts from others keeps organizer-only information private.

**Independent Test**: Read the event as the organizer and as a regular participant; verify counts appear only for the organizer and reflect the current stored data.

**Acceptance Scenarios**:

1. **Given** a freshly created event with only the organizer, **When** the organizer reads it, **Then** the summary shows 1 participant, 0 available garments, and 0 confirmed exchanges.
2. **Given** an event with 3 participants (including the organizer), **When** the organizer reads it, **Then** the participant count is 3.
3. **Given** garments in various states, **When** the organizer reads the event, **Then** only garments currently available are counted; and only exchanges in the confirmed state are counted.
4. **Given** a regular participant, **When** they read the event, **Then** the summary is empty (none), not zero counts.

---

### User Story 3 - Closed event remains readable (Priority: P2)

After the organizer closes the event, participants can still open the app and read the event. The result shows status `closed` and the closure time, so every screen can show the closed-event banner and disable exchange actions.

**Why this priority**: Participants need to see confirmed results after closure and understand why actions are disabled, but this only matters at the end of the event.

**Independent Test**: Put an event in the closed state, read it with a participant credential, and verify status and closure time are returned.

**Acceptance Scenarios**:

1. **Given** a closed event, **When** any of its participants reads it, **Then** the read succeeds with status `closed` and a non-empty closure time.
2. **Given** a closed event, **When** the organizer reads it, **Then** the summary counts are still returned.

---

### User Story 4 - Unauthorized reads are rejected (Priority: P2)

Requests without a valid credential, or with a credential belonging to a different event, cannot read the event. A credential for another event never reveals whether the requested event exists.

**Why this priority**: Protects event information and prevents probing other events, but the happy path delivers the core value.

**Independent Test**: Send reads with no credential, a malformed/unknown credential, another event's credential, and a non-existent event ID; verify the error category for each.

**Acceptance Scenarios**:

1. **Given** no credential, **When** the event is read, **Then** an unauthenticated error is returned.
2. **Given** a malformed or unknown credential, **When** the event is read, **Then** an unauthenticated error is returned.
3. **Given** a valid credential for event A, **When** event B is read, **Then** a not-found error is returned, identical to reading an event that does not exist.
4. **Given** a valid credential, **When** a non-existent event ID (including a value that is not a valid event ID format) is read, **Then** a not-found error is returned.

---

### Edge Cases

- Credential check precedes the event lookup: a missing/unknown credential returns unauthenticated even for an event ID that does not exist.
- An event ID that is not in the valid ID format is treated as not found (not a validation error), so malformed IDs and missing events are indistinguishable.
- A credential for another event receives not-found whether or not the requested event exists.
- The `Authorization` header with a scheme other than Bearer, an empty token, or extra whitespace-only value is treated as a missing/invalid credential (unauthenticated).
- Withdrawn garments and garments not currently available (e.g., reserved or handed over) are excluded from the available-garment count.
- Exchanges that are proposed, rejected, invalidated, or canceled are excluded from the confirmed-exchange count; a canceled exchange stops being counted once canceled.
- Features that create garments or exchanges may not exist yet; counts then reflect only what is stored (0 when none).
- The read never returns any session credential, and never returns the raw credential of anyone.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let a participant read an event by its ID when they present their own valid session credential as a bearer credential.
- **FR-002**: System MUST resolve the caller from the credential by matching its one-way hash against stored participants; the raw credential is never stored or logged.
- **FR-003**: System MUST return `401 UNAUTHENTICATED` when the credential is missing, malformed, or unknown, before checking whether the event exists.
- **FR-004**: System MUST return `404 NOT_FOUND` when the event does not exist, the event ID is not a valid ID, or the credential belongs to a different event; these cases MUST be indistinguishable to the caller.
- **FR-005**: System MUST return the event in the shared event shape: ID, name, status (`active` or `closed`), entry code, join link, organizer participant ID, creation time, closure time (none while active), caller info (participant ID, display name, organizer flag), and organizer summary.
- **FR-006**: System MUST set the caller's organizer flag to true if and only if the caller's participant ID equals the event's organizer participant ID.
- **FR-007**: System MUST return the summary only to the organizer, with participant count (including the organizer), count of garments currently available, and count of exchanges currently confirmed; for any other participant the summary MUST be empty (none).
- **FR-008**: System MUST return the entry code and join link to every participant of the event, with the join link built the same way as at creation (`{public app origin}/join?code={entryCode}`).
- **FR-009**: System MUST allow reading a closed event and return status `closed` with its closure time.
- **FR-010**: System MUST NOT change any stored data when reading the event.
- **FR-011**: System MUST NOT include any session credential in the result.
- **FR-012**: System MUST follow the shared error format and codes defined in `docs/rules/dev/common/api-contract.md` (`UNAUTHENTICATED`, `NOT_FOUND`, `INTERNAL_ERROR`) and document those error responses for this operation in the published API schema.
- **FR-013**: System MUST return the same event shape as the create-event result (feature 001) so clients can reuse one event model.

### Key Entities

- **Event**: Exchange corner session with ID, name, status (active/closed), entry code, organizer participant reference, creation time, closure time.
- **Participant**: A person in one event with ID, display name, and hashed session credential; the caller is resolved to one participant.
- **Caller info ("me")**: The caller's participant ID, display name, and organizer flag, derived per request.
- **Event summary ("stats")**: Organizer-only counts of participants, available garments, and confirmed exchanges, computed at read time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of reads with a valid credential for the requested event return the event with caller info matching the credential holder.
- **SC-002**: 0 reads by non-organizers expose summary counts; 100% of organizer reads include counts matching stored data.
- **SC-003**: 100% of reads with a credential from another event, a non-existent event, or a malformed event ID return the same not-found error, revealing nothing about event existence.
- **SC-004**: 100% of reads without a valid credential return an unauthenticated error.
- **SC-005**: Closed events remain readable by their participants in 100% of cases, with the closed state shown.
- **SC-006**: Event reads respond within 1 second for 95% of requests under expected event-day load (verified locally with 100 requests from 5 concurrent clients).

## Assumptions

- Authentication follows the decided bearer-token rules in `docs/plans/api/README.md` and `docs/rules/dev/common/api-contract.md`; the credential-resolution behavior built here is reused by later authenticated endpoints.
- "Available" garments and "confirmed" exchanges use the status values defined in the database design (`clothing.status = available`, `proposals.status = confirmed`). If those tables are not yet implemented, counts reflect stored data only.
- Closing the event is a separate feature (03); this feature only reads the closed state.
- **Out of scope (open decisions):** how long a closed event stays readable and record retention; session recovery on another device.
- The P2 banner, M1 counts, and closed-event banner are frontend concerns; this feature specifies the read behavior they rely on.
