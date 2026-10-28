# Feature Specification: Create Event Frontend (Mobile)

**Feature Branch**: `feature/frontend-create-event`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "The backend for specs/001-create-event is built. Now build the frontend. The frontend targets mobile app screens."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organizer creates an event from a phone (Priority: P1)

A person running a clothing exchange corner opens the app on their phone. On the landing screen (S0) they tap [Create event], reach the create screen (H1), enter an event name and their own display name, and tap [Create event]. The event is created and becomes active immediately, and they land on the created/share screen (H2). Their organizer access is kept on this device.

**Why this priority**: Every later flow (joining, registering clothing, exchanges, closing) needs an event with an organizer. Without this screen flow, the already-built creation capability cannot be used by anyone.

**Independent Test**: On a phone-sized screen, go S0 → H1, enter valid values, submit, and verify H2 appears with the new event's entry code and that the organizer access for that event is kept on the device.

**Acceptance Scenarios**:

1. **Given** a visitor on S0, **When** they tap [Create event], **Then** H1 opens with empty "Event name" and "My display name" fields, a note that creating the event also registers them as a participant, and a note that the event starts immediately.
2. **Given** H1 with event name "Mangwon Flea Market Swap Corner" and display name "Mina", **When** they tap [Create event], **Then** the event is created and H2 opens for that event.
3. **Given** a successful creation, **When** H2 opens, **Then** the organizer's private access for that event is kept on this device so later screens can act as the organizer.
4. **Given** a creation request is in flight, **When** the user taps [Create event] again, **Then** no second event is created (the button is disabled and shows a progress state until the request ends).
5. **Given** the device already holds access for another event, **When** a new event is created, **Then** access for both events is kept, each for its own event.

---

### User Story 2 - Organizer shares the event entry (Priority: P1)

Right after creation, H2 shows a QR code, the entry code, and a [Copy link] button so the organizer can let others join on the spot. H2 also warns the organizer to keep using the same device and browser, and offers [Register my clothes] and [Go home].

**Why this priority**: An event nobody can join has no value; sharing is the immediate purpose of H2.

**Independent Test**: Create an event, then verify H2 shows a scannable QR code that opens the event's join link, the entry code exactly as issued, and that [Copy link] puts the join link on the clipboard.

**Acceptance Scenarios**:

1. **Given** H2 for a new event, **When** the screen renders, **Then** it shows the event name, a QR code that encodes the event's join link and the 6-character entry code in a large, easy-to-read form.
2. **Given** H2, **When** another phone's camera scans the QR code, **Then** it opens the event's join link.
3. **Given** H2, **When** the organizer taps [Copy link], **Then** the join link is copied and a short confirmation ("Link copied") is shown.
4. **Given** H2 on a device where copying is not available or fails, **When** the organizer taps [Copy link], **Then** the join link is shown as selectable text with a message asking them to copy it manually.
5. **Given** H2, **When** it renders, **Then** it shows the notice "Organizer access is stored on this device. Use the same device until the event ends."
6. **Given** H2, **When** the organizer taps [Register my clothes] or [Go home], **Then** they move to the clothing-registration screen (C2) or the event home (P2) respectively; until those screens exist, they move to a placeholder for that event that says the screen is coming soon.
7. **Given** H2 has been shown, **When** the organizer presses the device back button, **Then** they do not return to a filled H1 that could create a duplicate event.

---

### User Story 3 - Invalid input is explained next to the field (Priority: P2)

If the organizer leaves a field blank, types too much, or the server rejects a value, they see a clear message directly under the offending field, their input is preserved, and nothing is created.

**Why this priority**: Prevents frustration and broken submissions on a small screen, but the happy path delivers the core value.

**Independent Test**: Submit each invalid variant and verify the field-level message, that input is preserved, and that no creation happens for checks the device can perform itself.

**Acceptance Scenarios**:

