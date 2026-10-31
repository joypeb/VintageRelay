# Feature Specification: Photo Carousel and Clothing Details Form (C2)

**Feature Branch**: `014-clothing-register-form`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description (translated from Korean): "Looking at `specs/012-fix-photo-upload` and `specs/013-clothing-category-measure`, photo upload now supports multiple photos and registration accepts richer information. I want to change and add frontend work. 1. Registering my clothing takes two steps: first photo upload, second a page for title, description, measurements, and category. On the photo step, uploaded photos are stacked top to bottom, which is inconvenient to scroll. Show every photo in the same fixed aspect ratio (tapping a photo shows the original; the original is shown with an X at the top right and a blurred background so it stands out; pressing X closes it and returns to the photo step; because the ratio is fixed, a photo with a different ratio is fitted to the frame height and the sides are cropped), and let photos scroll left to right. On mobile this is a swipe/scroll, but when viewing the mobile layout on a PC, show arrows on the left and right of the photo area that move to the next photo, with a linear slide animation. 2. The second page (title, description, measurements, category) shows no photos and only lets the user enter title, description, category, and measurements, in that order from top: title, description, category, measurements. Tapping category opens a list to choose from."

This feature amends the C2 frontend from `specs/010-upload-photo-frontend` as changed by `specs/012-fix-photo-upload` (FR-016–FR-018), and builds the C2 step 2 form and registration call for the registration contract in `specs/011-register-read-clothing` as amended by 012 (photo list) and 013 (category, title, measurements). Everything in those specs still applies except where this spec overrides it.

## Clarifications

### Session 2026-10-31

- Q: Where does a successful [Register] take the participant? → A: To the event home (P2) with a "Clothing registered." confirmation; no new screen in this feature.
- Q: What fixed aspect ratio do step 1 photo frames use? → A: 3:4 portrait.
- Q: How are photos taller than 3:4 shown in the frame? → A: Fitted to the frame height and centered with empty space left and right; never cropped top or bottom.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse held photos in a horizontal fixed-ratio carousel (Priority: P1)

A participant on C2 step 1 adds several photos. Instead of a long vertical stack, the photos appear one at a time in a single fixed-ratio frame that the participant swipes left and right through. Each photo keeps its own status (waiting, preparing, uploading, ready, failed) and its [Remove]/[Try again] actions.

**Why this priority**: With up to 10 photos, the vertical stack pushes [Next] far down the page and makes the step tiring to use on a phone; this is the main complaint behind the feature.

**Independent Test**: On a phone-sized touch screen, add 5 photos of mixed orientations and verify they appear in one horizontal row of equal-size frames, swiping moves between them, the page height does not grow with each added photo, and every photo's status and actions still work.

**Acceptance Scenarios**:

1. **Given** 2 or more held photos, **When** step 1 is shown, **Then** the photos appear in a single horizontal row, all in frames of the same fixed aspect ratio, ordered as added (first photo leftmost), and the page height does not grow as photos are added.
2. **Given** a touch device, **When** the participant swipes horizontally over the photo row, **Then** it moves between photos and settles with one photo centered in view.
3. **Given** a photo whose aspect ratio differs from the frame, **When** it is shown in the row, **Then** it is scaled so its height fills the frame height and any horizontal overflow is cropped equally from both sides; it is never stretched or distorted.
4. **Given** a waiting, preparing, uploading, failed, or ready photo, **When** it is shown in the row, **Then** its status and its available actions ([Remove], [Try again]) are shown on or directly under that photo's frame, with the same lock rules as 012 FR-018.
5. **Given** fewer than 10 held photos, **When** step 1 is shown, **Then** [Add photo] stays reachable without scrolling through the photos, and a newly added photo is appended to the end of the row and brought into view.
6. **Given** the participant removes the photo currently in view, **When** the row updates, **Then** the neighbouring photo comes into view and no empty frame is left behind.
7. **Given** 2 or more held photos, **When** step 1 is shown, **Then** the participant can tell which photo is in view out of how many (for example, "2 / 5").

---

### User Story 2 - Move between photos with arrows on a desktop browser (Priority: P1)

A participant (or organizer demoing the app) opens C2 in the mobile layout on a desktop browser with a mouse. Left and right arrow buttons sit on the sides of the photo row; clicking one slides to the previous or next photo with a smooth, constant-speed animation.

