# Feature Specification: Register/Read Clothing (Backend)

**Feature Branch**: `speckit-specify-register-read-clothing`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: `"docs/plans/api/06-register-read-clothing.md"`

## Clarifications

### Session 2026-10-30

- Q: Should a description be trimmed of leading and trailing spaces before its 1–1,000 character length is checked and the trimmed version saved, or checked and saved exactly as typed? → A: Trim, then validate and save the trimmed text; space-only descriptions are rejected

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Participant registers a garment with an uploaded photo (Priority: P1)

A participant in an active event who has already uploaded a clothing photo registers a garment by attaching that photo and writing a description. The garment becomes available for exchange in the event right away, and the participant receives the full garment so the next step (AI analysis and review) can begin.

**Why this priority**: Registering garments is the core input of the exchange; without it there is nothing to list, want, or propose.

**Independent Test**: As a joined participant of an active event, upload a photo, register a garment with that photo and a valid description, and confirm the returned garment is available, at content version 1, without analysis, and owned by the caller.

**Acceptance Scenarios**:

1. **Given** an active event and a photo the caller uploaded in it that is not attached to any garment, **When** the caller registers a garment with that photo and a 1–1,000 character description, **Then** a new garment is created and returned with status available, content version 1, no analysis, the caller as owner, marked as the caller's own, and the photo's identity and display location.
2. **Given** a successful registration, **When** the organizer reads the event summary, **Then** its available-garment count includes the new garment (other participants receive no statistics, per the existing event-read rule).
3. **Given** a successful registration, **When** logs are inspected, **Then** exactly one clothing-registered record identifies the garment, event, and description length, and the description text does not appear in any log.

---

### User Story 2 - Invalid or unauthorized registrations are rejected safely (Priority: P1)

Registrations that would break the event boundary, reuse a photo, or carry an invalid description are rejected with a clear reason and leave no garment behind. A repeated submission (for example a double tap) never creates a duplicate garment.

**Why this priority**: Duplicate garments, borrowed photos, or registrations into closed events would corrupt every later matching and exchange step.

**Independent Test**: Attempt registrations with a missing or foreign credential, a nonexistent event, a closed event, someone else's photo, a photo from another event, a nonexistent photo, an already attached photo, and missing/empty/overlong descriptions; verify each error and that no garment was created.

**Acceptance Scenarios**:

1. **Given** a missing or invalid participant credential, **When** a registration is attempted, **Then** an unauthenticated error is returned and no garment is created.
2. **Given** a nonexistent event, or a credential belonging to a different event, **When** a registration is attempted, **Then** a not-found error is returned and no garment is created.
3. **Given** a photo that does not exist, belongs to another event, or was uploaded by another participant, **When** the caller registers with it, **Then** the same not-found error is returned, indistinguishable from a missing resource, and no garment is created.
4. **Given** a closed event, **When** a member attempts a registration, **Then** an event-closed error is returned and no garment is created.
5. **Given** a photo already attached to a garment, **When** the caller registers again with it (including an exact repeat of a successful request), **Then** a photo-already-attached error is returned and no second garment is created.
6. **Given** a missing photo identity, a missing description, an empty description, or a description over 1,000 characters, **When** a registration is attempted, **Then** a validation error is returned and no garment is created.

---

### User Story 3 - Participants browse garments in their event (Priority: P1)

A participant views the garments in their event: their own garments (C1), other participants' garments (B2), or all of them, optionally narrowed by status. Newest garments appear first. Other participants' withdrawn garments are never shown in lists, but the caller still sees their own withdrawn garments in their own list.

**Why this priority**: Browsing is how participants discover garments they want and track what they have offered.

**Independent Test**: With garments from two participants in several statuses, list with each ownership option and status filter and verify contents, order, and visibility rules.

**Acceptance Scenarios**:

