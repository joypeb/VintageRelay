# Feature Specification: Upload Photo Frontend (Mobile)

**Feature Branch**: `feature/frontend-upload-photo`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: `"specs/009-upload-photo need to develop frontend"`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Participant uploads a clothing photo in C2 (Priority: P1)

A participant who wants to register clothing opens C2 (Register clothing) from C1 and adds one clothing photo from the phone camera or album. The photo starts uploading while the participant stays on C2, a local preview is shown immediately, and once the upload succeeds the uploaded image is shown as ready with a viewable image. The returned photo identity is kept on C2 so the later clothing registration step can attach it.

**Why this priority**: Every garment with a photo depends on this step. Today C2 (`my-items/new`) only shows a "coming soon" notice, so no photo can be attached at all.

**Independent Test**: Create an event, join as a participant, open C2, choose a valid JPEG, PNG, and WebP file at or below the size limit, verify each shows a local preview then a ready uploaded image viewable at its display location, and verify the photo identity is held on C2 for registration.

**Acceptance Scenarios**:

1. **Given** C2 for an active event, **When** it renders, **Then** it shows a labeled photo step with [Choose photo] (camera/album choice left to the device picker), the accepted formats and 10 MB limit in help text, and no Register action enabled by this feature.
2. **Given** the photo step, **When** the participant chooses one image file, **Then** a local preview appears immediately, the upload starts automatically, an uploading state is shown, and choosing another file or the same control is limited to one upload at a time until it settles.
3. **Given** an upload in flight, **When** it succeeds, **Then** C2 shows the uploaded image viewable at its returned display location, a "Photo ready" state, and [Change photo] and [Remove] actions; the photo identity is kept on C2 for the later registration step.
4. **Given** a photo taken with rotation or location metadata, **When** the upload succeeds, **Then** the shown uploaded image displays upright.
5. **Given** an uploaded photo held on C2, **When** the participant chooses a different file, **Then** the previous preview is replaced, the previous photo identity is discarded from C2 state (the server copy is left as-is per the indefinite-retention decision), and the new file uploads as a new photo.
6. **Given** an uploaded photo held on C2, **When** the participant taps [Remove], **Then** the preview and the held photo identity are cleared and C2 returns to the empty photo step; nothing is sent to delete the server copy.

---

### User Story 2 - Upload problems are explained and recoverable (Priority: P1)

When a photo cannot be used or stored, the participant sees why in plain language next to the photo step, keeps the chosen file information where possible, and can retry without losing their place on C2.

**Why this priority**: Phone photos vary in size and format, and flea-market networks fail; a dead end here blocks all clothing registration.

**Independent Test**: Attempt each failure class (no file, empty file, too-large file, disallowed type including HEIC, disguised file, closed event, unauthenticated, event not found, connection failure, internal error, unexpected response) and verify the message, the remaining C2 state, and that retrying works.

**Acceptance Scenarios**:

1. **Given** [Choose photo] with no file chosen, **When** no file is available, **Then** no request is sent and the photo step prompts the participant to choose a file.
2. **Given** a chosen file larger than 10 MB or with an empty body, **When** it is checked before sending, **Then** no request is sent for the oversized or empty case and the photo step shows "Choose a photo of 10 MB or less." or "The chosen file is empty. Choose another photo.", keeping the step usable.
3. **Given** a chosen file whose type or extension is not JPEG, PNG, or WebP (including HEIC), **When** it is checked before sending, **Then** no request is sent and the photo step shows "Use a JPEG, PNG, or WebP photo."; a disguised file that passes the local check but is rejected by the server shows the server-provided message instead.
4. **Given** an upload rejected because the file is too large, **When** the result arrives, **Then** the photo step shows a size message naming the 10 MB limit (preferring the server-provided message), keeps the file name where the device exposes it, and offers [Try again] with [Choose another photo].
5. **Given** an upload rejected as an unsupported type, **When** the result arrives, **Then** the photo step shows a type message listing JPEG, PNG, and WebP (preferring the server-provided message) with the same retry and re-choose actions.
6. **Given** an upload rejected because the event is closed, **When** the result arrives, **Then** C2 shows the closed event state ("This event has ended.") with the photo step disabled and no further upload or Register action offered by this feature.
7. **Given** an upload rejected as unauthenticated, **When** the result arrives, **Then** C2 shows the existing "not joined on this device" guidance with [Join with entry code] and [Go to start], and the photo step is disabled until access exists.
8. **Given** an upload rejected as not found (event no longer matches, or access belongs to another event), **When** the result arrives, **Then** C2 shows "This event could not be found." with [Go to start].
9. **Given** an upload that fails with a connection failure, timeout, internal error, validation error, malformed-request error, or unexpected response, **When** the failure is shown, **Then** C2 shows an error message at the photo step (preferring the server-provided message), keeps the chosen file information where the device exposes it, and the participant can retry with [Try again] or choose another file.

