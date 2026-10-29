# Feature Specification: Read Event Frontend (Mobile)

**Feature Branch**: `feature/frontend-read-event`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Build the frontend for specs/003-read-event."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Participant sees the event home (Priority: P1)

A participant (organizer or regular) who holds access for an event on this device opens the event home (P2). The app loads the current event and shows an event banner with the event name, whether it is active or closed, and the participant's own display name. The organizer additionally sees a "Manage event" card. Regular participants do not.

**Why this priority**: P2 is the hub every participant returns to. Today it is a "coming soon" placeholder, so after creating an event the organizer lands on an empty screen. Showing the real event and the caller's role is the minimum useful home.

**Independent Test**: Create an event, go to P2 on the same device, and verify the banner shows the event name, "Active", and the organizer's display name, plus the "Manage event" card. Repeat with a regular participant's access and verify the card is absent.

**Acceptance Scenarios**:

1. **Given** a device holding organizer access for an active event "Mangwon Flea Market Swap Corner" with display name "Mina", **When** P2 opens, **Then** the banner shows the event name, an "Active" state, and "Mina (Organizer)", and a "Manage event" card is shown.
2. **Given** a device holding a regular participant's access ("Joon"), **When** P2 opens, **Then** the banner shows the event name, state, and "Joon", and no "Manage event" card or organizer-only counts are shown.
3. **Given** P2 is loading the event, **When** the result has not arrived yet, **Then** a loading state is shown in place of the banner, without showing stale or placeholder event names.
4. **Given** P2 for an event, **When** the participant taps [Register my clothes], **Then** they move to the clothing-registration screen (C2) for that event (a placeholder until C2 exists).
5. **Given** H2 after creating an event, **When** the organizer taps [Go home], **Then** P2 opens and shows the real event instead of a placeholder.

---

### User Story 2 - Organizer opens the manage screen (Priority: P1)

From the "Manage event" card on P2, the organizer opens M1. M1 shows the event name, a QR code and entry code with [Copy link] for sharing, and three counts: participants (including the organizer), garments currently available, and confirmed exchanges.

**Why this priority**: M1 is the organizer's only operational view of the event and the entry point for closing it later. Sharing must also stay possible after H2 is gone.

**Independent Test**: As the organizer, open M1 from P2 and verify the counts match the event (1 / 0 / 0 for a fresh event), that the QR code opens the join link, and that [Copy link] copies it.

**Acceptance Scenarios**:

1. **Given** a freshly created event, **When** the organizer opens M1, **Then** it shows Participants 1, Available garments 0, Confirmed exchanges 0.
2. **Given** M1, **When** it renders, **Then** it shows a QR code that encodes the join link exactly as returned and the entry code exactly as returned.
3. **Given** M1, **When** the organizer taps [Copy link], **Then** the join link is copied and "Link copied" is shown; if copying is unavailable or fails, the link is shown as selectable text with a message asking them to copy it manually.
4. **Given** M1 is open, **When** the organizer taps [Refresh] or returns to M1 later, **Then** the counts are reloaded and reflect the current event.
5. **Given** a regular participant, **When** they open the M1 address directly, **Then** they do not see counts and are told the screen is only for the organizer, with a way back to P2.
6. **Given** M1 for an active event, **When** it renders, **Then** a [Close event] action is visible but leads to a "coming soon" notice, because closing the event is a separate feature.

---

### User Story 3 - Closed event is clearly marked (Priority: P2)

After the event has been closed, participants who open P2 or M1 see a closed-event banner with the closure time, and the "Active" state is replaced by "Closed". The organizer still sees the counts on M1.

**Why this priority**: Participants must understand why actions are no longer possible, but this only matters at the end of the event.

**Independent Test**: Put an event into the closed state, open P2 and M1 on a participant's and the organizer's device, and verify the closed banner, closure time, and (for the organizer) counts.

**Acceptance Scenarios**:

1. **Given** a closed event, **When** any participant opens P2, **Then** a banner states "This event has ended." with the closure time shown in the device's local time, and the state reads "Closed".
2. **Given** a closed event, **When** the organizer opens M1, **Then** the counts are still shown and [Close event] is not offered.
3. **Given** a closed event, **When** P2 renders, **Then** [Register my clothes] is disabled or hidden.

---

### User Story 4 - Missing or invalid access is handled (Priority: P2)

If the device has no access for the event, the stored access is no longer accepted, the event cannot be found, or the connection fails, the participant sees a clear message and a way forward instead of a blank or broken screen.

**Why this priority**: Prevents dead ends when links are shared or storage is cleared, but the happy path delivers the core value.

**Independent Test**: Open P2 with no stored access, with an access the server rejects, for an unknown event, and with the network off; verify the message and next action for each.

**Acceptance Scenarios**:

1. **Given** no access for the event on this device, **When** P2 or M1 opens, **Then** no request is sent and a message says "You haven't joined this event on this device." with [Join with entry code] (→ P1) and [Go to start] (→ S0).
2. **Given** stored access that the server reports as unauthenticated, **When** P2 or M1 loads, **Then** the same "not joined on this device" guidance is shown.
3. **Given** the server reports the event as not found, **When** P2 or M1 loads, **Then** a message says "This event could not be found." with [Go to start].
4. **Given** a connection failure, timeout, internal error, or unexpected response, **When** P2 or M1 loads, **Then** a message is shown (preferring the server-provided message) with [Try again], and retrying succeeds once the connection is back.

---

### Edge Cases

