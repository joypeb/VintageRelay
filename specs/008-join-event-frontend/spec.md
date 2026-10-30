# Feature Specification: Join Event Frontend (Mobile)

**Feature Branch**: `feature/frontend-join-event`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: `"specs/007-join-event" frontend development`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visitor joins from the event QR link (Priority: P1)

A visitor scans the event QR code with their phone camera. The join link opens P1 with the entry code already filled in, and P1 immediately shows the event's name and state. The visitor enters a display name, taps [Join], and lands on the event home (P2) as a regular participant.

**Why this priority**: Scanning the QR code at the exchange corner is the main way non-organizers enter an event. Today P1 only shows a "coming soon" notice, so nobody but the organizer can take part.

**Independent Test**: Create an event, open its join link on another device (or a fresh browser profile), verify the event name and "Active" state appear without typing the code, enter a display name, tap [Join], and verify P2 opens as a non-organizer for that event.

**Acceptance Scenarios**:

1. **Given** a join link containing an entry code, **When** P1 opens, **Then** the code field shows the code and the event preview is requested automatically, with a visible loading state while it is pending.
2. **Given** the preview succeeds for an active event, **When** it is shown, **Then** P1 shows the event name, the state label "Active", and a "My display name" field with [Join].
3. **Given** an active event preview and a display name of 1–30 characters after trimming, **When** the visitor taps [Join], **Then** the join is requested, [Join] shows a busy state and cannot be triggered again, and on success the participant access is kept on this device and P2 opens for that event.
4. **Given** a successful join, **When** P2 opens, **Then** it shows the event as a regular participant (no manage card), and the browser's back action does not return to the P1 join form.
5. **Given** a successful join, **When** the visitor later reopens P2 for that event on the same device, **Then** P2 loads without asking them to join again.

---

### User Story 2 - Visitor joins by typing the entry code (Priority: P1)

A visitor without a QR scan opens P1 from the landing screen's [Join with entry code], types the code they were told, sees the event name, then enters a display name and joins.

**Why this priority**: Typed codes are the fallback when the QR code cannot be scanned and are already linked from S0 and from P2's "not joined on this device" guidance.

**Independent Test**: From S0 tap [Join with entry code], type the code in lowercase with surrounding spaces, tap [Find event], verify the preview, then join.

**Acceptance Scenarios**:

1. **Given** P1 opened without a code, **When** it renders, **Then** it shows an empty "Entry code" field and [Find event], and no display name field yet.
2. **Given** a code typed in any letter case with surrounding spaces, **When** the visitor taps [Find event] (or submits from the keyboard), **Then** the preview is requested with the trimmed code and the event is shown as in User Story 1.
3. **Given** an empty code (or only spaces), **When** the visitor taps [Find event], **Then** no request is sent and the field shows "Enter the entry code."
4. **Given** a shown preview, **When** the visitor edits the entry code, **Then** the preview and display name step are cleared until the new code is looked up.

---

### User Story 3 - Lookup and join problems are explained and recoverable (Priority: P1)

When the code is wrong, the event has ended, or the display name is taken, the visitor sees why and what to do next, and never ends up on P2 unless the join actually succeeded.

**Why this priority**: Typos, closed events, and common names are expected at a flea market; a dead end would stop people from joining.

**Independent Test**: Simulate each failure (unknown code, closed event on preview, closed event on join, taken name, invalid name, event not found on join, connection failure, internal error, unexpected response) and verify the message, the remaining state, and that retrying works.

**Acceptance Scenarios**:

