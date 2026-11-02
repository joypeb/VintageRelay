# Feature Specification: App Shell — Landing Event List and Bottom Tabs

**Feature Branch**: `impeccable-init-feature-015`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "015 App shell: landing event list and bottom tabs (frontend only). Landing (S0) lists events already joined on this device (sessions in localStorage) with name and Active/Closed from GET /api/v1/events/{event_id}; tapping opens the event home; entries answering 401/404 are removed; Create event and Join with code or QR remain. Every in-event screen except the created/share screen (H2) gets bottom tabs Home | Search | Trades | My items. Search and Trades show "Coming soon" empty states; My items shows a placeholder with [+ Register item] linking to the existing registration form. The organizer's Manage event moves from the Home card to a header menu. No backend changes. Sources: docs/plans/features/015-app-shell.md, docs/superpowers/specs/2026-11-02-app-flow-redesign-design.md (4.1, 5, 6), docs/flows/screen-flow-v1.md (3, 4.1, 6), docs/flows/mockup-flow-v2.html (screens 1-2), docs/plans/api/02-read-event.md, docs/rules/dev/frontend/project-structure.md (2)."

## Clarifications

### Session 2026-11-02

- Q: In what order does the landing "Your events" list show joined events? → A: Newest first; add a saved timestamp to the session record.
- Q: Which tab icons are used, and is a badge slot reserved on the Trades tab? → A: Astryx default tab-bar icons; no badge slot in this feature (badge arrives with 020).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Returning participant reopens a joined event (Priority: P1)

A participant who already joined one or more events on this device opens the app and sees a "Your events" list above the Create and Join actions. Each entry shows the event name and whether it is Active or Closed. Tapping an entry opens that event's home. Entries this device can no longer open are removed from the list.

**Why this priority**: This is the landing-screen core job from the redesign: returning users reach their event in one tap instead of rejoining. Without it the app shell has no landing value.

**Independent Test**: Can be fully tested by saving two event sessions on a device, loading the landing screen, and tapping an entry; it delivers a visible joined-event list with correct states and navigation to the event home.

**Acceptance Scenarios**:

1. **Given** this device holds sessions for two joined events, **When** the user opens the landing screen, **Then** both events appear above Create event and Join actions, each showing its name and Active or Closed state.
2. **Given** a saved entry whose access is no longer valid (unauthenticated or not found), **When** the landing screen loads that entry, **Then** the entry is removed from this device and no longer shown.
3. **Given** the "Your events" list is shown, **When** the user taps an event, **Then** the app opens that event's home screen.
4. **Given** this device holds no usable event sessions, **When** the user opens the landing screen, **Then** no event list is shown and Create event plus Join with code or QR remain available.

---

### User Story 2 - Navigating inside an event with bottom tabs (Priority: P2)

A participant inside an event uses four bottom tabs — Home, Search, Trades, My items — on every in-event screen except the created/share screen. The current tab is highlighted. Search and Trades show "Coming soon" empty states; My items shows a placeholder with a [+ Register item] action that opens the existing registration form.

**Why this priority**: Tabs are the final skeleton every later feature builds on. Placeholders keep Search, Trades, and My items honest until 016–020 ship real content.

**Independent Test**: Can be fully tested by opening each in-event screen and confirming the tab bar presence, highlight, and placeholder content; it delivers consistent in-event navigation without backend changes.

**Acceptance Scenarios**:

1. **Given** the user is on any in-event screen except the created/share screen, **When** the screen renders, **Then** bottom tabs Home, Search, Trades, and My items are visible in that order with the current tab highlighted.
2. **Given** the user opens the created/share screen right after event creation, **When** the screen renders, **Then** no bottom tab bar is shown.
3. **Given** the user taps the Search tab, **When** it opens, **Then** a "Coming soon" empty state is shown and no search results or filters are offered.
4. **Given** the user taps the Trades tab, **When** it opens, **Then** a "Coming soon" empty state is shown and no request or exchange actions are offered.
5. **Given** the user taps the My items tab, **When** it opens, **Then** a placeholder with a [+ Register item] action is shown, and activating it opens the existing clothing registration form.

---

### User Story 3 - Organizer opens event management from the header menu (Priority: P3)

