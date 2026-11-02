# 017 — My Items: List, Detail, Edit, Delete

**Area:** Backend + Frontend · **Depends on:** [015](015-app-shell.md) · **Next:** [018](018-ai-clothing-analysis.md), [020](020-exchange-requests.md) · Common steps: [README](README.md#3-spec-kit-run-same-for-every-feature)

## 1. Feature

The My items tab becomes the owner's workspace: a list of their garments (C1), a detail screen (C4), editing through the existing two-step form (C2 in edit mode), and deleting (withdrawing) a garment. The backend adds the edit and withdraw APIs. Registration now returns to My items instead of Home.

## 2. Scope

**Backend**
- `PATCH /api/v1/clothing/{clothing_id}` per [API 07](../api/07-edit-withdraw-clothing.md) §1: optional `photoIds` (whole-list replacement, existing photos allowed, dropped photos detached), `category`, `title`, `description`, `measurements` (whole-object replacement, validated against the resulting category); replay when unchanged; `contentVersion` increments; log `clothing_updated`.
- `DELETE /api/v1/clothing/{clothing_id}` per API 07 §2: soft delete to `withdrawn`, idempotent `204`; log `clothing_withdrawn`.
- **Skip for now** the steps that need tables built later: analysis stale/restart (07 PATCH step 5 → 018) and intent/proposal invalidation (PATCH steps 6–7, DELETE steps 6–7 → 020). Keep the `confirmed` checks (`CLOTHING_ALREADY_CONFIRMED`), even though nothing is confirmed until 020.

**Frontend**
- C1 `my-items/page.tsx`: `GET .../clothing?ownership=mine`; rows with main photo, title, status badge; [+ Register item]; row → C4. Replaces the 015 placeholder.
- C4 `my-items/[itemId]/page.tsx`: details, [Edit], [Delete] with confirmation; confirmed items locked with a hint. A "Requests" section placeholder for 020.
- C2 edit `my-items/[itemId]/edit/page.tsx`: the 014 two-step form prefilled; existing photos start as `ready`; [Save] sends `PATCH`. The "edits invalidate unconfirmed proposals" warning is added in 020, when invalidation exists.
- Registration success goes to C1 with "Clothing registered." (move the status from Home).

**Out:** AI analysis (018), requests and proposals (020).

## 3. References

| Document | Sections |
|---|---|
| [API 07 Edit/withdraw clothing](../api/07-edit-withdraw-clothing.md) | All (request rules, processing, errors, idempotency) |
| [API 06](../api/06-register-read-clothing.md) | 1 Register rules reused by edit; 2 `ownership=mine` includes own withdrawn; `Clothing`, `Measurements` schemas |
| [API README](../api/README.md), [API contract](../../rules/dev/common/api-contract.md) | Check order (replay before event state), 403 vs 404, `PATCH` semantics, error codes |
| [Database design](../database-design-v1.md) | 3.3 `clothes`, 3.4 `photos` (`clothing_id`, `position`) |
| [App flow redesign](../../superpowers/specs/2026-11-02-app-flow-redesign-design.md) | 4.1 My items row; 5 Edit/delete before exchanges exist |
| [Screen flow](../../flows/screen-flow-v1.md) | 4.3 C1, C2, C4 |
| [Mockup v2](../../flows/mockup-flow-v2.html) | Screen 6 |
| Specs [011](../../../specs/011-register-read-clothing/spec.md), [012](../../../specs/012-fix-photo-upload/spec.md), [013](../../../specs/013-clothing-category-measure/spec.md), [014](../../../specs/014-clothing-register-form/spec.md) | Existing registration behavior and validation the edit must match |
| Backend rules: [api.md](../../rules/dev/backend/api.md), [database.md](../../rules/dev/backend/database.md), [error-handling.md](../../rules/dev/backend/error-handling.md), [logging.md](../../rules/dev/backend/logging.md), [testing.md](../../rules/dev/backend/testing.md) | Layers, transactions, errors, log fields, tests |
| Frontend rules: [project-structure.md](../../rules/dev/frontend/project-structure.md), [data-fetching.md](../../rules/dev/frontend/data-fetching.md), [error-handling.md](../../rules/dev/frontend/error-handling.md) | Routes, mutations and cache updates, error mapping |

## 4. Existing Code

- Backend: `backend/app/schemas/clothing.py` (`ClothingCreate` validators to reuse for the update schema), `services/clothing.py` (`register`, `get`, `_build_response`), `repositories/clothing.py`, `repositories/photo.py` (`attach`, `photos_for`), `api/routers/clothing.py`, `domain/errors.py`, `domain/enums.py`.
- Frontend: `components/clothing/PhotoUploadScreen.tsx`, `ClothingDetailsForm.tsx`, `lib/photo/queue.ts` (`photoQueueReducer`, needs an initial state with ready server photos), `lib/validation/clothing-form.ts` (`buildRegisterClothingBody`, `mapClothingServerFieldErrors`), `lib/api/clothing.ts`, `EventHomeScreen.tsx` (registered status to move).

## 5. Already Decided

- `PATCH` (never `PUT`); `photoIds` and `measurements` replace whole values; category/measurement mismatch → `422`, never silent pruning on the server.
- Withdraw is a soft delete; repeated deletes return `204`.
- Detached photos stay stored (retention undecided); no file deletion.
- Invalidation of intents/proposals is added by 020, analysis restart by 018.

## 6. Open Questions for Clarify

- Show the owner's withdrawn garments in C1 (API returns them with `ownership=mine`), or hide them behind a filter?
- After a successful edit, return to C4 (screen flow) — confirm, and whether to show a "Saved." status.

## 7. Spec Kit Run

**Specify input**

```text
017 My items: list, detail, edit, delete (backend + frontend).
Backend: implement PATCH /api/v1/clothing/{clothing_id} and DELETE /api/v1/clothing/{clothing_id} per docs/plans/api/07-edit-withdraw-clothing.md (whole-list photoIds replacement with detach, category/title/description/measurements with the registration validation, measurements validated against the resulting category, replay when unchanged, contentVersion increment, soft-delete withdraw, logs). Skip the analysis step (feature 018) and intent/proposal invalidation steps (feature 020); keep the confirmed checks.
Frontend: My items tab (C1) lists the caller's garments (ownership=mine) with status; C4 detail with Edit and Delete (confirmation), confirmed items locked; edit reuses the 014 two-step form prefilled with existing photos as ready and sends PATCH; registration success now returns to C1 with "Clothing registered.".
Sources: docs/plans/features/017-my-items-edit-delete.md, docs/plans/api/07-edit-withdraw-clothing.md, docs/plans/api/06-register-read-clothing.md, docs/rules/dev/common/api-contract.md, docs/flows/screen-flow-v1.md (4.3), docs/flows/mockup-flow-v2.html (screen 6), specs/011-014.
```

**Plan research (explorer):** how registration validates and attaches photos (to reuse for replacement and detach); uniqueness `(clothing_id, position)` when reordering in one transaction; how the C2 queue/reducer can start from server photos; existing error-code mapping for `PHOTO_ALREADY_ATTACHED`.

**Implement order:** backend PATCH → backend DELETE → frontend C1 → C4 + delete → C2 edit → registration redirect.

## 8. Done When

- Owners can list, open, edit (photos, fields), and delete their garments; others get `403` on edit/delete.
- Edits keep photo order, increment `contentVersion`, and replay unchanged requests; deletes are idempotent.
- Registration lands on C1.
- Backend and frontend checks pass; API docs updated if anything deviated.