1. **Given** an unknown code, **When** the preview fails as not found, **Then** the code field shows the server message ("We couldn't find an event with this code. Check the code and try again.") and the visitor can correct the code and retry.
2. **Given** a preview for a closed event, **When** it is shown, **Then** P1 shows the event name, the state label "Closed", and "This event has ended. You can no longer join.", with no display name field or [Join], and a [Go to start] action.
3. **Given** an empty, whitespace-only, or longer-than-30-character display name, **When** the visitor taps [Join], **Then** no request is sent and the field shows "Enter a display name of 1–30 characters." A name containing line breaks or tabs shows "Remove line breaks and tabs." instead.
4. **Given** a join rejected because the display name is taken, **When** the result arrives, **Then** the display name field shows the server message, keeps the typed name for editing, and [Join] becomes available again.
5. **Given** a join rejected because the event was closed after the preview, **When** the result arrives, **Then** P1 switches to the closed state from scenario 2, and the change is announced to assistive technology with focus moved to the closed message.
6. **Given** a join rejected as not found (the event no longer matches the code), **When** the result arrives, **Then** P1 clears the preview and returns to code entry with the server message on the code field.
7. **Given** a join rejected as a validation error for a field, **When** the result arrives, **Then** the message is shown on that field (or as a form message if no field is identified).
8. **Given** a lookup or join that fails with a connection failure, timeout, internal error, or unexpected response, **When** the failure is shown, **Then** P1 shows an error message (preferring the server-provided message), keeps the entered code and name, and the visitor can retry with the same action.

---

### User Story 4 - Device already joined this event (Priority: P2)

If this device already holds access for the event (the visitor joined earlier or is the organizer), P1 does not create a second participant by accident; it offers to go straight to the event.

**Why this priority**: Rescanning the QR code is common, and a duplicate participant would split one person's clothes and exchanges. It is less frequent than first-time joins.

**Independent Test**: Join an event, then open its join link again on the same device and verify the notice and that no join is sent.

**Acceptance Scenarios**:

1. **Given** a preview for an event this device already has access to, **When** it is shown, **Then** P1 shows "You've already joined this event on this device." with [Go to event home] (→ P2) instead of the display name field and [Join].
2. **Given** that notice, **When** the visitor taps [Go to event home], **Then** P2 opens for that event using the existing access.
3. **Given** a closed preview for an event this device already has access to, **When** it is shown, **Then** the already-joined notice is shown instead of the closed join message, because the participant can still view the event.
4. **Given** an active preview shown before this device gained access to the event (for example, the visitor joined in another tab), **When** the visitor taps [Join], **Then** no join is sent and the already-joined notice is shown.

### Edge Cases

- A join link with an empty or missing `code` value opens P1 in typed-code mode without a lookup.
- Repeated taps on [Find event] or [Join] send at most one request of each kind at a time.
- A preview response that arrives after the visitor has edited the code is ignored.
- The visitor changes the code while a join is in flight: the code field is read-only while joining.
- A join response lost after the server created the participant: retrying with the same name fails as taken. The visitor can choose another name; recovering the earlier participant is out of scope (open decision).
- Device storage is unavailable (for example, a private mode that blocks storage): P1 shows "This browser can't save your event access. Turn off private browsing or try another browser." and does not send the join, so no participant is created that the device cannot keep.
- A display name of exactly 1 or 30 characters after trimming is accepted; the name is sent trimmed.
- An event closed between preview and join is handled by User Story 3, scenario 5.
- The visitor edits the code while a lookup is still pending: the old result is ignored, and [Find event] stays busy until that lookup settles, so at most one lookup is in flight.
- A successful response whose body cannot be read is treated as an unexpected response; nothing from the body is logged.
- Device-held access that is no longer valid on the server (for example, a stored credential the server does not recognize) still counts as "already joined": P1 offers [Go to event home], and P2 then shows its existing "not joined on this device" guidance. Resolving this is part of the open session-recovery decision and is out of scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: P1 MUST replace the current "coming soon" placeholder at the existing join entry point used by S0, P2's "not joined on this device" guidance, and the join link shared from H2/M1.
- **FR-002**: When opened from a join link containing a code, P1 MUST prefill the code and request the preview automatically; otherwise it MUST show code entry with [Find event].
- **FR-003**: App MUST trim the entry code before lookup and MUST NOT send a lookup for an empty code. Letter case is not changed by the app's validation; matching is the server's responsibility.
- **FR-004**: The preview MUST show the event name and an "Active" or "Closed" state label. An active preview shows the display name step; a closed preview shows "This event has ended. You can no longer join." with [Go to start] and no join action.
- **FR-005**: App MUST validate the display name as 1–30 characters after trimming before sending, and MUST send the trimmed name together with the looked-up event and entry code.
- **FR-006**: [Find event] and [Join] MUST each allow at most one request in flight, show a busy state while pending, and keep the entered values on failure.
- **FR-007**: On a successful join, App MUST validate the returned event session, keep the participant access on this device for that event, and replace P1 with P2 for that event so back navigation does not reopen the join form.
- **FR-008**: App MUST map failures as follows: lookup not found → server message on the code field; join display-name-taken → server message on the display name field; join validation error → message on the identified field or as a form message; join event-closed → closed state; join not found → return to code entry with the server message; connection failure, timeout, internal error, or unexpected response → form error (preferring the server message) with retry.
- **FR-009**: App MUST navigate to P2 only after a successful, valid join response; it MUST NOT assume success on failure or on an unexpected response.
- **FR-010**: When the previewed event already has device-held access, App MUST show "You've already joined this event on this device." with [Go to event home] instead of the join form. App MUST re-check device-held access immediately before sending a join and show that notice instead of joining if access now exists.
- **FR-011**: App MUST check that device storage is available before sending a join and show the storage message instead of joining when it is not.
- **FR-012**: Editing the entry code MUST clear any shown preview and the display name step; a stale preview result for a previous code MUST NOT be shown.
- **FR-013**: P1 MUST be usable on phones (360–430px widths, no horizontal scrolling, touch targets at least 44×44px), label every field, announce errors and a switch to the closed state to assistive technology, move focus to the display name field once an active preview is shown, and move focus to the closed message when a join attempt reveals the event is closed.
- **FR-014**: All user-facing text MUST be in English.
- **FR-015**: App MUST NOT write the participant credential, authorization headers, raw entry code, or response bodies to the logs it writes (the app logger and browser console). Request logging by the local development server is outside the app and out of scope.