An organizer inside their event opens Manage event from a header menu. The Home screen no longer shows a Manage card. Non-organizers never see the Manage entry.

**Why this priority**: Keeps organizer tools reachable without a fifth tab and removes the old Home card, matching the approved information architecture.

**Independent Test**: Can be fully tested by opening an event as organizer and as non-organizer; it delivers organizer-only access to management from the header.

**Acceptance Scenarios**:

1. **Given** the user is the event organizer, **When** they open the header menu inside the event, **Then** a Manage event entry is available and opens event management.
2. **Given** the user is not the organizer, **When** they open the header menu inside the event, **Then** no Manage event entry is shown.
3. **Given** any user views the Home tab, **When** the home content renders, **Then** no Manage event card is shown.

---

### Edge Cases

- What happens when all saved sessions are invalid? The list ends up empty; the screen falls back to Create and Join only.
- What happens when an event closes between the landing load and tapping it? The event opens showing the closed state with the closed banner and read-only tabs.
- How does the landing handle an unreadable saved session record? It is treated as invalid and removed without blocking the remaining entries.
- What happens when there is no network while loading the landing list? Entries whose state cannot be confirmed stay listed without a wrong state, and the user can retry.
- How do closed events behave under tabs? All tabs stay readable; request, register, edit, delete, and management actions are hidden.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Landing MUST list events already joined on this device above the Create event and Join actions, ordered newest first, each showing the event name and Active or Closed state.
- **FR-002**: Landing MUST open the tapped event's home screen.
- **FR-003**: Landing MUST remove saved entries this device can no longer open (unauthenticated or not found) so they are not shown again.
- **FR-004**: Landing MUST keep Create event and Join with code or QR available below the joined-event list and when no usable sessions exist.
- **FR-005**: Every in-event screen except the created/share screen MUST show bottom tabs in the order Home, Search, Trades, My items, with the current tab highlighted.
- **FR-006**: The created/share screen MUST NOT show the bottom tab bar.
- **FR-007**: The Search tab MUST show a "Coming soon" empty state with no search or filter actions in this feature.
- **FR-008**: The Trades tab MUST show a "Coming soon" empty state with no request or exchange actions in this feature.
- **FR-009**: The My items tab MUST show a placeholder with a [+ Register item] action that opens the existing clothing registration form.
- **FR-010**: Manage event MUST be reachable from a header menu and shown only to the event organizer; it MUST NOT appear as a fifth tab.
- **FR-011**: The Home tab MUST NOT show a Manage event card.
- **FR-012**: Closed events MUST keep all tabs readable while hiding request, register, edit, delete, and management actions.
- **FR-013**: This feature MUST NOT change backend behavior or require new backend endpoints.

### Key Entities

- **Saved event entry**: A reference on this device to an already-joined event; carries what is needed to display its name and Active or Closed state and to open its home.
- **Tab navigation**: Four in-event destinations (Home, Search, Trades, My items) with a defined order and current-tab highlight; absent on the created/share screen.
- **Organizer management entry point**: A header-menu action visible only to the organizer that opens event management.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Returning participants see every accessible saved event on the landing screen with its correct name and Active or Closed state above the Create and Join actions.
- **SC-002**: Tapping a listed event opens that event's home in a single tap.
- **SC-003**: Saved entries the device can no longer open disappear from the landing list and do not reappear on the next visit.
- **SC-004**: Every in-event screen except the created/share screen shows the four tabs in order with the current tab highlighted; the created/share screen shows none.
- **SC-005**: Participants reaching the Search, Trades, or My items tabs encounter the agreed empty or placeholder state, and the My items placeholder leads to the existing registration form.
- **SC-006**: Organizers reach event management from the header menu while non-organizers see no such entry, and no Home screen shows a Manage card.

## Assumptions

- Saved sessions exist only on the device that joined; the landing list is ordered newest first using a saved timestamp on the session record (confirmed in clarify 2026-11-02).
- The existing clothing registration form is reused as is for the My items [+ Register item] action.
- Tabs use the default tab-bar icons of the installed component set; no Trades badge slot is added in this feature (badge arrives with 020; confirmed in clarify 2026-11-02).
- Interface language is English; screens are verified at 360–430 px widths with screenshots in the PR.
- No backend, contract, or error-code changes are needed; event name and state come from the existing event-read capability.
