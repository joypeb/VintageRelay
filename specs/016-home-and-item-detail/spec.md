# Feature Specification: Home Grid and Item Detail

**Feature Branch**: `016-home-and-item-detail`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "016 Home grid and item detail (frontend only; backend API 06 already exists). Home (P2) shows other participants' available garments from GET /api/v1/events/{event_id}/clothing?ownership=others&status=available, newest first, two per row, each card a 3:4 main photo with the title below, with empty, loading, and error states. Tapping a card opens item detail (B3) at items/[itemId] using GET /api/v1/clothing/{clothing_id}: the 014 photo carousel and full-photo overlay, category, title, entered measurements in inches, description, owner name with organizer badge, and withdrawn state when applicable. [Request exchange] is visible but disabled ("Coming soon") until exchange requests ship. Keep the event header and "Clothing registered." status on Home. Sources: docs/plans/features/016-home-and-item-detail.md, docs/superpowers/specs/2026-11-02-app-flow-redesign-design.md (4.1, 5), docs/flows/screen-flow-v1.md (4.2), docs/flows/mockup-flow-v2.html (screens 2-3), docs/plans/api/06-register-read-clothing.md, specs/014-clothing-register-form/spec.md."

## Clarifications

### Session 2026-11-02

- Q: When does Home refresh its garment list? → A: On screen focus and via pull-to-refresh only; no periodic polling.
- Q: Is the owner's display name shown on Home cards or only on the item detail? → A: Title-only cards; the owner name (with organizer badge when applicable) is shown only on the item detail.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse other participants' available garments on Home (Priority: P1)

A participant opens the Home tab of an event they joined and sees a marketplace grid of garments registered by other participants that are still available for exchange, newest first. Each card shows the main photo in a 3:4 frame with the garment title below it. Tapping a card opens that garment's detail. When nobody else has registered an available garment yet, the participant sees an empty state that invites them to register items.

**Why this priority**: This is the Home tab's core job from the redesign: browsing what others offer. Without it Home has no marketplace value and later features (search, requests) have nothing to build on.

**Independent Test**: Can be fully tested by joining an event where other participants hold available garments, opening Home, and tapping a card; it delivers a two-column newest-first grid with correct photos and titles plus navigation to the item detail.

**Acceptance Scenarios**:

1. **Given** other participants hold available garments in this event, **When** the user opens Home, **Then** the garments appear as cards two per row, newest first, each showing its main (first) photo in a 3:4 frame with its title below.
2. **Given** the Home grid is shown, **When** the user taps a card, **Then** the app opens the item detail for that garment.
3. **Given** no other participant holds an available garment, **When** the user opens Home, **Then** an empty state is shown that invites the participant to register items.
4. **Given** the garment list is loading, **When** the user opens Home, **Then** a loading state is shown instead of an empty grid or stale items.
5. **Given** the garment list cannot be loaded, **When** the failure occurs, **Then** an error state is shown with a way to retry, and no wrong items are displayed.

---

### User Story 2 - Inspect another participant's garment on the item detail (Priority: P1)

A participant who found an interesting card opens the item detail and sees every photo in order through the familiar carousel, plus the category label, title, only the measurements the owner entered (in inches), the description, and the owner's display name with an organizer badge when the owner is the organizer. A garment that has been withdrawn still opens (for example from a saved link) with a clear withdrawn state instead of looking available.

**Why this priority**: Participants judge fit and condition here before any exchange; wrong or missing detail directly causes failed in-person exchanges.

**Independent Test**: Can be fully tested by opening the detail of garments with several photos, with and without measurements, owned by organizer and non-organizer, and a withdrawn garment; it delivers correct photos, fields, owner presentation, and withdrawn state.

**Acceptance Scenarios**:

1. **Given** a garment with several photos, **When** the user opens its detail, **Then** all photos appear in order in the carousel with the same swipe, arrow, position, reduced-motion, and full-photo overlay behavior as the registration-form carousel.
2. **Given** the item detail is shown, **When** the user reads the fields, **Then** the category label, title, description, and only the measurements the owner entered (each labelled in inches) are visible, and no AI estimates are shown.
3. **Given** a garment with no entered measurements, **When** the user opens its detail, **Then** no measurements are shown (never zeros or placeholders).
4. **Given** the owner is the event organizer, **When** the user opens the detail, **Then** the owner name carries an organizer badge; **given** a non-organizer owner, no organizer badge is shown.
5. **Given** a withdrawn garment of another participant, **When** the user opens its detail directly, **Then** the detail shows its withdrawn state and does not present it as available for exchange.

