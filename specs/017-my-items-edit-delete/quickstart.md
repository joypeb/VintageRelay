# Quickstart: 017

Backend:
1. `cd backend && uv run pytest -q` (baseline green).
2. Register garment via `POST /events/{id}/clothing`, then `PATCH /clothing/{id}` with same body -> 200, `contentVersion` unchanged.
3. `PATCH` title change -> 200, `contentVersion` +1, photos order kept.
4. `PATCH` with other garment's photo -> 409 `PHOTO_ALREADY_ATTACHED`.
5. `DELETE /clothing/{id}` -> 204; repeat -> 204; closed event repeat -> 204.

Frontend (360–430px):
1. Register -> lands on My items with "Clothing registered.".
2. My items shows own rows with badges; tap -> C4.
3. C4 [Edit] -> prefilled form; save -> C4 with "Saved.".
4. C4 [Delete] -> confirm -> back to C1; withdrawn badge shown.
5. Screenshots for PR.
