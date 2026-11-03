# Feature Specification: 017 My Items List, Detail, Edit, Delete

**Feature Branch**: `feature/017-my-items-edit-delete`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "017 My items: list, detail, edit, delete (backend + frontend). Backend: implement PATCH /api/v1/clothing/{clothing_id} and DELETE /api/v1/clothing/{clothing_id} per docs/plans/api/07-edit-withdraw-clothing.md (whole-list photoIds replacement with detach, category/title/description/measurements with the registration validation, measurements validated against the resulting category, replay when unchanged, contentVersion increment, soft-delete withdraw, logs). Skip the analysis step (feature 018) and intent/proposal invalidation steps (feature 020); keep the confirmed checks. Frontend: My items tab (C1) lists the caller's garments (ownership=mine) with status; C4 detail with Edit and Delete (confirmation), confirmed items locked; edit reuses the 014 two-step form with existing photos as ready and sends PATCH; registration success now returns to C1 with "Clothing registered.". Sources: docs/plans/features/017-my-items-edit-delete.md, docs/plans/api/07-edit-withdraw-clothing.md, docs/plans/api/06-register-read-clothing.md, docs/rules/dev/common/api-contract.md, docs/flows/screen-flow-v1.md (4.3), docs/flows/mockup-flow-v2.html (screen 6), specs/011-014."

## Clarifications

### Session 2026-11-03

- Q: Show the owner's withdrawn garments in C1, or hide them behind a filter? → A: Show all own garments including withdrawn in C1 with status badge (available/confirmed/withdrawn), newest first; no filter in this feature. Rationale: API 06 already returns own withdrawn with ownership=mine and screen flow C1 lists status badge including withdrawn; a filter is extra UI nobody asked for.
- Q: After a successful edit, return to C4 — confirm, and whether to show a "Saved." status? → A: Return to C4 with a short "Saved." status, mirroring the registration "Clothing registered." pattern. Rationale: smallest consistent change, reuses existing status mechanism.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See my garments on the My items tab (Priority: P1)

A participant opens the My items tab and sees every garment they registered in this event, newest first. Each row shows the main photo, title, and status badge. Tapping a row opens that garment's detail. An empty list invites them to register an item.

**Why this priority**: C1 is the owner's workspace; without it owners cannot find their garments to edit or delete.

**Independent Test**: Can be fully tested by registering several garments (including one withdrawn via API) and opening My items; it delivers rows with correct photos, titles, badges, and navigation.

**Acceptance Scenarios**:

1. **Given** the caller owns available and withdrawn garments, **When** they open My items, **Then** all own garments appear newest first, each with main photo, title, and status badge.
2. **Given** the My items list is shown, **When** the user taps a row, **Then** the app opens the My item detail for that garment.
3. **Given** the caller owns no garments, **When** they open My items, **Then** an empty state with [Register item] is shown.
4. **Given** the list is loading, **When** it renders, **Then** a loading state is shown; **Given** loading fails, **When** it fails, **Then** an error state with retry is shown.
5. **Given** another participant's garment exists, **When** the caller opens My items, **Then** it never appears in this list.

---

### User Story 2 - Inspect and delete my garment (Priority: P1)

A participant opens their garment's detail and sees the same photos and fields as the shared detail plus [Edit] and [Delete]. Deleting asks for confirmation, then returns to the list. Confirmed garments show a locked state with guidance instead of edit/delete actions.

**Why this priority**: Owners must be able to withdraw garments that are no longer offered; locking confirmed garments protects exchange integrity.

**Independent Test**: Can be fully tested by opening own detail, deleting with confirmation, and reopening confirmed/withdrawn garments; it delivers correct detail, confirmed lock, and idempotent withdraw.

**Acceptance Scenarios**:

1. **Given** an own available garment, **When** its detail opens, **Then** photos in order, category, title, description, entered measurements, status, plus enabled [Edit] and [Delete] are shown.
2. **Given** the detail with [Delete], **When** the user confirms deletion, **Then** the garment becomes withdrawn and the app returns to My items.
3. **Given** a garment already withdrawn, **When** delete is called again, **Then** it succeeds with no change (idempotent replay).
4. **Given** a confirmed garment, **When** its detail opens, **Then** edit/delete are disabled or hidden with a note pointing to cancellation.
5. **Given** a garment of another participant, **When** edit or delete is attempted via API, **Then** `403 FORBIDDEN` is returned.

---

### User Story 3 - Edit my garment fields (Priority: P1)