- The device holds access for several events: each P2/M1 uses only the access for its own event.
- Very long event or display names wrap within the screen without horizontal scrolling or overlapping the state label.
- The event becomes closed while P2 or M1 is open: the closed state appears within about 30 seconds through periodic refresh, or immediately on [Refresh], [Try again], or reopening the screen; instant live updates are not required.
- Returning to P2 or M1 from another screen shows previously loaded data immediately and refreshes it in the background.
- Counts are shown exactly as returned, including 0; a missing count set for the organizer is treated as an unexpected response.
- H2 continues to render from the creation result kept on the device; it does not depend on this feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: App MUST load the event for P2 and M1 from the read-event capability (`specs/003-read-event`) using only the access held on this device for that event.
- **FR-002**: App MUST NOT send the read request when the device holds no access for the event; it MUST show the "not joined on this device" guidance with [Join with entry code] (→ P1) and [Go to start] (→ S0).
- **FR-003**: P2 MUST show an event banner with the event name exactly as returned, the state ("Active" or "Closed"), and the caller's display name, labeled "(Organizer)" when the caller is the organizer.
- **FR-004**: P2 MUST show a "Manage event" card leading to M1 if and only if the result marks the caller as the organizer.
- **FR-005**: P2 MUST offer [Register my clothes] (→ C2, placeholder until C2 exists) while the event is active, and MUST disable or hide it while the event is closed.
- **FR-006**: M1 MUST show, for the organizer, the event name, the participant count, the available-garment count, and the confirmed-exchange count exactly as returned, plus a [Refresh] action that reloads them.
- **FR-007**: M1 MUST show a QR code encoding the join link exactly as returned, the entry code exactly as returned, and [Copy link] with the same success ("Link copied") and fallback (selectable text) behavior as H2.
- **FR-008**: M1 MUST NOT show counts to a non-organizer; it MUST show "Only the organizer can manage this event." with a way back to P2.
- **FR-009**: M1 MUST show [Close event] only while the event is active; until the close-event feature exists, it leads to a "coming soon" notice and changes nothing.
- **FR-010**: When the event is closed, P2 and M1 MUST show the banner "This event has ended." with the closure time formatted in the device's local time.
- **FR-011**: App MUST map read failures as follows: unauthenticated → "not joined on this device" guidance; not found → "This event could not be found." with [Go to start]; connection failure, timeout, internal error, or unexpected response → an error message (preferring the server-provided message) with [Try again].
- **FR-012**: App MUST show a loading state until the first result arrives and MUST NOT display placeholder event data in the meantime.
- **FR-013**: App MUST reload the event when P2 or M1 is opened again, when [Try again] or [Refresh] is used, and periodically (about every 30 seconds) while an event screen is open and the event is active; it MAY show previously loaded data while reloading.
- **FR-014**: App MUST treat a result that does not match the shared event shape (for example, an organizer result without counts) as an unexpected response.
- **FR-015**: P2 and M1 MUST be laid out for phones (single column, usable at 360–430px widths without horizontal scrolling, touch targets at least 44×44px).
- **FR-016**: All user-facing text MUST be in English.
- **FR-017**: App MUST NOT write the access credential, authorization headers, or entry code to logs.

### Key Entities

- **Event (as seen by the app)**: The read result — identifier, name, state, entry code, join link, organizer identity, creation time, closure time, the caller's identity and organizer flag, and organizer-only counts.
- **Caller ("me")**: The participant this device acts as in the event — identifier, display name, organizer flag.
- **Event summary**: Organizer-only counts of participants, available garments, and confirmed exchanges.
- **Device-held event access**: The private access credential for one participant in one event, kept per event on this device (from feature 002).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After creating an event, an organizer reaches a P2 showing the real event name and their organizer label in under 5 seconds of user time on a phone.
- **SC-002**: 100% of organizer visits to M1 show counts matching the event's current data after a load or refresh.
- **SC-003**: 0 regular-participant visits to P2 or M1 show organizer-only counts or the "Manage event" card.
- **SC-004**: 100% of visits to a closed event's P2 or M1 show the closed banner with the closure time.
- **SC-005**: 100% of visits without valid device access, for an unknown event, or during a connection failure end on a screen that explains the problem and offers a next action — never a blank screen.
- **SC-006**: P2 and M1 are fully usable without horizontal scrolling at 360px and 430px widths in manual verification.
- **SC-007**: The access credential and entry code appear in 0 log entries during testing.

## Assumptions

- The read-event capability from `specs/003-read-event` is available and is the source of all result fields and error categories; `docs/rules/dev/common/api-contract.md` remains the single source of truth for the shared contract.
- Device-held access and the existing event model, API client, error mapping, routes, and share UI from `specs/002-create-event-frontend` are reused.
- Scope is P2 (event banner, organizer manage card, closed banner, [Register my clothes]) and M1 (share, counts, refresh). P2 task cards (pending consent, alternatives, preferences, recommendations), bottom tabs, P1 (join), C2, and H3/closing are separate features; this feature uses placeholders for navigation targets that do not exist yet.
- The "Manage event" card on P2 is the M1 entry point; a header menu entry is deferred until a shared header exists.
- Data refreshes on screen open, on explicit user action, and every 30 seconds while an event screen is open, per the frontend data-fetching rules for event state; push/live updates are out of scope.
- H2 keeps rendering from the creation result kept on the device. Because it sits inside the event screens, it also gets the shared closed-event banner (one cached event read); its own content does not change.
- Session recovery on another device remains an open decision and is out of scope.
- Visual design follows the project's existing design system and theme, guided by `docs/flows/mockup-flow-v1.html`; exact visuals are decided during planning.
- Screens are verified manually at 360–430px widths; automated tests target non-trivial logic (result validation, error-to-screen-state mapping, organizer gating), per the project constitution.
