# Research: 017 My Items Edit/Delete

**Feature**: specs/017-my-items-edit-delete/spec.md · **Plan**: specs/017-my-items-edit-delete/plan.md

Explorer read-only report 2026-11-03 folded in below. All unknowns resolved from code, API 07, and contract.

## 1. Backend validation reuse for PATCH

- **Decision**: Add `ClothingUpdate` in `backend/app/schemas/clothing.py` with all-optional `photo_ids`, `category`, `title`, `description`, `measurements`; reuse `ClothingCreate` validators (duplicate photoIds, control chars, measurement group/range). Resulting category+measurements check uses sent value else current value; `other` rejects any measurement.
- **Rationale**: Registration rules (schemas/clothing.py:42-127) already encode group (`_TOP_MEASUREMENTS`, `_BOTTOM_MEASUREMENTS`) and range (0,120]; duplicating them would drift.
- **Alternatives**: Separate PATCH validators — rejected; two sources for same rule.

## 2. Photo reorder with (clothing_id, position) unique

- **Decision**: In one `Db.write()` transaction: detach dropped photos (`clothing_id=NULL, position=NULL`), set kept/added photos `position=NULL` first (SQLite allows multiple NULLs), then assign `position=0..n-1` in request order. Reuse `photo_repo.attach` only for truly unattached adds; direct UPDATE for reorder/detach.
- **Rationale**: `models/photo.py:13` UniqueConstraint(clothing_id, position) is checked per-row in SQLite, so [0,1]->[1,0] collides without NULL staging. `repositories/photo.py:16-22` attach guards `clothing_id IS NULL`, so reorder cannot go through it.
- **Alternatives**: Delete+reinsert photos — rejected; destroys ids/URLs.

## 3. Service/transaction shape

- **Decision**: `ClothingService.edit` / `withdraw` in `services/clothing.py`, following `register:44-112` pattern: schema validation first (422 via Pydantic), then with `self.db.write()` (db.py:36-56 BEGIN IMMEDIATE), check order ownership (same-event 403, cross-event 404) -> replay -> event active -> confirmed/withdrawn -> mutate -> `_build_response:153-210` reuse. Log `clothing_updated` / `clothing_withdrawn` with ids/counts only.
- **Rationale**: Matches existing layering (service owns transaction, repos are thin).
- **Skip**: 07 PATCH step 5 (analysis stale/pending) and steps 6-7 + DELETE steps 6-7 (intent/proposal invalidation) — log counts as 0, keep confirmed guards.

## 4. Errors and 403/404 policy

- **Decision**: Owner check first: missing/other-event garment -> `NotFoundError` (404); existing garment owned by other participant -> `ForbiddenError` (403) for PATCH/DELETE. Photo ids: unknown/other-event/other-uploader -> `NotFoundError`; attached to another garment -> `PhotoAlreadyAttachedError` (409). Add `ClothingAlreadyConfirmedError` (409 CLOTHING_ALREADY_CONFIRMED) and `ClothingNotAvailableError` (409 CLOTHING_NOT_AVAILABLE). `api/errors.py` maps to contract shape.
- **Rationale**: Contract hides photo existence (404) but exposes garment ownership (403); API 07 specifies same.

## 5. Frontend queue initial state

- **Decision**: Loosen `PhotoItem.file: File` to `file?: File` in `lib/photo/queue.ts:7-15`, add `initialReadyPhotos(serverPhotos: {id,url}[])` factory returning ready items. `PhotoUploadScreen` accepts `initialPhotos` for edit mode; `ClothingDetailsForm` reused unchanged (button label injected).
- **Rationale**: Smallest change to let edit prefill without re-upload.
- **Alternatives**: Separate edit carousel — rejected; duplicates ~200 lines.

## 6. Frontend API and cache

- **Decision**: Extend `listClothing(eventId, ownership)` (currently hardcoded others) + `getClothing` reuse; add `updateClothing(eventId, id, body)` (PATCH) and `deleteClothing(eventId, id)` (DELETE). Query keys `clothingList(eventId, ownership)` separated to avoid Home/MyItems cache collision. `buildUpdateClothingBody` + reuse `mapClothingServerFieldErrors` in `clothing-form.ts`.
- **Rationale**: Explorer risk #2 confirmed; ownership must be in key.

## 7. Routes and redirect

- **Decision**: C1 `my-items/page.tsx` replaces placeholder; C4 `my-items/[itemId]/page.tsx`; C2 edit `my-items/[itemId]/edit/page.tsx` reusing two-step form. `routes.myItems(eventId)`, `myItemDetail`, `myItemEdit` builders. Registration success navigates to `myItems?registered=1`; Home drops `RegistrationStatus`.
- **Rationale**: Follows routing-only rule and screen flow C1/C2/C4.

## 8. Astryx

- **Decision**: Scaffold C1 rows from list template (rows, not cards — dense data rule), C4 from detail template, keep frames. `astryx build` then `template`, `doctor --built` before delivery. No raw divs.
