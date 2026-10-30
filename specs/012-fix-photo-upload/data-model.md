# Data Model: Fix Photo Upload and Support Multiple Photos (C2)

## Backend

### `photos` (changed)

| Column | Type | Rule |
|--------|------|------|
| `clothing_id` | String(36), nullable, FK `clothes.id` | New. `NULL` = unattached. Set once at registration and never moved. |
| `position` | Integer, nullable | New. 0–9; order within the garment; `0` = main photo. `NULL` exactly when `clothing_id` is `NULL`. The range is guaranteed by the application (`photoIds` max 10), with no DB check constraint. |

- New unique constraint: `(clothing_id, position)`.
- Existing columns (`id`, `event_id`, `uploader_id`, `storage_location`, `content_type`, `size_bytes`, `created_at`) are unchanged.

### `clothes` (changed from 011)

- `photo_id` is **removed**. Its uniqueness rule is replaced by "one `clothing_id` per photo row".

### Migration

A new revision, `down_revision` = 011's `create_clothes_table`:
1. Add `photos.clothing_id` and `photos.position`, plus the unique constraint.
2. Backfill: `UPDATE photos SET clothing_id = clothes.id, position = 0` for each `clothes.photo_id`.
3. Drop `clothes.photo_id` (`batch_alter_table`).

`downgrade` reverses these steps, restoring `photo_id` from the `position = 0` rows.

### Registration invariants (one write transaction)

1. `photoIds` has 1–10 entries with no duplicates (else `422`).
2. The event exists and is active (`404` / `409 EVENT_CLOSED`).
3. Every photo exists, has `event_id == event.id` and `uploader_id == caller` (else one identical `404`).
4. Every photo has `clothing_id IS NULL`. Each conditional `UPDATE … WHERE clothing_id IS NULL` must affect 1 row, else `409 PHOTO_ALREADY_ATTACHED` and a rollback (all or none).
5. `position` is the index in `photoIds`.

## Frontend (C2 state, not persisted)

```ts
type PhotoItem = {
  key: string;            // local id (crypto.randomUUID), never sent
  file: File;             // original, or the compressed result once prepared
  previewUrl: string;     // object URL, revoked on remove/unmount
  status: 'waiting' | 'preparing' | 'uploading' | 'ready' | 'failed';
  photo?: Photo;          // set when ready (server id + url)
  error?: string;         // set when failed
  displayFailed?: boolean // ready image failed to load (FR-002)
};
type C2State = { step: 1 | 2; items: PhotoItem[] };   // items.length <= 10
```

State transitions per item:
- `waiting → preparing` (only if the file is over 10 MB) `→ uploading → ready | failed`.
- `failed → waiting` on [Try again]; the item rejoins the end of the queue.
- Remove is allowed in any status except `preparing` and `uploading`.

Derived values:
- `activeItem`: the single item that is `preparing` or `uploading`, if any.
- `canProceed`: `items.length >= 1 && items.every(i => i.status === 'ready')`.
- `freeSlots`: `10 - items.length`.
