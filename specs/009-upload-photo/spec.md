# Feature Specification: Upload Photo (Backend)

**Feature Branch**: `feature/backend-upload-photo`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: `"docs/plans/api/05-upload-photo.md"`

## Clarifications

### Session 2026-10-30

- Q: Who should be able to view an uploaded photo at its display location — anyone holding the link, or only authenticated members of the same event? → A: Anyone with the link can view (public unguessable URL, no credential check)
- Q: How long should a photo that was uploaded but never attached to any garment be kept? → A: Keep indefinitely (no cleanup in this version)
- Q: Should an HEIC image file be accepted as an upload, or rejected as an unsupported type? → A: Reject HEIC with unsupported-type error (JPEG, PNG, WebP only)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Participant uploads a clothing photo while describing the garment (Priority: P1)

A participant in an active event provides one clothing photo so it can be shown with the garment and used when registering clothing. Uploading happens separately from clothing registration, so the photo can finish uploading while the participant types the description. Each successful upload returns a photo identity and a display location that the participant later attaches when registering or editing clothing.

**Why this priority**: Every garment with a photo depends on this step; without it clothing registration cannot attach a photo.

**Independent Test**: As a joined participant of an active event, upload a valid JPEG, PNG, and WebP file at or below the size limit, then attach the returned photo identity when registering clothing and view the stored image at its display location.

**Acceptance Scenarios**:

1. **Given** an active event and a participant credential for that event, **When** the participant provides one image file in an allowed format within the size limit, **Then** a new photo is stored and the result contains its identity, display location, stored format, stored size, and upload time.
2. **Given** a successful upload, **When** the participant registers clothing with the returned photo identity, **Then** the garment is linked to that photo.
3. **Given** a photo taken on a phone with rotation and location metadata, **When** it is uploaded, **Then** the stored image displays upright and contains no location or other capture metadata.
4. **Given** the same image bytes uploaded twice, **When** both uploads succeed, **Then** two distinct photos exist with different identities.

---

### User Story 2 - Invalid or unavailable uploads are rejected safely (Priority: P1)

Participants receive clear reasons when a photo cannot be stored, and no partial or oversized photo is kept. Events are protected from uploads by outsiders and into closed events.

**Why this priority**: Accepting oversized, disguised, or unauthorized files would waste storage, break the event boundary, and violate closure rules.

**Independent Test**: Attempt uploads with a missing or empty file, a disallowed format, a file over the limit, a disguised file, a missing or foreign credential, a nonexistent event, and a closed event; verify the error and that no photo is stored.

**Acceptance Scenarios**:

1. **Given** a request with a malformed body, **When** it is processed, **Then** a malformed-request error is returned and no photo is stored.
2. **Given** a request with no file part or an empty file, **When** it is processed, **Then** a validation error is returned and no photo is stored.
3. **Given** a file larger than the limit, **When** it is uploaded, **Then** a file-too-large error identifying the maximum size is returned and no photo is stored, even when the declared size understates the actual size.
4. **Given** a file whose actual content is not JPEG, PNG, or WebP, **When** it is uploaded with an allowed declared type or extension, **Then** an unsupported-type error listing the allowed types is returned and no photo is stored.
5. **Given** a missing or invalid participant credential, **When** an upload is attempted, **Then** an unauthenticated error is returned and no photo is stored.
6. **Given** a nonexistent event, or a credential belonging to a different event than the target, **When** an upload is attempted, **Then** a not-found error is returned and no photo is stored.
7. **Given** a closed event, **When** a member attempts an upload, **Then** an event-closed error is returned and no photo is stored.

---

### User Story 3 - Uploaded photos stay private and traceable (Priority: P2)

Stored photos cannot be guessed or browsed by outsiders, and uploads leave a traceable record without exposing image contents or secrets.

**Why this priority**: Clothing photos are personal; guessable locations or logged bytes would expose participants.

**Independent Test**: Upload a photo, then inspect its display location, stored record, and logs; attempt access without belonging to the event.

**Acceptance Scenarios**:

1. **Given** a successful upload, **When** its display location is inspected, **Then** it is unguessable and usable for display and later interpretation of the garment, and anyone holding the link can view the image bytes without a participant credential.
2. **Given** a successful upload, **When** logs are inspected, **Then** exactly one photo-uploaded record identifies the photo, its size, and its format, and no image bytes appear in any log.
3. **Given** any upload or rejection, **When** it is processed, **Then** the participant credential never appears in stored data or logs beyond the existing credential handling.

### Edge Cases

