# Quickstart: Validate Read Event

**Feature**: `003-read-event` | Contract: [contracts/read-event.openapi.yaml](contracts/read-event.openapi.yaml) | Model: [data-model.md](data-model.md)

## Prerequisites

- The feature 001 backend setup ([../001-create-event/quickstart.md](../001-create-event/quickstart.md)). This feature adds no dependencies and no migrations.

```bash
cd backend && uv sync
```

## 1. Automated checks (required before every commit)

```bash
cd backend && uv run ruff format --check --no-cache . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

Expected: all pass, including the existing feature 001 tests (which guard the `build_event_read` refactor, R6). The new tests map to the spec as follows:

| Test file | Proves |
|---|---|
| `tests/api/test_read_event.py` | 200 shape for a regular participant (`me.isOrganizer=false`, `stats=null`) and the organizer (stats with the actual participant count, 0/0 for clothing and exchanges); entry code/link visible to all; closed event readable with `closedAt`; two reads are identical and change no rows; no `participantToken` in the body (US1–US3, FR-005–FR-011) |
| `tests/api/test_read_event_auth.py` | 401 for missing header, non-Bearer scheme, empty token, unknown token; 401 before 404 for a non-existent event; 404 for another event's token, a non-existent ID, and a malformed ID, with identical bodies apart from `requestId`; shared error format with `requestId == X-Request-ID`; raw token absent from logs (US4, FR-002–FR-004) |
| `tests/services/test_event_service.py` *(extended)* | `EventService.get`: organizer flag derivation, stats `None` for non-organizers, participant count per event only |
| `tests/api/test_openapi_contract.py` *(extended)* | GET documents 200/401/404/500 with `ErrorResponse` and `X-Request-ID`; bearer security scheme; no 422 or `HTTPValidationError` (FR-012) |

## 2. Manual run

Start the backend as in feature 001 quickstart §2 (`APP_BASE_URL=http://localhost:3000 docker compose up --build -d`), then:

```bash
SESSION=$(curl -s -X POST http://localhost:8000/api/v1/events \
  -H 'Content-Type: application/json' -d '{"name":"Swap","organizerDisplayName":"Mina"}')
EVENT_ID=$(echo "$SESSION" | python3 -c 'import sys,json;print(json.load(sys.stdin)["event"]["id"])')
TOKEN=$(echo "$SESSION" | python3 -c 'import sys,json;print(json.load(sys.stdin)["participantToken"])')

curl -si http://localhost:8000/api/v1/events/$EVENT_ID -H "Authorization: Bearer $TOKEN" -H 'X-Request-ID: qs-read'
```

Expected: `200`, `X-Request-ID: qs-read`, same event shape as the creation result's `event` (`me.isOrganizer: true`, `stats` 1/0/0), and no `participantToken`.

### Error paths

| Request | Expected |
|---|---|
| No `Authorization` header | 401 `UNAUTHENTICATED` |
| `Authorization: Basic $TOKEN` or `Bearer ` (empty) | 401 `UNAUTHENTICATED` |
| `Authorization: Bearer not-a-real-token` | 401 `UNAUTHENTICATED` |
| No header, path `/api/v1/events/does-not-exist` | 401 (auth first) |
| Valid token, path `/api/v1/events/does-not-exist` | 404 `NOT_FOUND` |
| Valid token, path = a second event's ID (create another event first) | 404 `NOT_FOUND`, same body as above apart from `requestId` |

Every error body has `error.requestId` equal to the `X-Request-ID` response header, and `details: null`.

Regular-participant and closed-event reads can't be exercised manually until join (04) and close (03) exist. Automated tests cover them using fixtures that insert rows directly.

## 3. Optional: Postman

With the stack running, `postman/collections/Vintage Relay API/01 Events/Get event`, `08 Auth errors/Missing token`, and the new `08 Auth errors/Get non-existent event` assert 200, 401, and 404. This is live local evidence only; pytest is the gate.

## 4. Performance check (SC-006)

Same method as feature 001 quickstart §4, but sending 100 `GET /api/v1/events/$EVENT_ID` requests with `Authorization: Bearer $TOKEN` from 5 concurrent clients. Pass condition: `p95 < 1.000s` and `errors=0` (all 200). Record the result in the PR.
