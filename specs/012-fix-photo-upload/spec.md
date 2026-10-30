# Feature Specification: Fix Photo Upload and Support Multiple Photos (C2)

**Feature Branch**: `012-fix-photo-upload`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description (translated from Korean): "There are errors and changes needed in the developed `specs/010-upload-photo-frontend`. 1. Photos are limited to 10 MB, so when a photo over 10 MB is uploaded, compress it to fit 10 MB. 2. Only JPEG, PNG, and WebP are supported; support JPG too. 3. After a successful upload the uploaded photo should appear on screen, but it does not." / Follow-up: "Backend and frontend integration only uploads one photo; it would be good to upload up to 10 photos."

This feature amends `specs/009-upload-photo` (backend) and `specs/010-upload-photo-frontend` (frontend), and changes the photo handoff used by `specs/011-register-read-clothing`. Everything in those specs still applies except where this spec overrides it.

## Clarifications

### Session 2026-10-30

- Q: Should the old single-photo registration shape stay supported once garments take 1–10 photos? → A: Replace it — registration accepts only an ordered list of 1–10 photos (`photoIds`); the single `photoId` shape is removed and garment details return the photo list.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Uploaded photo is visible after success (Priority: P1)

A participant chooses a clothing photo on C2, the upload succeeds, and the "Photo ready" state shows the actual uploaded image. Today the ready state shows a broken image with only its alt text ("Uploaded clothing photo"), because the returned display location does not resolve to the stored image.

**Why this priority**: This is a defect against 010 acceptance scenario 1.3 and SC-002; the participant cannot confirm which photo was attached.

**Independent Test**: Upload a valid photo on C2 in the local development setup and in a deployed-like setup, and verify the ready image renders (not alt text) and that opening its display location directly returns the image.

**Acceptance Scenarios**:

1. **Given** an upload that succeeds, **When** C2 shows "Photo ready", **Then** the uploaded image is rendered from the server-returned display location, upright, and no broken-image placeholder or alt text is shown.
2. **Given** the server-returned display location, **When** it is opened directly in a browser, **Then** it returns the stored image.
3. **Given** the uploaded image fails to load anyway (e.g., network drop), **When** the ready state is shown, **Then** the participant sees a short message that the photo could not be displayed, the held photo identity is kept, and [Remove] still works.

---

### User Story 2 - Photos larger than 10 MB are compressed instead of rejected (Priority: P1)

A participant chooses a phone photo larger than 10 MB. Instead of seeing "Choose a photo of 10 MB or less.", the app shrinks the photo on the device to 10 MB or less and uploads the smaller version automatically.

**Why this priority**: Modern phone cameras routinely produce large photos; rejecting them blocks clothing registration for many participants.

**Independent Test**: Choose JPEG, PNG, and WebP files over 10 MB and verify each is uploaded successfully, the uploaded copy is 10 MB or less, and no oversized request is ever sent.

**Acceptance Scenarios**:

1. **Given** a chosen photo larger than 10 MB in an allowed format, **When** it is checked before sending, **Then** the app compresses it on the device to 10 MB or less, shows a "Preparing photo…" busy state, and uploads the compressed version with the same single-upload-in-flight rules as 010.
2. **Given** a chosen photo of 10 MB or less, **When** it is checked, **Then** it is uploaded unchanged (no compression, no quality loss).
3. **Given** a photo whose compression cannot reach 10 MB or less, or whose image cannot be decoded on the device, **When** compression finishes, **Then** no request is sent and the photo step shows "This photo is too large. Choose a smaller photo." with [Choose another photo].
4. **Given** a photo is being compressed or uploaded, **When** the step is shown, **Then** only that photo's [Remove] and [Try again] are disabled until it settles; other photos and [Add photo] stay usable (FR-018).

---

### User Story 3 - ".jpg" photos are accepted (Priority: P2)

A participant chooses a photo whose name ends in ".jpg" (or whose device reports the type as "image/jpg"). It is accepted and uploaded like any JPEG.

**Why this priority**: ".jpg" is the most common name for JPEG photos; some devices report a non-standard "image/jpg" type, which 010 currently rejects with "Use a JPEG, PNG, or WebP photo."

**Independent Test**: Choose files named `.jpg`, `.JPG`, and `.jpeg`, including one reported as "image/jpg", and verify each uploads successfully.

**Acceptance Scenarios**:

1. **Given** a file reported as "image/jpg" or named with a ".jpg"/".JPG" extension, **When** it is checked before sending, **Then** it passes the local check and is uploaded.
2. **Given** the photo step help text and type error message, **When** they are shown, **Then** they mention JPG explicitly (help text "Add up to 10 JPG/JPEG, PNG, or WebP photos. Photos over 10 MB are compressed." and error "Use a JPG/JPEG, PNG, or WebP photo.").
3. **Given** the device picker, **When** it opens, **Then** ".jpg" files are selectable.

