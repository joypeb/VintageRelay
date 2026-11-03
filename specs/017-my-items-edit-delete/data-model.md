# Data Model: 017

No new tables. Reuses `clothes` and `photos` per database-design 3.3/3.4.

- `clothes`: `status` (`available`/`confirmed`/`withdrawn`), `content_version` +1 on changed PATCH, `updated_at` bumped. No `analysis` change in this feature.
- `photos`: `clothing_id` nullable, `position` nullable, `UniqueConstraint(clothing_id, position)`. PATCH replacement: dropped -> `clothing_id=NULL, position=NULL`; kept/added staged via `NULL` then `0..n-1` in request order. New photos must be uploader-owned, same event, unattached or already on this garment.

Replay: identical `photoIds` order + identical fields + identical measurements-normalized (`{}`->`None`) -> no write, return current.