A participant taps [Edit] and sees a single-step form prefilled with current title, description, category, and measurements plus the current photos shown view-only in order. Saving sends a PATCH (fields edited; photoIds sent unchanged as the whole current list) and returns to the detail with "Saved." Unchanged submissions replay without bumping the version. Photo reorder/replace UI is deferred (backend whole-list `photoIds` replacement is implemented and API-tested; `initialReadyPhotos`/`initialPhotos` infrastructure is in place for the follow-up).

**Why this priority**: Correcting titles, descriptions, categories, and measurements is the core owner workflow; replay keeps double-taps safe.

**Independent Test**: Can be fully tested by editing each field, submitting unchanged content, and sending invalid category/measurement combos; it delivers correct PATCH behavior and validation. Photo reorder is API-tested (`test_edit_reorders_photos_and_detaches_dropped`) but has no edit-UI test in this slice.

**Acceptance Scenarios**:

1. **Given** the edit form opens, **When** it renders, **Then** current photos appear view-only in order ("Photos (view only in this version)") with title, description, category, and measurements prefilled.
2. **Given** edited fields, **When** the user saves, **Then** `PATCH` sends photoIds as the whole current list and measurements as a whole object, `contentVersion` increments by 1, and the app returns to C4 with "Saved.".
3. **Given** submitted values equal current values, **When** PATCH is sent, **Then** `200` returns the unchanged garment without incrementing `contentVersion`.
4. **Given** a category change without fitting measurements, **When** PATCH is sent, **Then** `422 VALIDATION_ERROR` is returned and nothing is changed.
5. **Given** the event is closed, **When** PATCH is sent with changed content, **Then** `409 EVENT_CLOSED` is returned; unchanged replay still returns `200`.

---

### User Story 4 - Land on My items after registration (Priority: P2)

A participant who just registered clothing lands on My items with "Clothing registered." instead of Home.

**Why this priority**: Keeps the owner in their workspace; Home stays for browsing others.

**Independent Test**: Can be fully tested by registering a garment; it delivers navigation to C1 with the confirmation.

**Acceptance Scenarios**:

1. **Given** registration succeeds, **When** the form completes, **Then** the app navigates to My items and shows "Clothing registered.".
2. **Given** Home is opened after registration, **When** it renders, **Then** the old registration confirmation is no longer shown there.

---

### Edge Cases

- What happens when photoIds contains a photo attached to another garment? `409 PHOTO_ALREADY_ATTACHED`, nothing changes.
- What happens when photoIds contains an unknown id, another event's photo, or another participant's photo? `404 NOT_FOUND` (existence hidden per contract).
- What happens when PATCH body is empty or has unknown fields? `422 VALIDATION_ERROR`.
- What happens when DELETE targets a missing garment or another event's garment? `404 NOT_FOUND`.
- What happens when DELETE is called after event closure on an already-withdrawn garment? `204` replay succeeds even after closure.
- What happens when DELETE is called after closure on an available garment? `409 EVENT_CLOSED`.
- What happens when a confirmed garment is edited? `409 CLOTHING_ALREADY_CONFIRMED` with message "Cancel the confirmed exchange before editing this garment."; when withdrawn via DELETE? Same code with message "Cancel the confirmed exchange before withdrawing this garment."
- What happens when PATCH targets a garment in another event or uses a token from another event? `404 NOT_FOUND`.
- What happens when photos are dropped from photoIds? They are detached (`clothing_id = null`) and remain stored; no file deletion.
- What happens when measurements is `null` or `{}`? All measurements are cleared.
- What happens when the viewer loses access while C1/C4 is open? Existing unauthenticated handling is shown.
- What happens when the event is closed? Reads used by this feature stay available in tests; post-closure retention duration remains open per api/README. Edit/delete/registration actions are disabled per closed-event rule.

## Requirements *(mandatory)*

### Functional Requirements

**Backend PATCH**

- **FR-001**: `PATCH /api/v1/clothing/{clothing_id}` MUST validate body first (422), then require owner bearer token; same-event non-owners get `403`, missing/invalid tokens get `401`, garment in another event or token from another event gets `404`.
- **FR-002**: `photoIds` MUST replace the whole photo list (1–10 unique ids, order kept, first is main); each id MUST be already attached to this garment or uploaded by the owner in this event and unattached; otherwise `404` or `409 PHOTO_ALREADY_ATTACHED`.
- **FR-003**: `category`, `title`, `description` MUST follow registration rules; `measurements` MUST replace the whole object (`null`/`{}` clears); the resulting category+measurements MUST fit the category group, else `422`.
- **FR-004**: Identical-value PATCH MUST replay with `200` and no `contentVersion` increment and no side effects, even after event closure.
- **FR-005**: Changed PATCH MUST verify event active and garment not `confirmed`/`withdrawn` (`409 EVENT_CLOSED`, `409 CLOTHING_ALREADY_CONFIRMED`, `409 CLOTHING_NOT_AVAILABLE`), then update content and increment `contentVersion` in one transaction, attaching/detaching photos with positions rewritten in the new order.
- **FR-006**: Changed PATCH MUST log `INFO clothing_updated` with `clothing_id`, `content_version`, `changed_fields`, `photo_count`, `invalidated_proposal_count` (0 in this feature); never log title/description text.
- **FR-007**: PATCH MUST skip analysis-stale/restart (018) and intent/proposal invalidation (020) in this feature, but MUST keep the confirmed/withdrawn/closed guards.

