# Quickstart: 021 Cancel and Confirmed Handover View

## Automated

```bash
cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest tests/api/test_proposals_cancel.py && uv run pytest
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

Expected: cancel tests cover success (2- and 3-person), replay, replay after closure, `EVENT_CLOSED`, `PROPOSAL_NOT_CONFIRMED`, non-party 404, garments available again, cancelled cycle suppressed, new cycle forms with a freed garment.

## Manual (phone, 360–430px)

1. Create event (A), join as B; each registers one item.
2. B requests A's item; A accepts; B consents → T3 shows pairs, names, notice "Confirmed. Inspect the garments in person before handing them over."
3. Tap a garment in T3 → detail with all photos and measurements.
4. A's My item detail shows the confirmed exchange link and edit/delete locked with guidance.
5. B taps [Cancel exchange] → dialog "Cancel this exchange?" → [Keep exchange] does nothing; [Cancel exchange] returns to Trades; the exchange is under History as cancelled; both items are available on Home.
6. A refreshes Trades → the exchange is under History.
7. Confirm a new exchange, close the event as A → T3 shows no [Cancel exchange]; it is view-only.