---

### User Story 3 - Photo stays ready while the participant prepares registration (Priority: P2)

Once a photo is ready, it stays visible and attached to C2 state while the participant stays on C2, and repeated taps or slow networks never create confusing duplicates on screen.

**Why this priority**: The upload runs while the participant types the description (per the API plan), so the ready state must be stable; it is less critical than getting the first upload and its errors right.

**Independent Test**: Upload a photo, keep C2 open, verify the ready state persists; double-tap upload controls and attempt change/remove mid-upload (controls stay locked) and verify at most one upload is in flight.

**Acceptance Scenarios**:

1. **Given** a ready uploaded photo, **When** C2 stays open, **Then** the ready image and photo identity remain until the participant changes or removes the photo; no second upload is sent on its own.
2. **Given** an upload in flight, **When** the participant taps [Try again] or [Choose photo] repeatedly, **Then** at most one upload request is in flight at a time, the control shows a busy state, and double taps do not queue extra uploads.
3. **Given** an upload in flight, **When** the participant attempts to choose another file or remove the photo, **Then** the controls stay disabled until it settles, so at most one upload request is ever in flight and a response can never arrive after a change (a change is only possible when nothing is pending).
4. **Given** a ready uploaded photo, **When** the event becomes closed (reload or refresh confirms it), **Then** the photo step becomes disabled with the closed event state; the already-uploaded server copy is left as-is.

### Edge Cases

- A file of exactly 10 MB is accepted locally; one byte over is rejected locally with the size message before any request.
- A file with an allowed extension but non-image contents passes the local check and is rejected by the server as an unsupported type; the server message is shown.
- An HEIC file is rejected locally when the device exposes its type, otherwise rejected by the server as an unsupported type; either way the participant sees the JPEG/PNG/WebP message.
- A successful response whose body cannot be read is treated as an unexpected response; the photo is not shown as ready and retry is offered.
- Choosing or removing during an upload is impossible (controls are locked while pending), so a response can never arrive after a change. Overlapping requests are prevented by construction: the shared client replaces caller abort signals with its timeout signal, so a superseded upload could not be cancelled and would leave an orphan server photo.
- Device picker cancellation (no file chosen) sends nothing and leaves C2 unchanged.
- C2 opened for an event the device has no access to shows the "not joined on this device" guidance instead of the photo step; no upload is attempted.
- The participant leaves C2 while an upload is in flight: the result does not update an unmounted step and no error is shown on an unrelated screen; a ready photo is kept only while C2 state lives (reopening C2 starts empty — server-side unattached retention is unchanged and out of scope).
- File names, when shown, come from the device picker and are never used as the stored identity; the stored identity is always the server-returned photo identity.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: C2 (`my-items/new`) MUST replace the current "coming soon" placeholder with the photo upload step described here; the clothing description field and the clothing registration request belong to a later clothing feature and MUST NOT be delivered here.
- **FR-002**: The photo step MUST offer one image file per upload through the device picker (camera/album choice left to the device), show the accepted formats and 10 MB limit as help text, and show a local preview immediately after selection.
- **FR-003**: App MUST check locally before sending: no file → no request with a choose-file prompt; empty file → no request with an empty-file message; larger than 10 MB → no request with a size message naming 10 MB; type/extension outside JPEG, PNG, WebP (including HEIC when detectable) → no request with a type message listing the allowed types.
- **FR-004**: App MUST upload the chosen file through the upload-photo capability (`specs/009-upload-photo`) using only the access held on this device for that event, as `multipart/form-data` with a single `file` part, and MUST allow at most one upload request in flight at a time with a busy state.
- **FR-005**: On success, App MUST validate the returned photo result and hold its identity for the later registration step, show the uploaded image from its display location as "Photo ready" with [Change photo] and [Remove], and MUST NOT assume success on failure or on an unexpected response.
- **FR-006**: Choosing a new file MUST discard the previously held photo identity from C2 state and upload the new file as a new photo; [Remove] MUST clear the preview and held identity without sending a delete request.
- **FR-007**: App MUST map upload failures by error code (never by message text), preferring the server-provided message: too-large → size message; unsupported type → allowed-types message; validation/malformed → photo-step message; closed → closed event state with the step disabled; unauthenticated → "not joined on this device" guidance; not found → "event could not be found" with [Go to start]; connection failure, timeout, internal error, or unexpected response → retryable photo-step error with [Try again].
- **FR-008**: Overlapping upload requests MUST be impossible by construction: while an upload is pending, choosing another file, retrying, and removing MUST be disabled, so a stale result for a previous file can never arrive after a change.
- **FR-009**: App MUST show the closed event state from the shared event data (same "Active"/"Closed" label and "This event has ended." banner as P2/M1) and disable the photo step when the event is closed; a server-confirmed closed state takes precedence over an upload failure.
- **FR-010**: C2 photo step MUST be usable on phones (360–430px widths, no horizontal scrolling, touch targets at least 44×44px), label every control, announce uploading/ready/error transitions to assistive technology, and move focus to the error when an upload fails.
- **FR-011**: All user-facing text MUST be in English.
- **FR-012**: App MUST NOT write the participant credential, authorization headers, image bytes, or response bodies to the logs it writes (the app logger and browser console). Request logging by the local development server is outside the app and out of scope.