1. **Given** H1 with an empty or whitespace-only field, **When** the user taps [Create event], **Then** the form is not sent and a message such as "Please enter an event name." appears under that field.
2. **Given** an event name longer than 60 characters or a display name longer than 30 characters after trimming, **When** the user taps [Create event], **Then** the form is not sent and a message such as "Use at most 60 characters." appears under that field.
3. **Given** a name that contains a line break or tab inside it after trimming, **When** the user taps [Create event], **Then** the form is not sent and a message asking to remove line breaks or tabs appears under that field.
4. **Given** both fields are invalid, **When** the user taps [Create event], **Then** both fields show their messages at once and focus moves to the first invalid field.
5. **Given** the server rejects the request with field-level reasons, **When** the response arrives, **Then** each reason is shown under its field using the same wording as the device-side checks.
6. **Given** a field shows an error, **When** the user edits that field, **Then** its error clears.
7. **Given** inputs with leading/trailing spaces (e.g., "  Mina  "), **When** submitted, **Then** they are accepted and the trimmed value is used.

---

### User Story 4 - Network and server failures are recoverable (Priority: P2)

At a busy event the connection may be weak. If creation fails for a non-field reason (no connection, timeout, server error), the organizer sees a message near the button, keeps everything they typed, and can try again.

**Why this priority**: Event-day connectivity is unreliable; losing input or being stuck would block the organizer, but this only matters on failure paths.

**Independent Test**: Simulate offline, a slow response, and a server error, and verify the message, preserved input, and that retrying works.

**Acceptance Scenarios**:

1. **Given** the device is offline or the request cannot reach the server, **When** the user submits, **Then** a message near the button explains that the connection failed and asks them to try again; inputs are preserved and the button is enabled again.
2. **Given** the server returns an internal error, **When** the response arrives, **Then** the server-provided message (or a generic "Something went wrong. Please try again.") is shown near the button and inputs are preserved.
3. **Given** a failure message is shown, **When** the user taps [Create event] again, **Then** a new attempt is made.

---

### Edge Cases

- Exactly 60 characters (event name) / 30 characters (display name) after trimming: accepted. Characters are counted the same way as the server (Unicode code points: a Korean syllable is 1; a composed emoji may count as several).
- Leading/trailing line breaks or full-width spaces are removed by trimming and are not errors; inner line breaks and tabs are errors. Ordinary inner spaces are allowed.
- Pasting very long text: the field accepts it but shows the "too long" message rather than silently truncating.
- Response does not arrive within a reasonable time (about 15 seconds): treated as a connection failure. Because a late response may still have created an event, the message says an event may have been created and the organizer can create again if they don't see it.
- The server returns an unexpected non-structured response (e.g., an HTML gateway error page): treated as a generic failure with the generic message.
- H2 is reloaded on the same device: it shows the same event's share information again from what the device kept at creation.
- H2 is opened for an event the device holds no data for (e.g., a copied H2 address on another phone): the user is guided to S0.
- Small or large screens: all of S0/H1/H2 is usable at widths 360–430px without horizontal scrolling; on H1 the [Create event] button stays reachable while the on-screen keyboard is open.
- Pressing Enter/Go on the phone keyboard in the last field submits the form; in the first field it moves to the next field.
- The browser cannot keep data on the device (e.g., storage disabled or full in a private mode): the app detects this before sending, does not create the event, and asks the organizer to use a regular browser window, because organizer access could not be kept.
- The raw access credential and entry code are never written to logs or shown anywhere other than where intended (the entry code only on H2).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: App MUST provide a landing screen (S0) with the app name, a one-line explanation ("Give one garment, receive one garment"), a [Create event] action leading to H1, and a [Join with entry code] action leading to the join screen (P1), which is a placeholder until the join feature is built.
- **FR-002**: App MUST provide a create screen (H1) with two labeled fields, "Event name" and "My display name", a note that creating an event also registers the creator as a participant, a note that the event starts immediately, and a [Create event] button.
- **FR-003**: App MUST check inputs on the device before sending, using the same rules as the creation service: trimmed value required; at most 60 (event name) / 30 (display name) Unicode code points after trimming; no control characters (e.g., line break, tab) after trimming.
- **FR-004**: App MUST show each field error directly below its field, programmatically associated with the field for screen readers, keep all input on any failure, clear a field's error when it is edited, and move focus to the first invalid field.
- **FR-005**: App MUST map server field-level reasons (`required`, `too_long`, `invalid_characters`, `invalid_type`, `unknown_field`) to user-facing English messages under the matching field, using the same wording as device-side checks; reasons not tied to a visible field, `invalid`, and any unknown reason show a generic message near the button.
- **FR-006**: App MUST prevent duplicate submission by disabling [Create event] and showing a progress state while a creation request is in flight.
- **FR-007**: App MUST show non-field failures (connection failure, timeout, malformed request, internal error, unexpected response) as a message near the button, preferring the server-provided message when present, and allow retry.
- **FR-008**: On success, app MUST keep the returned private access credential on the device, scoped to the created event, without replacing access held for other events.
- **FR-009**: On success, app MUST navigate to H2 for the created event such that going back does not return to a filled H1.
- **FR-010**: H2 MUST show the event name exactly as returned, a QR code encoding the event's join link exactly as returned, the entry code exactly as returned, and a [Copy link] action that copies the join link and confirms with "Link copied"; if copying fails or is unavailable, it MUST show the link as selectable text.
- **FR-011**: H2 MUST show the notice "Organizer access is stored on this device. Use the same device until the event ends."
- **FR-012**: H2 MUST offer [Register my clothes] (→ C2) and [Go home] (→ P2) for the created event; until those screens exist, each leads to a per-event placeholder that states the screen is coming soon.
- **FR-013**: H2 MUST be re-viewable on the same device after a reload using the event information kept at creation; when no such information exists for the event, the app MUST guide the user to S0.
- **FR-014**: All S0/H1/H2 screens MUST be laid out for phones (single column, usable at 360–430px widths without horizontal scrolling, touch targets at least 44×44px) and keep the primary action reachable while the on-screen keyboard is open.
- **FR-015**: All user-facing text MUST be in English.
- **FR-016**: App MUST NOT write the access credential, authorization headers, or entry code to logs.
- **FR-017**: App MUST confirm before sending that it can keep data on the device; if it cannot, it MUST NOT send the creation request and MUST show a form-level message asking the organizer to use a regular browser window.