**Why this priority**: Desktop browsers have no swipe gesture and horizontal mouse scrolling is unreliable, so without arrows the second and later photos are effectively unreachable when demoing on a PC.

**Independent Test**: In a desktop browser with a mouse, add 3 photos and verify the arrows appear, each click moves exactly one photo with a linear slide, the previous arrow is unavailable on the first photo and the next arrow on the last, and the arrows do not appear on a touch-only phone.

**Acceptance Scenarios**:

1. **Given** a device with a precise pointer (mouse or trackpad) and 2 or more held photos, **When** step 1 is shown, **Then** a previous arrow is shown on the left edge and a next arrow on the right edge of the photo row.
2. **Given** the arrows are shown, **When** the participant clicks the next (or previous) arrow, **Then** the row slides exactly one photo forward (or back) with a constant-speed (linear) animation that completes in about 300 ms.
3. **Given** the first photo is in view, **When** the arrows are shown, **Then** the previous arrow is disabled or hidden; **given** the last photo is in view, the next arrow is disabled or hidden. There is no wrap-around.
4. **Given** a touch-only device, **When** step 1 is shown, **Then** no arrows are shown and swiping is the way to move.
5. **Given** a keyboard user, **When** they focus an arrow and press Enter or Space, **Then** it behaves like a click; each arrow has an accessible name ("Previous photo", "Next photo").
6. **Given** the participant's device asks for reduced motion, **When** an arrow is used, **Then** the row moves to the target photo without the slide animation.
7. **Given** only 1 held photo, **When** step 1 is shown, **Then** no arrows and no position indicator are shown.

---

### User Story 3 - View a photo in full in an overlay (Priority: P2)

A participant taps a photo in the row to check it closely. The whole original photo opens in an overlay above the page, uncropped, with the page behind it blurred. An X button at the top right closes the overlay and returns to step 1 exactly as it was.

**Why this priority**: The fixed-ratio frame crops photos, so participants need a way to confirm the full photo they attached; it is secondary to moving through photos at all.

**Independent Test**: Add a wide photo that is cropped in its frame, tap it, verify the full uncropped photo is shown over a blurred background with an X at the top right, then close it and verify the step 1 state (photo in view, statuses, held photos) is unchanged.

**Acceptance Scenarios**:

1. **Given** a photo with an available image (local preview or uploaded image), **When** the participant taps or clicks it, **Then** an overlay opens showing the whole photo at its original aspect ratio, scaled to fit the screen without cropping.
2. **Given** the overlay is open, **When** it is shown, **Then** the page behind it is blurred and dimmed so the photo stands out, and an X close button with the accessible name "Close" is at the top right.
3. **Given** the overlay is open, **When** the participant presses X (or presses Escape on a keyboard), **Then** the overlay closes and step 1 is shown with the same photo in view, all photo statuses, and any in-progress upload unaffected.
4. **Given** the overlay is open, **When** the participant uses the page behind it, **Then** it does not scroll or respond; focus stays inside the overlay and returns to the tapped photo when the overlay closes.
5. **Given** an upload finishes or fails while the overlay is open, **When** the overlay is later closed, **Then** step 1 reflects the new status; the overlay itself is not interrupted.
6. **Given** a photo whose image cannot be shown (012 US1 scenario 3), **When** the participant taps it, **Then** no overlay opens and the existing "could not be displayed" message stays.

---

### User Story 4 - Enter title, description, category, and measurements on step 2 and register (Priority: P1)

After all photos are ready, the participant presses [Next] and reaches step 2, which shows no photos — only a title field at the top, then description, then category, then measurements. Tapping category opens a list of the four categories to pick from; the measurement fields shown depend on the chosen category. Pressing [Register] creates the garment with the held photos.

**Why this priority**: Without step 2 the participant cannot finish registering a garment at all; it delivers the 013 fields to users.

**Independent Test**: Complete step 1 with 2 ready photos, press [Next], verify step 2 shows no photos and the fields in the order title → description → category → measurements, pick `Top`, enter chest and sleeve only, press [Register], and verify a garment is created with both photos in order, the chosen category, trimmed title and description, and only the entered measurements.

**Acceptance Scenarios**:

