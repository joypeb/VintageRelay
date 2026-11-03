# Quickstart: 020 Exchange Requests and Proposals

## Backend

```bash
cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest -q
```

Focused suites: `tests/unit/test_matching*.py` (cycles, cycleKey, suppression), intent/proposal API tests (visibility 404, replay idempotency, version mismatch, concurrent confirm, closure).

## Frontend

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

Manual (360-430px, screenshots for PR): B3 request -> I1 offer sheet -> withdraw; T1 Received accept/decline, Sent states, Exchanges groups; T2 consent/reject + proposal-changed modal; C4 requests section; C2 edit warning; badge + polling.

## E2E

Two users: request -> accept -> consent -> confirmed. Three users: complete loop -> auto 3-person proposal -> unanimous consent -> confirmed. Stale-version consent -> mismatch modal.
