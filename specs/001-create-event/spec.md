# Feature Specification: Create Event

**Feature Branch**: `001-create-event`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "docs/plans/api/01-create-event.md"

## Clarifications

### Session 2026-10-28

- Q: How is a "character" counted for the 60/30-character limits? → A: Unicode code points (a Korean syllable is 1; a composed emoji may count as several).
- Q: What field-level reason is used when a value has the wrong type? → A: New reason `invalid_type`; an explicit `null` is treated as missing (`required`).
- Q: How are control characters (newline, tab, etc.) left inside a name after trimming handled? → A: Rejected with new reason `invalid_characters`.
- Q: How are unknown request fields handled? → A: Rejected, following the backend rule that unknown request fields produce 422; each unknown field is reported with new reason `unknown_field`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organizer creates an active event (Priority: P1)

A person running a clothing exchange corner at a neighborhood event opens the app, enters an event name and their own display name on the create screen (H1), and submits. The event is created and active immediately, the creator is registered as the event's organizer participant, and they receive a private session credential that lets them act as the organizer from this device. They land on the created/share screen (H2).

**Why this priority**: Every other flow (joining, registering clothing, exchanges, closing) depends on an event existing with an organizer. Without this, nothing else can be used.

**Independent Test**: Submit a valid event name and organizer display name; verify that an active event is returned with the creator recorded as organizer, that the caller is identified as the organizer, and that the returned session credential resolves to the organizer participant.

**Acceptance Scenarios**:

1. **Given** no prior session, **When** a visitor submits event name "Mangwon Flea Market Swap Corner" and display name "Mina", **Then** a new event is created with status active, the creator is its organizer participant, the response identifies the caller as the organizer ("Mina"), and a session credential is returned.
2. **Given** a successfully created event, **When** the returned session credential is resolved by the system, **Then** it identifies the organizer participant of that event (and the stored value is a hash, not the raw credential).
3. **Given** a successfully created event, **When** its summary counts are inspected, **Then** it shows 1 participant (the organizer), 0 available garments, and 0 confirmed exchanges.
4. **Given** inputs with leading/trailing whitespace (e.g., "  Mina  "), **When** the event is created, **Then** the stored and returned values are trimmed ("Mina").

---

### User Story 2 - Organizer shares the event entry (Priority: P1)

Right after creation, the organizer needs something to share so others can join: a short entry code and a join link (from which the frontend renders a QR code).

**Why this priority**: An event no one can join has no value; sharing is the immediate next step on H2 and is part of the same creation result.

**Independent Test**: Create an event and verify the result includes an entry code in the agreed format and a join link that embeds that code and points to the public app origin.

**Acceptance Scenarios**:

1. **Given** a successful creation, **When** the result is returned, **Then** it includes a 6-character entry code using only unambiguous characters (no 0, O, 1, I) in uppercase.
2. **Given** a successful creation, **When** the result is returned, **Then** it includes a join link of the form `{public app origin}/join?code={entryCode}`.
3. **Given** many events already exist, **When** a new event is created, **Then** its entry code differs from every existing event's entry code.

---

### User Story 3 - Invalid input is rejected clearly (Priority: P2)

If the organizer submits missing, blank, or overly long values, or a malformed request, they receive a clear error identifying which field is wrong and why, and nothing is created.

**Why this priority**: Prevents broken events and lets the H1 screen show field-level feedback, but the happy path delivers the core value.

**Independent Test**: Submit each invalid input variant and verify the error category, the per-field reason, and that no event or participant was persisted.

**Acceptance Scenarios**:

1. **Given** a request missing `name` or `organizerDisplayName`, **When** submitted, **Then** a validation error is returned with that field marked `required`, and nothing is created.
2. **Given** a field that is only whitespace, **When** submitted, **Then** a validation error is returned with that field marked `required`.
3. **Given** an event name longer than 60 characters or a display name longer than 30 characters after trimming, **When** submitted, **Then** a validation error is returned with that field marked `too_long`.
4. **Given** a request body that is not valid structured data (malformed JSON), **When** submitted, **Then** a bad-request error is returned and nothing is created.
5. **Given** a field whose value is a number instead of text, **When** submitted, **Then** a validation error is returned with that field marked `invalid_type`; if the value is `null`, it is marked `required`.
6. **Given** a name that still contains a newline or tab after trimming (e.g., "Mina\nKim"), **When** submitted, **Then** a validation error is returned with that field marked `invalid_characters`.
7. **Given** both fields are invalid, **When** submitted, **Then** the error lists every invalid field.
8. **Given** a request with an extra field not defined for event creation (e.g., `"theme": "denim"`), **When** submitted, **Then** a validation error is returned with that field marked `unknown_field`, and nothing is created.

---

### User Story 4 - Creation is all-or-nothing (Priority: P2)

If anything fails while creating the event, the organizer participant, or linking the two, the whole creation is undone so there is never an active event without an organizer.

**Why this priority**: Protects data integrity (an organizer-less active event could never be closed or managed), but only matters on failure paths.

**Independent Test**: Force a failure at each creation step and verify an internal error is returned and no event or participant record remains.

**Acceptance Scenarios**:

1. **Given** a failure occurs after the event is recorded but before the organizer is linked, **When** creation is attempted, **Then** an internal error is returned and neither the event nor the participant exists afterward.
2. **Given** any successful creation, **When** the stored event is inspected, **Then** its organizer reference points to a participant belonging to that same event.

---

### Edge Cases

- Event name exactly 60 characters / display name exactly 30 characters after trimming: accepted.
- Length is counted in Unicode code points, not bytes: a Korean syllable counts as 1, while a composed emoji (e.g., with a skin-tone modifier or joiner) may count as several.
- Entry code collision with an existing event: a new code is generated, up to 10 attempts in total; the user never sees a collision error. If every attempt collides (practically impossible with 32⁶ ≈ 1.07×10⁹ codes), an internal error is returned and nothing is persisted.
- Fields of the wrong type (e.g., number, array, or object instead of text): validation error for that field with reason `invalid_type`. An explicit `null` is treated as missing (reason `required`).
- Control characters inside a name after trimming (newline, tab, other Unicode category Cc characters): rejected with reason `invalid_characters`. Leading/trailing control whitespace such as a trailing newline is removed by trimming first and is not an error. Ordinary inner spaces are allowed. Trimming removes all Unicode whitespace, including the full-width space (U+3000).
- Unknown extra fields in the request: rejected with a validation error; each unknown field is listed under its name as received, with reason `unknown_field` (also when its value is `null`).
- Repeated identical submissions (double tap, retry): each creates a separate event; the request is not idempotent, so the client prevents duplicate submission while a request is in flight.
- An `Authorization` header is sent anyway: it is ignored; anyone may create an event.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow anyone, without prior authentication, to create an event by providing an event name and an organizer display name.
- **FR-002**: System MUST trim leading/trailing whitespace from both inputs before validating and storing them.
- **FR-003**: System MUST reject the request when a field is missing or empty after trimming (reason `required`), or exceeds its limit after trimming — event name 60 Unicode code points, display name 30 Unicode code points (reason `too_long`), is not text (reason `invalid_type`; an explicit `null` counts as missing and uses `required`), or contains a control character (Unicode general category Cc, e.g., newline or tab) after trimming (reason `invalid_characters`), or includes a field not defined for event creation (reason `unknown_field`) — reporting every invalid field.
- **FR-004**: System MUST reject a malformed (unparseable) request body with a bad-request error distinct from field validation errors.
- **FR-005**: System MUST create the event in the active state immediately; there is no draft or pending state.
- **FR-006**: System MUST register the creator as a participant of the new event and record that participant as the event's organizer.
- **FR-007**: System MUST create the event, register the organizer participant, store the participant's credential, and link the organizer as a single all-or-nothing operation; on any failure nothing is persisted and an internal error is returned.
- **FR-008**: System MUST generate a 6-character entry code from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, store it uppercase, guarantee uniqueness across events by regenerating on collision (at most 10 attempts per creation; if all collide, return an internal error and persist nothing), and treat it as case-insensitive for later matching.
- **FR-009**: System MUST build the join link as `{public app origin}/join?code={entryCode}`, where the public app origin is configured per deployment and matches the frontend's public origin.
- **FR-010**: System MUST issue a new random session credential for the organizer participant, return it in the creation result, and persist only a one-way hash of it — never the raw value.
- **FR-011**: System MUST return the session credential only in the creation result (and in the separate join flow); no other operation ever returns it again.
- **FR-012**: System MUST return the created event in the same shape as the read-event result (id, name, status, entry code, join link, organizer participant id, creation time, closure time = none, caller info with organizer flag = true, organizer summary counts) together with the session credential.
- **FR-013**: System MUST record an informational audit log entry `event_created` that includes the event ID and never includes the raw entry code or session credential.
- **FR-014**: System MUST NOT treat repeated creation requests as duplicates; each successful request creates a distinct event.
- **FR-015**: System MUST follow the shared error format and codes defined in `docs/rules/dev/common/api-contract.md` (`BAD_REQUEST`, `VALIDATION_ERROR` with per-field reasons, `INTERNAL_ERROR`), and MUST document those error responses for this operation in the published API schema.
- **FR-016**: System MUST allow browser requests from the configured public app origin (cross-origin), permitting the `Authorization`, `Content-Type`, and `X-Request-ID` request headers and exposing the `X-Request-ID` response header, as required by `docs/rules/dev/common/api-contract.md` §9; other origins are not allowed.