1. **Given** every held photo is ready, **When** the participant presses [Next], **Then** step 2 is shown with no photos or photo previews, and its fields appear top to bottom in this order: Title, Description, Category, Measurements, followed by [Register] and [Back].
2. **Given** step 2, **When** the participant taps the Category field, **Then** a list opens with exactly Top, Outer, Bottom, and Other; choosing one closes the list and shows the chosen category in the field; dismissing the list without choosing keeps the previous value.
3. **Given** no category is chosen yet, **When** step 2 is shown, **Then** no measurement inputs are shown and the Measurements area tells the participant to choose a category first.
4. **Given** Top or Outer is chosen, **When** the Measurements area is shown, **Then** it offers optional inputs in inches for Total length, Chest, Shoulder, and Sleeve; **given** Bottom, it offers Total length, Waist, Hem, Inseam, and Thigh; **given** Other, it shows no inputs and says measurements are not needed for this category.
5. **Given** the participant changes the category after entering measurements, **When** the new category is chosen, **Then** measurement values that do not belong to the new category are cleared and are not sent; Total length is kept when both categories use it.
6. **Given** a valid title, description, and category, and any subset of valid measurements, **When** the participant presses [Register], **Then** the garment is registered with the held photos in order, the chosen category, the title, the description, and only the entered measurements (none sent when no measurement is entered), and [Register] shows a busy state and cannot be pressed again until the request settles.
7. **Given** a successful registration, **When** the response arrives, **Then** the participant is taken back to the event home with a short confirmation that the garment was registered, and the held photos and form are cleared so a later visit to C2 starts empty.
8. **Given** step 2, **When** the participant presses [Back], **Then** step 1 is shown with the same held photos, and returning to step 2 again keeps the title, description, category, and measurements already entered.

---

### User Story 5 - Step 2 input mistakes and failures are handled clearly (Priority: P2)

A participant leaves a required field empty, types an invalid measurement, or registration fails on the server. They see which field is wrong and why, nothing is lost, and they can fix it and try again.

**Why this priority**: Prevents frustrating dead ends and stops invalid data reaching the server, but only matters once the form exists.

**Independent Test**: Try submitting with each invalid input listed below and with a simulated server failure, and verify the field message, that no garment is created, and that entered values are kept.

**Acceptance Scenarios**:

1. **Given** an empty or whitespace-only title, an empty description, or no category, **When** the participant presses [Register], **Then** no request is sent and each such field shows a short message saying it is required.
2. **Given** a title over 100 characters or a description over 1,000 characters, **When** the participant types, **Then** a character counter shows the limit and the field prevents or flags input beyond it; a title cannot contain line breaks.
3. **Given** a measurement that is not a number, is 0 or less, or is above 120, **When** the participant presses [Register], **Then** no request is sent and that input shows "Enter a number from 0.1 to 120."
4. **Given** the server rejects the registration with a validation error, **When** the response arrives, **Then** the matching fields show their messages (or a general message if no field matches) and all entered values are kept.
5. **Given** the server rejects the registration because a photo is no longer usable (already attached or an invalid photo list), **When** the response arrives, **Then** the participant sees a message that the photos need to be added again and can return to step 1; **given** the server answers not found, the message says the event or some photos are no longer available and offers both returning to step 1 and going to the event home; **given** a previous attempt ended without a response and the retry answers "already attached", the message says the clothing may already be registered and offers going to the event home.
6. **Given** the event is closed or the participant is not authenticated, **When** registration is attempted, **Then** the existing closed-event and unauthenticated handling from 010 is shown.
7. **Given** a network failure, **When** registration fails, **Then** a message offers [Try again], all entered values and held photos are kept, and retrying sends the same registration.

### Edge Cases