### Key Entities

- **Created event (as seen by the app)**: The result of creation used to render H2 — event identifier, name, status, entry code, join link, and the caller's organizer identity.
- **Device-held event access**: The private access credential for one participant in one event, kept per event on this device; a device may hold several.
- **Create form**: Event name and display name as typed, plus per-field errors and a form-level error.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time organizer can go from S0 to H2 showing a shareable QR code in under 30 seconds of user time on a phone.
- **SC-002**: In a hallway test, at least 9 of 10 participants scanning the H2 QR code with a phone camera reach the event's join link on the first try.
- **SC-003**: 100% of invalid inputs that the device can detect are reported under the correct field without a request being sent.
- **SC-004**: 100% of failed submissions keep both typed values, and a retry after a connection failure succeeds without retyping.
- **SC-005**: Rapid repeated taps on [Create event] create exactly one event in 100% of attempts.
- **SC-006**: S0, H1, and H2 are fully usable without horizontal scrolling at 360px and 430px widths in manual verification.
- **SC-007**: The access credential and entry code appear in 0 log entries during testing.

## Assumptions

- The event-creation capability from `specs/001-create-event` is available and is the source of all validation rules, error reasons, and result fields; `docs/rules/dev/common/api-contract.md` remains the single source of truth for the shared contract.
- "Mobile app screens" means the existing mobile web app laid out for phones (not a native app), consistent with the project's mobile web prototype direction (confirmed by the user on 2026-10-28).
- Scope is S0, H1, and H2 only. P1 (join), P2 (home), C2 (register clothing), and M1 (manage event) are separate features; this feature provides placeholders for the navigation targets it needs.
- The read-event capability (02) is not yet available, so H2 renders from the creation result kept on the device rather than fetching the event again.
- The QR code is generated on the device from the join link; no separate image service is used.
- The entry code is displayed as issued (6 uppercase characters); any visual grouping is purely presentational.
- Organizer session recovery on another device remains an open decision and is out of scope; H2's same-device notice is the interim mitigation.
- Visual design follows the project's existing design system and theme; exact visuals are decided during planning, guided by `docs/flows/mockup-flow-v1.html`.
- Screens are verified manually at 360–430px widths; automated tests target non-trivial logic (input checks, error mapping, device-held access), per the project constitution.
