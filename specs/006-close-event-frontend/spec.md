# Feature Specification: Close Event Frontend (Mobile)

**Feature Branch**: `feature/frontend-close-event`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "The backend for specs/005-close-event is done; now build the frontend."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organizer closes the event from M1 (Priority: P1)

When the exchange corner is over, the organizer opens M1 and taps [Close event]. A confirmation dialog (H3) explains that closing ends the exchange corner for everyone, that participants can no longer register clothes or make exchanges, and that closing can't be undone. When the organizer confirms, the event is closed and M1 switches to its closed state with the closure time.

**Why this priority**: Closing is the organizer's last required action. Today [Close event] only shows a "coming soon" notice, so an event can never be ended from the app.

**Independent Test**: Create an event, open M1 as the organizer, tap [Close event], confirm in H3, and verify that M1 shows the closed banner with the closure time, no [Close event] action, and the counts; reopen P2 and verify it also shows the event as closed.

**Acceptance Scenarios**:

1. **Given** M1 for an active event, **When** the organizer taps [Close event], **Then** H3 opens with the title "Close this event?", the explanation "Closing ends the exchange corner for everyone. Participants can no longer register clothes or make exchanges. This can't be undone.", and the actions [Close event] and [Cancel]; nothing is sent yet.
2. **Given** H3 is open, **When** the organizer taps [Cancel] or dismisses the dialog, **Then** H3 closes, no closure request is sent, and M1 stays active.
3. **Given** H3 is open, **When** the organizer taps [Close event], **Then** the closure is requested, the confirm action shows a busy state and cannot be triggered again, and on success H3 closes, "Event closed" is shown briefly, and M1 shows the closed state using the returned event.
4. **Given** a successful closure, **When** M1 renders the closed state, **Then** the state reads "Closed", the banner "This event has ended." shows the returned closure time in the device's local time, the counts are shown exactly as returned, and [Close event] is no longer offered.
5. **Given** a successful closure, **When** the organizer goes to P2, **Then** P2 already shows the event as closed without waiting for a periodic refresh, and [Register my clothes] is disabled or hidden.

---

### User Story 2 - Closure failures are recoverable (Priority: P1)

If closing fails, the organizer understands what happened and can try again; the app never shows the event as closed unless the server confirmed it.

**Why this priority**: A false "closed" display or a dead end would leave the organizer unsure whether exchanges are still running.

**Independent Test**: Simulate each failure category during closure (connection failure, internal error, unauthenticated, forbidden, not found, unexpected response) and verify the message, the remaining event state, and that retrying works.

**Acceptance Scenarios**:

1. **Given** H3 confirmation, **When** the closure fails with a connection failure, timeout, internal error, or unexpected response, **Then** H3 stays open with an error message (preferring the server-provided message), M1 stays active unless a reload confirms the event is closed, and tapping [Close event] again retries the closure.
2. **Given** H3 confirmation, **When** the server reports the caller as not the organizer, **Then** H3 closes and M1 shows "Only the organizer can manage this event." with a way back to P2.
3. **Given** H3 confirmation, **When** the server reports the caller as unauthenticated, **Then** the "You haven't joined this event on this device." guidance is shown with [Join with entry code] (→ P1) and [Go to start] (→ S0).
4. **Given** H3 confirmation, **When** the server reports the event as not found, **Then** "This event could not be found." is shown with [Go to start].
5. **Given** a closure whose response was lost, **When** the organizer retries, **Then** the retry succeeds and shows the same closure time as the server recorded.
6. **Given** a failed closure whose request actually reached the server, **When** the event reload after the failure returns the event as closed, **Then** H3 closes, the error disappears, and M1 shows the closed state.

---

### User Story 3 - Already-closed event is handled gracefully (Priority: P2)

If the event was already closed (for example, from another tab or after a lost response) while M1 still showed it as active, confirming H3 simply shows the closed state instead of an error.

**Why this priority**: Repeated or stale closure attempts are expected on mobile but are less common than the main flow.

**Independent Test**: Open M1 on two tabs for the same organizer, close the event in one, then confirm closure in the other and verify the closed state with the original closure time.

**Acceptance Scenarios**:

1. **Given** M1 showing an active event that is already closed on the server, **When** the organizer confirms H3, **Then** M1 shows the closed state with the original closure time and no error.
2. **Given** M1 showing an active event that becomes closed elsewhere, **When** M1 refreshes (periodic, [Refresh], or reopening), **Then** [Close event] disappears and the closed banner appears.

---

### Edge Cases

