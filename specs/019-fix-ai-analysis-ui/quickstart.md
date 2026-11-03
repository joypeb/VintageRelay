# Quickstart: 019

Automated:
1. `cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest`
2. `cd frontend && pnpm lint && pnpm typecheck && pnpm test`

Real model (once, key only via `AI_API_KEY` env, never printed):
1. Run backend with the key, register a garment with a photo → `analysis.status` goes `pending` → `done` with vocabulary colors (see plan.md Live Verification Record).

Manual UI (360, 390, 430 px):
1. C1 with an analyzing row: full "Available" badge, title ≤ 2 lines, "AI analyzing…" on its own line.
2. Empty C1: tab bar at the bottom of the viewport (active and closed event).
3. C4 for a done garment: status badge visible, no "Offered by", Edit/Delete above "Estimated by AI"; colors/tags as chips; "Check in person" notes as separate items.
4. Edit: heading "Edit item"; save → C4 "Saved." with "AI analyzing…" / "Analysis runs in the background."
5. Delete: opaque dialog; confirm → C1 shows "Withdrawn" without "AI analyzing…"; if no other item is pending, no further `ownership=mine` requests every 5 s; with another pending item, polling continues only until it finishes.
6. Home/B3 with a done garment renders (no error state).