### Key Entities

- **Event preview**: The public result of a code lookup — event identity, name, and active/closed state.
- **Join form**: Transient P1 state — code entry, looking up, preview (active, closed, or already joined), joining, and field/form errors.
- **Event session (join result)**: The shared event-session result reused from features 002/004, here for a non-organizer with no organizer summary, plus the new participant credential.
- **Device-held event access**: The private participant credential for the event kept on this device (from feature 002); joined participants have no share card data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor scanning the QR code can reach P2 as a participant in 3 taps or fewer after P1 opens and in under 30 seconds of user time on a phone.
- **SC-002**: A visitor typing the code can reach P2 in under 60 seconds of user time on a phone.
- **SC-003**: In 100% of failure scenarios, the visitor sees a message with a next action and is not taken to P2 unless the join succeeded.
- **SC-004**: 0 join requests are sent for closed previews, invalid names, unavailable storage, or events the device already joined, and at most 1 join request is in flight at a time.
- **SC-005**: 100% of successful joins whose access was saved on the device let the visitor reopen P2 on the same device without joining again; when saving fails, the visitor is told so and stays on P1.
- **SC-006**: P1 is fully usable without horizontal scrolling at 360px and 430px widths in manual verification.
- **SC-007**: The participant credential and raw entry code appear in 0 app-written log entries (app logger and browser console) during testing.

## Assumptions

- The lookup and join capabilities from `specs/007-join-event` are available and are the source of results and error categories; `docs/rules/dev/common/api-contract.md` remains the single source of truth for the shared contract, and `docs/plans/api/04-join-event.md` defines the lookup message.
- The join link format is the existing entry URL with the code in a `code` query value, produced by event creation.
- The event model, event-session validation, device-held access storage, API client, error mapping, state labels, and P2 screen from `specs/002-create-event-frontend` and `specs/004-read-event-frontend` are reused.
- In-app camera QR scanning is out of scope; visitors scan with the phone's camera app, which opens the join link.
- Treating a device that already holds access as "already joined" (User Story 4) is a frontend default to prevent accidental duplicates; the backend still allows multiple participants. Returning-participant verification and session recovery remain open decisions and out of scope, so a stored access the server no longer accepts is not detected on P1.
- The app does not enforce entry code length or character set; the server decides whether a code exists.
- Visual design follows the project's existing design system and the P1 mockup in `docs/flows/mockup-flow-v1.html`; exact visuals are decided during planning.
- Screens are verified manually at 360–430px widths; automated tests target non-trivial logic (lookup/join state transitions, single in-flight requests, stale-preview protection, error-to-screen-state mapping, already-joined detection), per the project constitution.