---

### User Story 3 - See that exchange requests are not available yet (Priority: P2)

A participant on the item detail sees the [Request exchange] action but understands it cannot be used yet. The button is visible but disabled with a short "Coming soon" note, so nobody expects a working request flow before exchange requests ship.

**Why this priority**: Keeps the detail honest about the roadmap and reserves the action's place for 020 without letting anyone start an exchange early.

**Independent Test**: Can be fully tested by opening any item detail and attempting the request action; it delivers a visible-but-disabled button with the coming-soon note and no request side effect.

**Acceptance Scenarios**:

1. **Given** any item detail, **When** it renders, **Then** [Request exchange] is visible but disabled with a short "Coming soon" note.
2. **Given** the disabled [Request exchange], **When** the user activates it, **Then** nothing happens (no request is created and no offer sheet opens).

---

### User Story 4 - Keep the event header and registration confirmation on Home (Priority: P3)

A participant who just registered clothing returns to Home and still sees the event header and the short "Clothing registered." confirmation, exactly as after registration today. Home keeps working as the post-registration landing until My items takes over that role in 017.

**Why this priority**: Prevents a regression in the existing registration flow while the grid is added around it.

**Independent Test**: Can be fully tested by registering a garment and returning to Home; it delivers the unchanged header and confirmation above or alongside the new grid.

**Acceptance Scenarios**:

1. **Given** the user opened Home, **When** the screen renders, **Then** the event header (name, state, own display name) is shown as before.
2. **Given** the user just registered clothing, **When** Home renders with the registration flag, **Then** the "Clothing registered." confirmation is shown.

---

### Edge Cases

- What happens when the same garment appears with `isMine = true` in the others-only list? It is excluded; Home never shows the viewer's own garments even if the server response changes.
- What happens when a garment has exactly 1 photo? The card shows it; the detail carousel shows a single frame with no arrows and no position indicator.
- What happens when a garment has 10 photos? The card still shows only the main photo; the detail carousel reaches all 10 by swipe or arrows.
- What happens when a photo fails to load (card or detail)? A fallback is shown in place of the photo; the rest of the card or detail stays usable.
- What happens when the title is very long? The card truncates it to a fixed number of lines without breaking the two-column layout; the detail shows the full title.
- What happens when the detail id does not exist or belongs to another event? A not-found state is shown with a way back to Home.
- What happens when the viewer loses access (invalid session) while Home or detail is open? The existing unauthenticated handling is shown; no garment data is kept visible that the viewer may not see.
- What happens when the event is closed? Home and detail stay readable; the register action and any request affordance stay hidden or disabled per the closed-event rule.
- What happens when the list is empty because every garment is confirmed or withdrawn? The same empty state as no registrations is shown, since confirmed and withdrawn garments never appear on Home.
- How does Home handle a garment registered while the user is looking at Home? The new garment becomes visible after the next refresh of the list; no live push is required in this feature.
- What happens when measurements exist for a category that no longer allows them (old data)? Only values present in the response are shown with their labels; nothing is invented or converted.

## Requirements *(mandatory)*

### Functional Requirements

**Home grid (P2)**

- **FR-001**: Home MUST list garments from `GET /api/v1/events/{event_id}/clothing` with `ownership=others` and `status=available`, so the viewer's own garments and confirmed or withdrawn garments never appear.
- **FR-002**: Home MUST order cards newest first (registration order, newest at the top-left).
- **FR-003**: Home MUST lay cards out two per row; each card MUST show the main (first) photo in a 3:4 frame with the garment title below it.
- **FR-004**: Home cards MUST show only the main photo and the title; they MUST NOT show the owner name (the owner is shown on the item detail).
- **FR-005**: Each Home card MUST navigate to the item detail of that garment when tapped.
- **FR-006**: When no available garments of others exist, Home MUST show an empty state that invites the participant to register items.
- **FR-007**: While the list is loading, Home MUST show a loading state; when loading fails, Home MUST show an error state with a retry action and MUST NOT show stale or invented items.
- **FR-008**: Home MUST refresh the list when the screen regains focus and via pull-to-refresh; it MUST NOT poll periodically.
- **FR-009**: Home MUST keep the existing event header (event name, Active or Closed state, own display name) and the "Clothing registered." confirmation behavior unchanged.

