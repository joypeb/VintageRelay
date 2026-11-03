# Contract: DELETE /api/v1/clothing/{clothing_id}

Per docs/plans/api/07-edit-withdraw-clothing.md §2.

- Auth: owner bearer; non-owner 403.
- Already `withdrawn` -> 204 replay even after closure.
- Else: event active else 409 EVENT_CLOSED; `confirmed` -> 409 CLOTHING_ALREADY_CONFIRMED; else `status=withdrawn`, 204.
- Idempotent. Detached photos stay stored.
