# Quickstart: 019 AI Search

## Automated checks

```bash
cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

Expected backend coverage (fake AI, no network):
- Interpretation: validation (vocabulary, names, ranges, ±1 widening), 422 on empty/long text without an AI call, 503 `AI_UNAVAILABLE` on fake failure and on the injected missing-key analyzer, call metadata logged (retries, latency, model ID), closed event allowed, no text in logs.
- Ranked search: hard filter, color points (done + current version only; pending/failed/old version never match), range points (inclusive, missing never matches), tie order, zero-point items kept, no conditions = Home order, caller's and non-available items excluded, 422 cases, closed event allowed.

Expected frontend coverage: query text validation, URL ↔ conditions round trip with duplicate colors collapsed, chip removal, condition count, S2 range validation.

## Manual scenario (360–430 px)

1. Start backend and frontend (see README). Join an event with two participants; participant B registers garments with different categories, colors, and measurements; wait for analysis `done` (or set `AI_API_KEY`).
2. As participant A, open the Search tab, type "green jacket, chest around 21 inches" → chips Outer, green, chest 20–22; results ranked with "N/2 match" labels.
3. Remove the chest chip → results re-rank, no interpretation request in the network panel.
4. Open a result (B3) and go back → same query, chips, and results.
5. Start the backend with a non-empty invalid `AI_API_KEY` (a missing key aborts startup; an invalid one passes startup and fails calls) so the model call fails, then submit text → error message and [Choose filters]; pick the same conditions in S2 → identical ranking.
6. Close the event as organizer → search and interpretation still work.