- A file of exactly the maximum size is accepted; one byte over is rejected.
- An upload that exceeds the limit partway through is stopped without keeping a partial photo.
- A file renamed to an allowed extension but with non-image contents is rejected.
- An HEIC file is rejected with an unsupported-type error, even when captured natively on a phone.
- A photo uploaded but never attached to clothing is kept indefinitely with no cleanup in this version; it uses storage but breaks nothing.
- An upload attempted with an event identifier that is malformed returns not-found.
- An event closed between starting the upload and completing it rejects the upload as event-closed.
- If storing the photo fails partway, no photo record without retrievable image content remains, and no success record is logged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a participant of an event store one clothing photo per request without attaching it to clothing yet. Verified by User Story 1, scenario 1.
- **FR-002**: A successful upload MUST return the photo identity, display location, stored format, stored size, and upload time. Verified by User Story 1, scenario 1.
- **FR-003**: The accepted formats MUST be JPEG, PNG, and WebP only — including rejecting HEIC — judged by inspecting the actual file contents, not only the declared type or extension. Verified by User Story 2, scenario 4.
- **FR-004**: The maximum photo size MUST be 10 MB; files above it MUST be rejected with a file-too-large error stating the maximum, without storing a partial file. Verified by User Story 2, scenario 3 and the size edge cases.
- **FR-005**: A missing or empty file MUST produce a validation error; a malformed request body MUST produce a malformed-request error. Verified by User Story 2, scenarios 1 and 2.
- **FR-006**: Stored images MUST have capture metadata including location removed and MUST display upright. Verified by User Story 1, scenario 3.
- **FR-007**: Each stored photo MUST be recorded with its uploader, event, and storage location under an unguessable identity, and MUST be viewable by anyone holding the display location without a participant credential. Verified by User Stories 1 and 3, scenario 1.
- **FR-008**: Uploads MUST require a valid participant credential for the target event; a missing or invalid credential MUST produce an unauthenticated error. Verified by User Story 2, scenario 5.
- **FR-009**: A nonexistent event or a credential belonging to a different event MUST produce a not-found error indistinguishable from a missing resource. Verified by User Story 2, scenario 6.
- **FR-010**: Uploading to a closed event MUST produce an event-closed error. Verified by User Story 2, scenario 7.
- **FR-011**: Uploads MUST NOT be idempotent: each successful request MUST create a distinct photo. Verified by User Story 1, scenario 4.
- **FR-012**: A successful upload MUST record one photo-uploaded log entry identifying the photo, size, and format; image bytes MUST never be logged. Verified by User Story 3, scenarios 2 and 3.

### Key Entities

- **Event**: An exchange session with an active/closed state; only active events accept uploads.
- **Participant**: A member of one event whose credential authorizes that member's uploads in that event only.
- **Photo**: A stored clothing image with an unguessable identity, display location, format, size, uploader, event, and upload time; later linked from clothing.
- **Clothing** (related, not created here): A garment that references at most one photo uploaded through this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of valid uploads, the participant receives a photo identity and display location, and the image is viewable at that location upright with no location metadata.
- **SC-002**: In 100% of valid uploads, the returned photo identity can immediately be attached when registering clothing.
- **SC-003**: In 100% of invalid upload attempts (missing/empty file, oversized, disallowed or disguised content), the correct error is returned and zero photo records or partial files remain.
- **SC-004**: Uploads with a foreign credential and uploads for nonexistent events return identical not-found responses in 100% of tested cases, and uploads to closed events return event-closed in 100% of tested cases.
- **SC-005**: Zero image bytes, zero raw participant credentials, and zero guessable photo locations appear in stored data or logs.
- **SC-006**: A participant can complete photo handling with two steps: upload the photo, then attach its identity during clothing registration.

## Assumptions

- Sources are [Upload Photo](../../docs/plans/api/05-upload-photo.md), the [API README](../../docs/plans/api/README.md), the [shared API contract](../../docs/rules/dev/common/api-contract.md), the [database design](../../docs/plans/database-design-v1.md), and the [initial development plan](../../docs/plans/vintage-relay-plan-v1.md). Request/response formats and error codes are defined there.
- Existing event creation, join, read, and close features supply events, participant credentials, authentication scoping, and closure behavior. They are reused rather than redefined.
- The size limit marked proposed in the source is adopted as decided for this version: 10 MB. The `details` shapes for oversized and disallowed files follow the source.
- Capture-metadata removal and orientation normalization marked proposed in the source are adopted as required for privacy (FR-006).
- Storage location and signed-versus-public URL policy is decided for this version as public unguessable display locations (see Clarifications); the deployment bucket and CDN details remain planning-level choices. Never-attached photos are kept indefinitely with no cleanup in this version. HEIC is rejected as an unsupported type; mobile browsers are expected to convert to JPEG on upload. Event-record retention after closure and multiple photos per garment remain open decisions and are outside this feature; one photo per request is sufficient for the prototype.
- **Backend scope**: This feature delivers the single upload operation and its stored record. The clothing registration screens and photo capture UI are outside this feature.