### Key Entities

- **Event**: An exchange corner session. Attributes: identifier, name, status (active/closed), unique entry code, organizer participant reference, creation time, closure time. Always has exactly one organizer who is one of its participants.
- **Participant**: A person within one event. Attributes: identifier, owning event, display name, hashed session credential. The organizer is a participant whose identifier equals the event's organizer reference.
- **Session credential (participant token)**: A secret bearer value identifying one participant in one event. Shown to the holder once at creation/join; the system keeps only its hash.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An organizer can go from the create screen to a shareable entry code and join link in a single submission, completing the step in under 30 seconds of user time.
- **SC-002**: 100% of successfully created events have an organizer who is a participant of that event; 0 active events without an organizer exist after any failure scenario.
- **SC-003**: 100% of created events have entry codes unique across all events and conforming to the 6-character unambiguous alphabet.
- **SC-004**: 100% of field-validation failures return field-level reasons that allow the create screen to show which field to fix; 100% of malformed bodies return a bad-request error; no invalid submission leaves persisted data.
- **SC-005**: No raw session credential or raw entry code appears in stored participant data or in logs (verified by inspecting stored records and log output in tests).
- **SC-006**: Event creation responds within 1 second for 95% of requests under expected event-day load (up to 5 concurrent creation requests; verified locally with 100 requests from 5 concurrent clients).

## Assumptions

- The input limits (60/30 characters) and entry code format are "proposed" in the API draft and are adopted as-is for this feature.
- Display-name uniqueness per event is irrelevant here since the organizer is the first participant; it applies to the join flow.
- The public app origin is provided by deployment configuration (proposed `APP_BASE_URL`, equal to the frontend's public URL); QR images are rendered by the frontend from the join link, with no separate image service.
- Session credentials do not expire before the event's data retention ends in v1. This is **proposed** in `docs/plans/api/README.md` and depends on the undecided retention policy; this feature implements no expiry logic and does not treat the lifetime as settled.
- **Out of scope (open decisions):** organizer session recovery on another device (until decided, H2 warns the organizer to keep using the same device and browser) and abuse protection / rate limiting for event creation.
- The H1/H2 screens are covered by the frontend; this feature specifies the creation behavior and result they rely on. The read-event operation (02) is a separate feature, though this feature's result uses the same event shape.
