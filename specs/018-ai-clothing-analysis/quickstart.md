# Quickstart: 018

Backend (fake client default in tests; no key needed):
1. `cd backend && uv run pytest -q` (green baseline).
2. Register garment → response `analysis.status == "pending"`.
3. Fake completes → detail shows `done` with vocab colors.
4. Force fake failure → `failed`, no estimates; restart with pending → `failed`.

Real-model day-one (once, manual, key via `AI_API_KEY` env only):
1. `AI_API_KEY=<key> uv run python scripts/try_analysis.py <photo> --model muse-spark-1.3` (script prints colors/latency only, never the key).
2. Record access/image/structured-output/latency in plan.md.

Frontend (360–430px):
1. C1 shows "AI analyzing…" on new rows, refreshes every 5 s.
2. C4/B3 shows "Estimated by AI" when done, nothing when failed.
