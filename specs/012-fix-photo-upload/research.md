# Research: Fix Photo Upload and Support Multiple Photos (C2)

## R1. Why the uploaded photo does not show (US1)

- **Finding**: `PhotoService.upload` returns `url = f"{APP_BASE_URL}/api/v1/photos/{id}"`. `APP_BASE_URL` is the frontend origin (`http://localhost:3000`, per `docs/rules/dev/common/tech-stack.md`), but `GET /api/v1/photos/{id}` is served only by the backend (`:8000`). Next has no route or rewrite for `/api/v1/*`, so `<img src>` gets a 404 and only the alt text renders.
- **Decision**: Add one Next rewrite in `frontend/next.config.ts`: `/api/v1/photos/:photoId` → `${NEXT_PUBLIC_API_BASE_URL}/api/v1/photos/:photoId`. The backend URL format and the 009/011 contracts stay unchanged.
- **Rationale**: One config entry with no backend, schema, or test changes. The public URL stays on the app origin, as 009 decided ("public unguessable URLs" under the app origin). The rewrite works the same in local development and in deployment.
- **Alternatives rejected**:
  - A new backend `PUBLIC_API_BASE_URL` setting used for photo URLs: touches settings, service, and tests in 009 and 011, and leaks the API origin into stored or returned URLs.
  - Proxying all of `/api/v1/*`: broader than needed, because `apiFetch` already calls the backend origin directly.
- **Fallback UI (FR-002)**: `<img onError>` sets a per-photo `displayFailed` flag that shows "This photo could not be displayed." The held identity is kept.

## R2. Compressing photos over 10 MB on the device (US2)

- **Decision**: Use browser built-ins only, with no new dependency:
  - Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })`. This applies EXIF rotation, so the result stays upright.
  - Draw to a canvas and encode with `canvas.toBlob('image/jpeg', quality)`.
  - Try qualities `0.9 → 0.8 → 0.7 → 0.6`. If still too large, scale the longest side down by `0.8` per step, with a floor of 1600 px.
  - Return the first blob of `MAX_PHOTO_BYTES` or less, as a `File` named `<base>.jpg` with type `image/jpeg`.
  - If decoding fails or the floor is reached and the blob is still too large, return a failure with "This photo is too large. Choose a smaller photo."
- **Testability**: The quality/scale ladder is a pure function. It takes an injected `encode(scale, quality) => Promise<Blob>`, so Vitest can test the step order, stop condition, and failure without a canvas (jsdom has none). The thin canvas adapter is verified manually.
- **Rationale**: Constitution V (simplicity). Canvas re-encoding also strips EXIF location, which the server does anyway.
- **Alternatives rejected**: `browser-image-compression` (a new dependency for about 30 lines); server-side compression (raises the upload limit and goes against FR-009).

## R3. ".jpg" support (US3)

- **Finding**: `.jpg` is already in `ALLOWED_EXTENSIONS`, but that list is consulted only when `file.type` is empty or `application/octet-stream`. Some Android and desktop pickers report `image/jpg`, which hits the final reject branch. The picker `accept` lists MIME types only.
- **Decision**:
  - Add `'image/jpg'` to the locally accepted types.
  - Set `accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"`.
  - Change the copy to "JPG/JPEG, PNG, or WebP".
- **Backend**: No change. Pillow detects the format from the bytes, and the stored type is normalized to `image/jpeg`.

## R4. Storing 1–10 photos per garment (US4, FR-012–FR-015)

- **Decision**:
  - Move the attachment onto `photos`: add nullable `clothing_id` (FK `clothes.id`) and nullable `position` (int, 0–9), with a unique constraint on `(clothing_id, position)`.
  - Drop `clothes.photo_id`.
  - A photo is attached exactly when `clothing_id IS NOT NULL`.
- **Rationale**: A photo can belong to at most one garment by construction (one column), so no join table is needed. Order is `position`, and the main photo is `position = 0`. 011's `photo_is_attached` becomes a column check.
- **Atomic attach**: Everything runs inside the existing single `Db.write()` (`BEGIN IMMEDIATE`), in this order:
  1. Validate every ID (exists, same event, same uploader).
  2. Insert the garment.
  3. For each photo, run `UPDATE photos SET clothing_id=:c, position=:i WHERE id=:p AND clothing_id IS NULL`.
  4. If any `rowcount != 1`, raise `PhotoAlreadyAttachedError`. The transaction then rolls back, so nothing is attached (all or none).
- **Migration**: A new Alembic revision after 011's `create_clothes_table`. It adds the columns, backfills `clothing_id`/`position=0` from `clothes.photo_id` (development databases may already hold 011 rows), and drops `clothes.photo_id` with `batch_alter_table` (SQLite).
- **Alternatives rejected**:
  - A `clothing_photos` join table: an extra table, plus a uniqueness rule to stop one photo joining two garments.
  - A JSON array column: no foreign key and no uniqueness.

## R5. Request validation for `photoIds`

- **Decision**: `photo_ids: list[str] = Field(min_length=1, max_length=10)` plus a validator that rejects duplicates.
- **Reason mapping**: Add list `too_short` → `required`, list `too_long` → `too_long`, and duplicates → `invalid`, all on field `photoIds`. This is one small extension to the `RequestValidationError` handler, which today maps only `string_too_short`/`string_too_long`.
- **Unchanged checks**: Unknown, foreign, or another participant's photo → identical `404 NOT_FOUND`. Already-attached photo → `409 PHOTO_ALREADY_ATTACHED`.

## R6. Frontend C2 scope (two steps)

- **Decision**: 012 delivers step 1 (up to 10 photos, a sequential queue, and [Next]) and the step-1 ↔ step-2 navigation.
- **Step 2 placeholder**: Step 2 shows the held photos in order, with the existing "next step" placeholder note and [Back]. The description field and the register request belong to the register-clothing frontend feature, as 010 already decided. 011 is backend-only, so no registration UI exists yet.
- **Rationale**: This keeps the 010 handoff boundary. Step 2 has nothing to call until a frontend feature for 011 exists.

## R7. Upload queue on the frontend (FR-017, FR-018)

- **Decision**:
  - Keep state as a pure reducer over `PhotoItem[]` (`waiting | preparing | uploading | ready | failed`).
  - A single effect starts the first `waiting` item only when no item is `preparing` or `uploading`. This guarantees at most 1 upload in flight and keeps the existing `useUploadPhotoMutation` and `apiFetch` unchanged.
  - Remove is allowed for every item except the active one.
  - Retry sets a failed item back to `waiting` at the end of the queue.
  - Add takes files up to `10 − items.length` and reports how many were skipped.
- **Tests**: Vitest covers the reducer (add/cap/skip count, queue order, lock rules, `canProceed`) and the compression ladder. Screens are verified manually at 360–430 px.

## R8. Sequencing with 011

- **Finding**: The 011 backend (clothes table, register, list, get) exists only on branch `speckit-specify-register-read-clothing` and is not merged into `main`.
- **Decision**: Backend US4 work starts after 011 merges into `main` (rebase 012 onto it). US1–US3 (frontend only) can land first. `docs/plans/api/06-register-read-clothing.md` and 011's OpenAPI contract are updated in the same change as the backend US4 work.