1. **Given** garments from the caller and others in one event, **When** the caller lists with ownership "mine", **Then** only the caller's garments are returned, including withdrawn ones, newest first.
2. **Given** the same garments, **When** the caller lists with ownership "others", **Then** only other participants' non-withdrawn garments are returned, newest first.
3. **Given** the same garments, **When** the caller lists with no ownership option or "all", **Then** the caller's garments (including withdrawn) and others' non-withdrawn garments are returned, newest first.
4. **Given** a status filter of one or more statuses, **When** the caller lists, **Then** only garments in those statuses are returned, still subject to the visibility rules.
5. **Given** garments in another event, **When** the caller lists their own event, **Then** none of the other event's garments appear.
6. **Given** an event with no visible garments, **When** the caller lists, **Then** an empty list is returned with no further pages.
7. **Given** an unknown ownership or status value, **When** the caller lists, **Then** a validation error is returned.
8. **Given** a missing or invalid credential, or a nonexistent or foreign event, **When** a list is requested, **Then** an unauthenticated or not-found error is returned respectively.

---

### User Story 4 - Participant views one garment's details (Priority: P2)

A participant opens a single garment (B3 for others' garments, C4 for their own) to see its photo, description, owner, status, and analysis. A garment reached from an intent or proposal that its owner has since withdrawn is still shown with its withdrawn status so the screen can explain what happened.

**Why this priority**: Detail views support decisions but depend on garments already being registered and listed.

**Independent Test**: Read a garment owned by the caller, one owned by another participant, a withdrawn garment owned by another participant, a garment from another event, and a nonexistent garment.

**Acceptance Scenarios**:

1. **Given** a garment in the caller's event, **When** the caller requests it, **Then** the full garment is returned with whether the caller owns it.
2. **Given** another participant's withdrawn garment in the caller's event, **When** the caller requests it, **Then** it is returned with status withdrawn.
3. **Given** a garment in another event or a nonexistent garment, **When** the caller requests it, **Then** the same not-found error is returned.
4. **Given** a missing or invalid credential, **When** a garment is requested, **Then** an unauthenticated error is returned.

### Edge Cases

- A description of exactly 1 character or exactly 1,000 characters is accepted; 0 or 1,001 characters is rejected.
- A description containing only whitespace is treated as empty and rejected.
- Two simultaneous registrations with the same photo create exactly one garment; the other receives photo-already-attached.
- A malformed photo, event, or garment identifier returns not-found rather than a validation error.
- An event closed between the start and end of a registration rejects it as event-closed and creates no garment.
- Reading lists and garment details remains allowed after the event is closed.
- A repeated status filter value (for example the same status twice) behaves the same as giving it once.
- If storing the garment or attaching the photo fails partway, neither a garment nor an attached photo remains, and no success log is recorded.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a participant of an active event register a garment from one photo they uploaded in that event and a description. Verified by User Story 1, scenario 1.
- **FR-002**: A new garment MUST start as available, at content version 1, with no analysis, and the result MUST contain the full garment. Verified by User Story 1, scenario 1.
- **FR-003**: Creating the garment and attaching the photo MUST happen together: either both succeed or neither does. Verified by the partial-failure edge case.
- **FR-004**: Each photo MUST be attached to at most one garment; registering with an attached photo, including repeats and simultaneous requests, MUST produce a photo-already-attached error. Verified by User Story 2, scenario 5 and the concurrency edge case.
- **FR-005**: A photo that does not exist, belongs to another event, or was uploaded by another participant MUST produce a not-found error indistinguishable from a missing resource. Verified by User Story 2, scenario 3.
- **FR-006**: The description MUST be required and 1–1,000 characters after trimming leading and trailing whitespace, and the trimmed text MUST be what is stored; the photo identity MUST be required. Violations MUST produce a validation error. Verified by User Story 2, scenario 6 and the boundary edge cases.
- **FR-007**: Registration in a closed event MUST produce an event-closed error. Reads MUST remain allowed in closed events. Verified by User Story 2, scenario 4 and the closed-event edge case.
- **FR-008**: All three operations MUST require a valid participant credential (unauthenticated error otherwise) and MUST treat a nonexistent event, a foreign event, or a garment in another event as not-found. Verified by User Story 2, scenarios 1–2; User Story 3, scenario 8; User Story 4, scenarios 3–4.
- **FR-009**: The garment list MUST support ownership "mine", "others", and "all" (default "all") and an optional repeatable status filter, ordered newest first, returned as a single complete list with no further pages. Verified by User Story 3, scenarios 1–6.
- **FR-010**: Lists MUST never include other participants' withdrawn garments, and MUST include the caller's own withdrawn garments when the caller's garments are requested. Verified by User Story 3, scenarios 1–3.
- **FR-011**: Unknown ownership or status values MUST produce a validation error. Verified by User Story 3, scenario 7.
- **FR-012**: Garment detail MUST return any garment in the caller's event, including other participants' withdrawn garments with status withdrawn. Verified by User Story 4, scenarios 1–2.
- **FR-013**: Every returned garment MUST include its identity, event, owner (identity, display name, organizer badge), whether the caller owns it, photo identity and display location, description, status, content version, latest analysis or none, and registration and change times. Verified by User Story 1, scenario 1 and User Story 4, scenario 1.
- **FR-014**: The event summary's available-garment count, shown only to the organizer, MUST reflect garments currently in available status. Verified by User Story 1, scenario 2.
- **FR-015**: A successful registration MUST record one clothing-registered log entry with the garment, event, and description length; the description text MUST never be logged. Verified by User Story 1, scenario 3.

### Key Entities

- **Event**: An exchange session with an active/closed state; only active events accept registrations.
- **Participant**: A member of one event; owns garments and photos in that event only. The organizer is a participant shown with a badge.
- **Photo** (existing): An uploaded image owned by its uploader in one event; attached to at most one garment.
- **Clothing**: A garment registered by one owner in one event, with one photo, an owner-written description kept separate from AI estimates, a status (available, confirmed, withdrawn), a content version, and registration/change times.
- **Clothing Analysis** (related, not created here): The latest AI analysis of a garment; absent until the analysis feature runs.
- **Clothing Summary**: A compact form of a garment (identity, owner, photo location, description, status, content version) for embedding in intents, proposals, alternatives, and recommendations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of valid registrations, the participant receives an available garment at content version 1 that immediately appears in their own list and in other participants' lists for the same event.
- **SC-002**: In 100% of invalid or unauthorized registration attempts, the correct error is returned and zero garments are created or photos attached.
- **SC-003**: Repeated or simultaneous registrations with the same photo produce exactly one garment in 100% of tested cases.
- **SC-004**: Foreign-event, foreign-photo, and nonexistent-resource requests return identical not-found responses in 100% of tested cases.
- **SC-005**: Lists never show another participant's withdrawn garment or another event's garment in 100% of tested combinations of ownership and status filters.
- **SC-006**: Zero garment descriptions and zero raw participant credentials appear in logs.

## Assumptions

- Sources are [Register/Read Clothing](../../docs/plans/api/06-register-read-clothing.md), the [API README](../../docs/plans/api/README.md), the [shared API contract](../../docs/rules/dev/common/api-contract.md), the [database design](../../docs/plans/database-design-v1.md), [AI features](../../docs/plans/ai-features-v1.md), and the [Read Event](../../docs/plans/api/02-read-event.md) document. Request/response formats and error codes are defined there.
- Existing event, join, read, close, and photo-upload features supply events, participant credentials, authentication scoping, closure behavior, and photos. They are reused rather than redefined.
- Clothing analysis is delivered by a separate AI feature; until it exists every garment is returned with no analysis. The analysis shape follows the AI features document.
- Description length counts characters, not bytes (trimming is decided in Clarifications).
- Editing, withdrawing, and confirming garments are delivered by other features (07, 12); this feature only reads those statuses.
- The Clothing Summary form is defined here for reuse by later features; no operation in this feature returns it.
- Open decisions from the source stay out of scope: whether C4 shows which participants want the garment, and participant/garment limits per event (none enforced in this version).
- **Backend scope**: This feature delivers the three operations and the stored garment. Registration, list, and detail screens (C1, C2, C4, B2, B3) are outside this feature.