**Item detail (B3)**

- **FR-010**: The item detail MUST live at `items/[itemId]` and load its garment with `GET /api/v1/clothing/{clothing_id}`.
- **FR-011**: The detail MUST show all photos in order in the photo carousel reused from the registration form: one 3:4 frame at a time, horizontal swipe on touch devices, previous/next arrows on precise pointers only, position indicator for 2 or more photos, linear slide animation with reduced-motion fallback, and the full-photo overlay (whole photo uncropped over a blurred background, X close at top right, Escape closes, focus trapped and restored).
- **FR-012**: The detail MUST show the category label using the same category names as registration (Top, Outer, Bottom, Other).
- **FR-013**: The detail MUST show the full title and the full description exactly as registered.
- **FR-014**: The detail MUST show only the measurements the owner entered, each labelled in inches; when none were entered it MUST show no measurements section rather than zeros.
- **FR-015**: The detail MUST show the owner's display name and an organizer badge only when the owner is the organizer.
- **FR-016**: The detail MUST NOT show AI estimates (colors, materials, or similar); AI output arrives in a later feature.
- **FR-017**: A withdrawn garment of another participant opened directly MUST show its withdrawn state and MUST NOT present exchange actions as available.
- **FR-018**: A garment id that does not exist or belongs to another event MUST show a not-found state with a way back to Home.
- **FR-019**: [Request exchange] MUST be visible but disabled on the detail with a short "Coming soon" note, and activating it MUST NOT create a request or open an offer sheet.

**Cross-cutting**

- **FR-020**: Closed events MUST keep Home and the item detail readable while hiding or disabling registration and request actions per the closed-event rule.
- **FR-021**: Unauthenticated access MUST reuse the existing unauthenticated handling on both Home and the item detail.
- **FR-022**: This feature MUST NOT change backend behavior and MUST NOT require new backend endpoints or error codes.
- **FR-023**: All new UI text MUST be in English.

### Key Entities *(include if feature involves data)*

- **Home card**: A garment of another participant shown on Home; carries its main photo and title only (the owner is shown on the item detail), and links to its detail.
- **Clothing detail**: A single garment with all photos in order, category, title, entered measurements in inches, description, owner name with organizer badge when applicable, and availability state.
- **Garment owner**: The participant who registered the garment; identified by display name plus whether they organize the event.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Participants opening Home see every other participant's available garment exactly once, newest first, two per row, each with its correct main photo in a 3:4 frame and its title below.
- **SC-002**: When no other participant has an available garment, participants see the empty state inviting them to register items instead of an empty grid.
- **SC-003**: Tapping any Home card opens the matching garment's detail in a single tap.
- **SC-004**: Participants opening a detail see all of its photos in order with working swipe, arrows (on precise pointers), and full-photo overlay, plus the correct category, full title, full description, only the entered measurements labelled in inches, and the owner name with organizer badge only for organizers.
- **SC-005**: Participants never see AI estimates anywhere in this feature, and activating [Request exchange] never creates a request.
- **SC-006**: Participants opening a withdrawn garment directly, a missing garment, or a failed load always get the matching withdrawn, not-found, or error state with a way to continue, and never a garment presented as available by mistake.
- **SC-007**: Participants who just registered clothing still see the event header and the "Clothing registered." confirmation on Home.

## Assumptions

- Backend list and detail behavior follows the agreed clothing API: visibility rules (others' withdrawn garments never listed; a directly opened withdrawn garment returns its withdrawn state), newest-first default order, full `Clothing` shape with photos in order, null for unentered measurements, and owner with organizer flag.
- The app shell from the previous feature exists: bottom tabs (Home, Search, Trades, My items) and the header menu; this feature only fills the Home tab content and the item detail route.
- The photo carousel and full-photo overlay behavior is reused from the registration form without visual changes (3:4 frames, arrows on precise pointers, position indicator, reduced motion, overlay with X and Escape).
- Registration still returns to Home with the confirmation flag; the move of the post-registration landing to My items happens in the next feature.
- Category display names shown to users are Top, Outer, Bottom, and Other.
- Interface language is English; layouts are verified at 360–430 px widths with screenshots.
- Garment list filtering by category and text search belong to the later search feature, not to Home.