---

### User Story 4 - Up to 10 photos per garment (Priority: P1)

A participant registering clothing adds up to 10 photos (e.g., front, back, label, defects) instead of only one. Each photo shows in the C2 photo step as it becomes ready, and all ready photos are handed to the clothing registration step together. The garment then carries all of its photos.

**Why this priority**: One photo is not enough to judge second-hand clothing; buyers need to see the back, labels, and flaws. It changes the backend and frontend together, so it must be settled before 011 finishes.

**Independent Test**: On C2, add 1, 5, and 10 photos; verify each shows as ready, an 11th cannot be added, removing one frees a slot, and registering the garment keeps all ready photos in order.

**Acceptance Scenarios**:

1. **Given** C2 with fewer than 10 photos, **When** the participant chooses one or more photos, **Then** each is checked, compressed if needed (US2), uploaded, and shown as its own item in a photo list with its own ready/failed state, and the step shows a count such as "3 / 10 photos".
2. **Given** C2 with 10 photos, **When** the photo list is shown, **Then** [Add photo] is disabled and help text says the 10-photo limit is reached.
3. **Given** the participant selects more photos at once than the free slots, **When** the selection is checked, **Then** only the first photos up to the limit are taken and a message says how many were skipped.
4. **Given** a photo in the list, **When** the participant taps its [Remove], **Then** only that photo is removed from C2 state and a slot is freed; the other photos are unchanged and no delete request is sent.
5. **Given** one photo fails, **When** the failure is shown, **Then** only that item shows the error with [Try again] and [Remove]; the other photos are unaffected.
6. **Given** C2 step 1 with at least 1 photo and every photo ready, **When** the participant taps [Next], **Then** C2 moves to step 2 (description and registration) with the ready photos held in order.
7. **Given** C2 step 1 with any photo still preparing or uploading, or with no photos, **When** step 1 is shown, **Then** [Next] is disabled.
8. **Given** C2 step 1 with any failed photo, **When** step 1 is shown, **Then** [Next] is disabled and the step shows "Some photos failed to upload. Try again or remove them." next to the failed items.
9. **Given** ready photos on C2 step 2, **When** the garment is registered (011), **Then** all ready photos are attached to the garment in their list order, and the first photo is the garment's main photo in lists.
10. **Given** a registered garment, **When** its details are viewed, **Then** all of its photos are shown in order.

### Edge Cases

- A file of exactly 10 MB is uploaded unchanged; one byte over is compressed.
- A very large photo (e.g., 40 MB or very high resolution) is compressed, possibly by both lowering quality and reducing dimensions, while staying usable for viewing clothing details.
- A compressed photo keeps its upright orientation; rotation metadata is applied before compression so the result is not sideways.
- A PNG or WebP over 10 MB may be converted to JPEG during compression; the uploaded file is still an allowed type.
- A disguised non-image file over 10 MB fails to decode on the device and shows the too-large / choose-another message without sending a request.
- The participant leaves C2 during compression: no upload starts afterward and no error is shown elsewhere.
- HEIC stays rejected as in 010, regardless of size.
- Choosing 10 photos at once on a slow network: photos are prepared and uploaded one at a time in the order chosen; waiting photos show "Waiting" and [Next] stays disabled until the last one is ready.
- A garment registration request that names more than 10 photos, the same photo twice, or a photo already attached to another garment is rejected by the server.
- The participant goes back from step 2 to step 1: the held photos and their order are kept; adding or removing photos follows the same rules and [Next] re-checks that every photo is ready.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The display location returned for an uploaded photo MUST resolve to the stored image from the participant's browser in local development and in deployment, so the C2 ready state renders the uploaded image (fixes 010 FR-005 / SC-002).
- **FR-002**: If the ready image fails to load, C2 MUST show a non-blocking "could not display" message while keeping the held photo identity and its [Remove] action ([Change photo] from 010 is replaced by per-photo [Remove] plus [Add photo], FR-018).
- **FR-003**: For an allowed-format photo larger than 10 MB, the app MUST compress it on the device to 10 MB or less before sending, replacing 010's local "over 10 MB → reject" rule; photos of 10 MB or less MUST be sent unchanged.
- **FR-004**: Compression MUST preserve upright orientation and MUST produce one of the allowed upload types.
- **FR-005**: If compression cannot reach 10 MB or less or the image cannot be decoded, the app MUST send no request and show "This photo is too large. Choose a smaller photo." with a re-choose action.
- **FR-006**: While compressing, the app MUST show a busy state on that photo and announce it to assistive technology; locking follows FR-018.
- **FR-007**: The local type check MUST accept "image/jpg" and the ".jpg" extension (case-insensitive) in addition to JPEG, PNG, and WebP; the device picker MUST allow ".jpg" files.
- **FR-008**: Help text and the unsupported-type message MUST name JPG alongside JPEG, PNG, and WebP; all text stays in English.
- **FR-009**: The server-side 10 MB per-photo limit and allowed types from `specs/009-upload-photo` MUST remain unchanged; the server is still the final check.
- **FR-010**: C2 MUST let the participant hold 1 to 10 photos for one garment, each with its own preview, state, and [Remove]; adding beyond 10 MUST be impossible.
- **FR-011**: A failure on one photo MUST NOT affect the others; each failed photo MUST offer its own retry and remove.
- **FR-012**: Clothing registration MUST accept 1 to 10 of the caller's unattached photos from the same event, attach them all in one step (all or none), and keep their order; the first photo is the main photo.
- **FR-013**: The server MUST reject registration with 0 or more than 10 photos, duplicate photos, or any photo that is attached, from another event, or uploaded by another participant, using the existing error codes where they apply.
- **FR-014**: Every garment response (register, list, details) MUST return all photos in order; list screens MUST use the first photo as the single main photo.
- **FR-015**: The single-photo registration shape (`photoId`) MUST be replaced, not kept alongside: registration accepts only an ordered photo list (`photoIds`, 1–10), and garment details return the ordered photo list. No compatibility path is needed because nothing is released yet.
- **FR-016**: C2 MUST be a two-step page: step 1 is the photo step (1–10 photos), step 2 is description and registration (011). In this feature step 2 shows the ready photos in order with [Back] only; the description field, the registration call, and the garment details screen belong to the later register-clothing frontend feature, so US4 scenarios 9–10 and SC-006 are verified through the API in this feature. [Next] MUST be enabled only when at least 1 photo exists and every photo is ready; any preparing, uploading, or failed photo MUST block moving on, and failed photos MUST show a retry prompt.
- **FR-017**: Photos MUST be prepared and uploaded one at a time in the order chosen (at most 1 upload request in flight, keeping 010 FR-008); photos not yet started MUST show a "Waiting" state, and a failed photo MUST NOT stop the queue for the photos after it; [Try again] puts the failed photo back at the end of the queue.
- **FR-018**: Only the photo currently preparing or uploading MUST be locked (no [Remove] or [Try again] on it); [Add photo] while fewer than 10 photos are held and [Remove]/[Try again] on waiting, ready, or failed photos MUST stay available, with new photos appended to the end of the queue. This replaces 010 FR-008's lock-everything rule; at most 1 upload request is still in flight (FR-017), and the counted photos (including waiting ones) never exceed 10.