### Key Entities

- **Photo upload state**: Transient C2 state — empty, previewing, uploading, ready (holding the server photo identity and display location), or failed with a message; at most one upload in flight.
- **Uploaded photo (as seen by the app)**: The server-returned photo result reused from `specs/009-upload-photo` — identity held for later clothing registration plus the display location used for the ready image.
- **Device-held event access**: The private participant credential for the event kept on this device (from earlier frontend features); uploads use only this access.
- **Event state (as seen by the app)**: The shared active/closed event result reused from earlier frontend features; closed disables the photo step.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A participant can go from C2 to a ready uploaded photo in under 60 seconds of user time on a phone, excluding the time spent in the device camera/album picker.
- **SC-002**: In 100% of tested uploads, the ready image shown on C2 is the image at the server-returned display location, displayed upright.
- **SC-003**: 0 upload requests are sent for locally detectable problems (no file, empty file, over 10 MB, disallowed type), and at most 1 upload request is in flight at a time.
- **SC-004**: In 100% of failure scenarios, the participant sees a message with a next action (retry, choose another photo, join guidance, or closed state) and a photo is never shown as ready unless the server confirmed it.
- **SC-005**: The photo step is fully usable without horizontal scrolling at 360px and 430px widths in manual verification.
- **SC-006**: The participant credential and image bytes appear in 0 app-written log entries (app logger and browser console) during testing.

## Assumptions

- The upload-photo capability from `specs/009-upload-photo` is available and is the source of results and error categories; `docs/rules/dev/common/api-contract.md` remains the single source of truth for the shared contract, and `docs/plans/api/05-upload-photo.md` defines the multipart shape, 10 MB limit, allowed types, and error codes.
- The event model, result validation, device-held access storage, API client, error mapping, event-state labels, closed banner, "not joined on this device" guidance, and C1/C2 entry points from earlier frontend features are reused; this feature replaces only the C2 photo portion of the `my-items/new` "coming soon" placeholder.
- The clothing description field, clothing registration request, photo-attach rules, and C3/C4 navigation belong to a later register-clothing frontend feature (per `docs/plans/api/06-register-read-clothing.md`) and are out of scope; the held photo identity is the handoff to that feature.
- Unattached photos are kept indefinitely with no cleanup in this version, HEIC is rejected as an unsupported type, and display locations are public unguessable URLs (decided in `specs/009-upload-photo`); the app does not enforce retention, conversion, or signing.
- In-app camera capture is out of scope; the app relies on the device file picker (`camera`/`album` choice left to the device), and file-name availability depends on the device.
- Visual design follows the project's existing design system and the C2 mockup in `docs/flows/mockup-flow-v1.html`; exact visuals are decided during planning.
- Screens are verified manually at 360–430px widths; automated tests target non-trivial logic (local file checks, locked-controls single in-flight, error-code-to-screen-state mapping, ready-state handling), per the project constitution.