**Backend DELETE**

- **FR-008**: `DELETE /api/v1/clothing/{clothing_id}` MUST require owner bearer token (same-event non-owner `403`; other-event garment or token `404`; missing/invalid `401`).
- **FR-009**: Already-withdrawn DELETE MUST replay `204` with no changes, even after closure.
- **FR-010**: Available-garment DELETE MUST verify event active (`409 EVENT_CLOSED` after replay check) and reject confirmed (`409 CLOTHING_ALREADY_CONFIRMED`), then set `status = withdrawn` in one transaction.
- **FR-011**: DELETE MUST log `INFO clothing_withdrawn` with `clothing_id`, `invalidated_intent_count` (0), `invalidated_proposal_count` (0).
- **FR-012**: DELETE MUST skip intent/proposal invalidation (020) in this feature.

**Frontend C1/C4/edit/redirect**

- **FR-013**: C1 MUST list caller garments via `GET .../clothing?ownership=mine`, newest first, rows with main photo, title, status badge; withdrawn included with badge; no filter in this feature.
- **FR-014**: C1 row MUST navigate to C4; empty C1 MUST show [Register item]; loading/error states MUST mirror Home patterns with retry.
- **FR-015**: C4 MUST show full detail (photos carousel, category, title, description, entered measurements, status) plus [Edit] and [Delete]; [Delete] MUST ask confirmation; success MUST return to C1.
- **FR-016**: Confirmed garments in C4 MUST lock edit/delete with guidance toward cancellation (T3 in 021).
- **FR-017**: Edit MUST show a single-step form prefilled with title, description, category, measurements and current photos view-only in order ("Photos (view only in this version)"); it MUST reuse validation + details-form patterns (two-step photo editing deferred); [Save] MUST send `PATCH` with whole photoIds (current list) + whole measurements; success MUST return to C4 with "Saved.".
- **FR-018**: Registration success MUST navigate to C1 with "Clothing registered."; Home MUST no longer show that confirmation.
- **FR-019**: C4 MUST include a "Requests" section placeholder for 020 (empty or hidden, no behavior).
- **FR-020**: All new UI text MUST be in English; reads used by this feature stay available in tests after closure (retention duration still open); edit/delete/registration actions are disabled after closure.

### Key Entities

- **Own garment row**: Caller's garment on C1 with main photo, title, status badge, link to C4.
- **My item detail**: Full garment plus owner actions (edit/delete) and lock state for confirmed.
- **Content version**: Integer bumped only on changed PATCH; used by 018 analysis and 020 invalidation later.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Owners see all own garments (including withdrawn) on C1 newest first with correct badges and can open each detail in one tap.
- **SC-002**: Owners can edit title, description, category, and measurements; valid edits bump `contentVersion` by 1, invalid category/measurement combos fail with `422` and change nothing. Photo replacement is API-complete (reorder/detach tested) with edit-UI deferred.
- **SC-003**: Unchanged PATCH replays without version bump; repeated DELETE returns `204`; non-owners get `403` on edit/delete.
- **SC-004**: Registration lands on C1 with confirmation; edit lands on C4 with "Saved."; confirmed garments lock edit/delete.
- **SC-005**: Backend and frontend checks pass; no deviation from API 07 without a docs update in the same PR.

## Assumptions

- Event auth uses per-event bearer `participantToken`; 403/404 policy follows the API contract (404 only to hide private resources).
- Photo files stay stored after detach; retention undecided.
- AI analysis restart (018) and intent/proposal invalidation (020) are out of scope; invalidation counts log as 0. 017 assumes no 020 proposals exist yet; 020 must re-enable API 07 steps 6-7. This deferral amends API 07 in the same PR.
- Interface language is English; layouts verified at 360–430 px with screenshots.
- Bottom tabs and Home grid from 015/016 exist; this feature replaces the 015 My items placeholder.