- Exactly 1 photo: shown alone in the frame, no arrows, no position indicator.
- Exactly 10 photos: [Add photo] is hidden or disabled (012 rule) and all 10 are reachable by swipe or arrows.
- A very tall, narrow photo (e.g., a screenshot): fitted to the frame height, narrower than the frame, centered with empty space on both sides; never cropped vertically.
- A very wide panorama: fitted to the frame height and cropped on both sides; the overlay shows it in full.
- Rapid repeated arrow clicks: each click advances at most one photo from where the row will settle; the row never moves past the first or last photo.
- Browser window resized while on step 1: frames keep the fixed ratio and the photo in view stays in view.
- The overlay is open and the photo it shows is removed or its upload fails: the overlay keeps showing the image until closed (removing is not possible from inside the overlay).
- Measurement input with a comma decimal ("32,5") or trailing spaces: spaces are trimmed; a comma is treated as invalid input rather than silently guessed.
- Measurement decimals: up to one decimal place is accepted (e.g., 32.5).
- Leaving C2 (navigating away or reloading) discards held photos and form input, as in 010/012; there is no draft saving.
- Step 2 reached and then a photo becomes unusable on the server: handled by US5 scenario 5 on registration.
- The registration succeeds on the server but the response is lost: the retry is rejected as "already attached" and the participant is told the clothing may already be registered (US5 scenario 5), not asked to add photos again.
- The event closes while photos are held: the closed step 1 view uses the same carousel, read-only, without [Remove]/[Try again]/[Add photo].

## Requirements *(mandatory)*

### Functional Requirements

**Step 1 — photo carousel**

- **FR-001**: Step 1 MUST show held photos in a single horizontal row, one photo frame per photo, in the order added, replacing the vertical stack from 012, in both the active and the closed-event view (closed view is read-only). Adding photos MUST NOT increase the carousel height beyond one frame.
- **FR-002**: Every photo frame MUST use the same fixed aspect ratio of 3:4 (portrait) and the same width; the frame fills the width of the photo area.
- **FR-003**: A photo whose ratio differs from the frame MUST be scaled to fill the frame height without distortion; horizontal overflow MUST be cropped equally on both sides, and a photo narrower than the frame (taller than 3:4) MUST be centered with empty space on both sides and MUST NOT be cropped top or bottom.
- **FR-004**: On touch devices the row MUST move between photos by horizontal swipe and settle with exactly one photo in view.
- **FR-005**: On devices with a precise pointer (mouse/trackpad), previous and next arrow buttons MUST be shown on the left and right edges of the photo row when 2 or more photos are held; each activation MUST move exactly one photo with a linear (constant-speed) slide animation of about 300 ms. Arrows MUST NOT be shown on touch-only devices.
- **FR-006**: The previous arrow MUST be unavailable on the first photo and the next arrow on the last photo; the row MUST NOT wrap around.
- **FR-007**: Arrows MUST be keyboard operable and named "Previous photo" and "Next photo"; when the device requests reduced motion, moves MUST happen without animation.
- **FR-008**: With 2 or more held photos, step 1 MUST show the in-view position and total (e.g., "2 / 5").
- **FR-009**: Each photo's status and its [Remove]/[Try again] actions from 012 MUST stay available for the photo in view, following 012 FR-016–FR-018 unchanged (queue order, one upload in flight, lock rules, [Next] enabled only when all photos are ready).
- **FR-010**: [Add photo] MUST remain reachable without scrolling through photos while fewer than 10 are held; a newly added photo MUST be appended to the end and brought into view. Removing the in-view photo MUST bring a neighbouring photo into view.

**Step 1 — full photo overlay**

- **FR-011**: Tapping or clicking a photo that has a displayable image MUST open an overlay showing the whole photo at its original aspect ratio, fitted to the screen without cropping.
- **FR-012**: While the overlay is open, the page behind MUST be blurred and dimmed, MUST NOT scroll or respond to input, and focus MUST stay inside the overlay.
- **FR-013**: The overlay MUST have a close button marked X at its top right, named "Close"; pressing it or Escape MUST close the overlay and return to step 1 with the same photo in view, returning focus to that photo. Opening or closing the overlay MUST NOT change held photos or interrupt uploads.

**Step 2 — details form and registration**