- The organizer double-taps [Close event] in H3, or leaves and reopens M1 while a closure is in flight: only one closure request is in flight per event, and [Close event] stays disabled until it settles.
- A reload or periodic refresh reports the event as closed while H3 is open (including after a failure): H3 closes, any error is cleared, and the closed state is shown — a server-confirmed closed state always takes precedence over a closure failure.
- The organizer navigates away while closure is in flight: the result still updates the shared event data so P2/M1 show the correct state when revisited; no error is shown on an unrelated screen.
- A periodic refresh finishes while closure is in flight: the screen never flips from closed back to active because of a response that predates the closure.
- Closure succeeds but the returned event does not match the shared event shape (for example, missing or unreadable closure time, or missing counts): treated as an unexpected response; the app reloads the event rather than assuming it is closed.
- Regular participants never see [Close event] or H3 (already enforced by M1 gating from feature 004).
- H3 text and buttons fit at 360–430px widths without horizontal scrolling; [Close event] in H3 is visually marked as a destructive action.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: M1 MUST show [Close event] only to the organizer and only while the event is active, replacing the existing "coming soon" notice with the H3 confirmation dialog.
- **FR-002**: H3 MUST show the title "Close this event?", the explanation "Closing ends the exchange corner for everyone. Participants can no longer register clothes or make exchanges. This can't be undone.", a destructive [Close event] action, and [Cancel].
- **FR-003**: App MUST NOT send a closure request until the organizer confirms in H3; [Cancel] or dismissal MUST send nothing and change nothing.
- **FR-004**: App MUST request closure through the close-event capability (`specs/005-close-event`) using only the access held on this device for that event, and MUST allow at most one in-flight closure request per event, including after leaving and reopening M1.
- **FR-005**: On success, App MUST update the shared event data from the returned event so M1 and P2 show the closed state immediately, then close H3 and show "Event closed".
- **FR-006**: App MUST show the event as closed only when the server returns a closed event (from closure or a read); it MUST NOT assume closure on failure or on an unexpected response.
- **FR-007**: App MUST map closure failures as follows: connection failure, timeout, internal error, or unexpected response → error message inside H3 (preferring the server-provided message) with retry by confirming again; forbidden → "Only the organizer can manage this event." with a way back to P2; unauthenticated → "not joined on this device" guidance with [Join with entry code] and [Go to start]; not found → "This event could not be found." with [Go to start]. A closed event confirmed by any server result (closure or read) takes precedence over a closure failure: H3 closes and the closed state is shown.
- **FR-008**: App MUST treat a closure of an already-closed event as success and show the returned closure time.
- **FR-009**: M1 MUST show a state label under its heading — "Active" or "Closed", the same label P2 shows — so the state is stated in text, not only by the banner. After closure, the closed-state behavior from feature 004 MUST also apply: "Closed" state label, "This event has ended." banner with the local closure time on P2 and M1, counts still visible to the organizer on M1, no [Close event], and [Register my clothes] disabled or hidden.
- **FR-010**: A read result that predates a successful closure MUST NOT overwrite the closed state.
- **FR-011**: H3 MUST be usable on phones (360–430px widths, no horizontal scrolling, touch targets at least 44×44px) and MUST be accessible as a dialog (focus moves into it and returns on close; dismissible with the platform's back/escape gesture while no request is in flight).
- **FR-012**: All user-facing text MUST be in English.
- **FR-013**: App MUST NOT write the access credential, authorization headers, or entry code to logs.

### Key Entities

- **Event (as seen by the app)**: The shared event result reused from feature 004; closure returns the same shape with a closed state and closure time.
- **Closure confirmation (H3)**: A transient dialog state — closed, open, submitting, or failed with a message.
- **Device-held event access**: The private organizer credential for the event, kept on this device (from feature 002).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An organizer can go from M1 to a confirmed closed state in 3 taps or fewer and under 10 seconds of user time on a phone.
- **SC-002**: 100% of successful closures show the closed banner with the server's closure time on M1 immediately and on P2 on the next visit, without waiting for a periodic refresh.
- **SC-003**: 0 closure requests are sent without H3 confirmation, and at most 1 closure request is in flight at a time.
- **SC-004**: In 100% of closure failure scenarios, the event is not shown as closed unless the server confirmed it, and the organizer sees a message with a next action.
- **SC-005**: H3 is fully usable without horizontal scrolling at 360px and 430px widths in manual verification.
- **SC-006**: The access credential and entry code appear in 0 log entries during testing.

## Assumptions

- The close-event capability from `specs/005-close-event` is available and is the source of the result and error categories; `docs/rules/dev/common/api-contract.md` remains the single source of truth for the shared contract.
- The event model, result validation, device-held access, API client, error mapping, P2/M1 screens, closed banner, and periodic refresh from `specs/002-create-event-frontend` and `specs/004-read-event-frontend` are reused; this feature replaces the M1 "coming soon" placeholder and adds H3.
- H3 states only settled closure effects: new exchange actions are blocked (`409 EVENT_CLOSED`) and reopening is not supported in v1. The mockup's text about cancelling unconfirmed proposals and keeping confirmed records viewable is **not** used, because those policies (`specs/005-close-event` FR-010/FR-011) are still awaiting approval and are not implemented. If they are approved and implemented, H3 copy is extended then.
- Blocking post-closure actions on other screens (clothing, intents, consent, cancellation, recommendations) belongs to those screens' features; those screens do not exist yet.
- Reopening, handover recording, session recovery, and push/live updates are out of scope.
- Visual design follows the project's existing design system and theme; exact visuals are decided during planning.
- Screens are verified manually at 360–430px widths; automated tests target non-trivial logic (closure state transitions, single in-flight request, error-to-screen-state mapping, stale-read protection), per the project constitution.