### Key Entities

- **Photo upload state** (from 010): becomes a list of up to 10 items, each waiting → preparing (compressing) → uploading → ready or failed; at most one item is preparing or uploading at a time.
- **Garment photo set**: The ordered 1–10 photos attached to one garment; the first is the main photo.
- **Uploaded photo display location** (from 009/010): must point to where the stored image is actually served.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of successful uploads in testing, the ready state on C2 shows the uploaded image rather than a broken image or alt text.
- **SC-002**: 100% of tested allowed-format photos between 10 MB and 40 MB are uploaded successfully at 10 MB or less, with 0 oversized requests sent.
- **SC-003**: Compression of a typical 12–20 MB phone photo completes in under 5 seconds on a mid-range phone.
- **SC-004**: 100% of tested ".jpg"/".JPG"/"image/jpg" files pass the local check and upload successfully.
- **SC-005**: Photos of 10 MB or less are uploaded byte-for-byte unchanged.
- **SC-006**: A garment can be registered with 10 photos and its details return all 10, in order (verified through the API in this feature; on-screen details come with the register-clothing frontend feature).
- **SC-007**: 0 garments are created with more than 10 photos or with a photo belonging to another garment, participant, or event.

## Assumptions

- Root cause of the missing image (observed in code): the backend builds the photo display location from `APP_BASE_URL` (the frontend origin, `http://localhost:3000`), but photos are served by the backend under `/api/v1/photos/{id}` and the frontend does not route that path to the backend. The fix may either make the frontend origin serve/forward that path or build the location from the backend's public origin; the choice is made during planning.
- Compression runs on the participant's device (no extra server work); lowering quality and, if needed, reducing dimensions is acceptable, as photos only need to show clothing clearly.
- Converting oversized PNG/WebP to JPEG during compression is acceptable (clothing photos rarely need transparency).
- The backend already detects JPEG by content, so ".jpg" support is a frontend-only change.
- Multiple photos touch the clothing registration and details contract in `specs/011-register-read-clothing` (currently one `photoId`) and `docs/plans/api/06-register-read-clothing.md`; that contract are updated as part of this feature (no new error codes or validation reasons, so `docs/rules/dev/common/api-contract.md` is unchanged). The upload endpoint stays one photo per request.
- Photos keep the order they were added; reordering or picking a different main photo is out of scope (remove and re-add to change order).
- No other 010 behavior (error mapping, closed/unauthenticated states, retention, logging rules) changes.