- **FR-014**: Step 2 MUST NOT show any photo or photo preview. It MUST show, top to bottom: Title, Description, Category, Measurements, then [Register] and [Back].
- **FR-015**: Title MUST be required, a single line, 1–100 characters after trimming, with a visible character counter; Description MUST be required, multi-line, 1–1,000 characters after trimming, with a visible character counter (013 FR-002, FR-003). Characters are counted as Unicode code points, the same way the server counts them, for both validation and counters.
- **FR-016**: Category MUST be required and chosen from a list that opens when the field is tapped, offering exactly Top, Outer, Bottom, and Other (mapping to `top`, `outer`, `bottom`, `other`).
- **FR-017**: Measurements MUST be optional and depend on the category: Top/Outer offer Total length, Chest, Shoulder, Sleeve; Bottom offers Total length, Waist, Hem, Inseam, Thigh; Other and no category offer none, with a short explanatory note. All values are in inches and labelled as such.
- **FR-018**: Each entered measurement MUST be a number greater than 0 and at most 120 with at most one decimal place; empty inputs mean "not entered" and MUST NOT be sent. Changing category MUST discard values that do not belong to the new category.
- **FR-019**: [Register] MUST validate all fields before sending, show per-field messages for every failing field, and send nothing while any field is invalid.
- **FR-020**: A valid [Register] MUST send exactly one registration with the held photos in order, category, trimmed title, trimmed description, and only entered measurements (no measurements object when none entered), following the 011/012/013 contract. [Register] MUST be busy and not re-pressable until the request settles.
- **FR-021**: On success, the participant MUST be returned to the event home with a short "Clothing registered." confirmation, and the C2 photos and form MUST be cleared.
- **FR-022**: Server validation errors MUST be shown on the matching fields (or as a general message), photo-related rejections, not-found, and possibly-already-registered outcomes MUST be handled as in US5 scenario 5, closed-event and unauthenticated errors MUST reuse the existing handling, and network failures MUST offer [Try again]; in every failure case all entered values and held photos MUST be kept.
- **FR-023**: [Back] on step 2 MUST return to step 1 with held photos unchanged, and the step 2 values MUST be kept when the participant returns to step 2.
- **FR-024**: All new UI text MUST be in English (project rule).

### Key Entities

- **Held photo** (from 012): one of up to 10 photos on step 1 with its status; now presented as one slide of the carousel.
- **Carousel position**: which held photo is currently in view; used for the position indicator, arrows, and returning from the overlay.
- **Clothing details draft**: title, description, category, and category-dependent measurements entered on step 2; lives only while the participant stays on C2.
- **Clothing** (from 011/013): the garment created by [Register] from the held photos and the draft.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a 375×667 phone screen, the photo carousel area is the same height with 10 held photos as with 1 photo (versus ten stacked frames today).
- **SC-002**: In 100% of tested photos with mixed orientations, frames are identical in size and no photo appears stretched or squashed.
- **SC-003**: On a desktop browser with a mouse, a participant reaches the 5th of 5 photos in 4 arrow clicks, each completing in under half a second.
- **SC-004**: In 100% of tests, closing the overlay returns to step 1 with the same photo in view and no change to held photos or upload progress.
- **SC-005**: A participant with ready photos completes step 2 and registers a garment in under 1 minute in usability testing.
- **SC-006**: In 100% of client-invalid step 2 attempts (US5 scenarios 1–3), no registration request is sent and the failing field is identified; in 100% of server rejections (US5 scenarios 4–7), the matching message is shown and all entered values are kept.
- **SC-007**: In 100% of successful registrations, the created garment has the held photos in the same order and exactly the entered category, title, description, and measurements.

## Assumptions

- The fixed frame ratio is 3:4 portrait (decided in Clarifications) because clothing photos are mostly portrait. "Fit to height, crop the sides" is applied literally (confirmed in Clarifications).
- "PC viewing the mobile layout" is detected by pointer capability (precise pointer present) rather than screen width, so a desktop browser shows arrows and a phone does not. Hybrid touch laptops with a mouse may show both arrows and swipe.
- One photo is in view at a time (no partial "peek" of neighbours required); a peek may be added in design if it does not break FR-004/FR-005.
- The slide animation duration of about 300 ms is a default; "linear" means constant speed with no easing.
- The overlay shows the best available image of the photo: the uploaded image when ready, otherwise the local preview. Swiping between photos inside the overlay is out of scope.
- Registration success returns to the event home (decided in Clarifications) because the clothing list (C1), AI analysis review (C3), and clothing detail (C4) screens are not built yet; when they exist the destination may change to C3 per the screen flow.
- The registration API from 011 as amended by 012/013 is already implemented on the backend (commits for 011–013); this feature is frontend-only and adds no new API, error codes, or validation reasons.
- Editing an existing garment, reordering photos, choosing a main photo, saving drafts, and unit conversion (cm) are out of scope.
- Category labels shown to users are "Top", "Outer", "Bottom", and "Other", optionally with short examples (e.g., "Outer — jackets, coats").
