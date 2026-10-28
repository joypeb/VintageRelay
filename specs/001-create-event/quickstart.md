# Quickstart: Validate Create Event

**Feature**: `001-create-event` | Contract: [contracts/create-event.openapi.yaml](contracts/create-event.openapi.yaml) | Model: [data-model.md](data-model.md)

## Prerequisites

- `uv` 0.13.x, Python 3.14 (managed by uv).
- Dependencies added by this feature: `sqlalchemy`, `alembic`, `pydantic-settings` ([research.md](research.md) R1).
- Docker with Compose v2 for §2.

```bash
cd backend
uv sync
```

## 1. Automated checks (required before every commit)

```bash
cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest
```

Expected: all pass. The feature's tests map to the spec as follows:

| Test file | Proves |
|---|---|
| `tests/unit/test_entry_code.py`, `test_security.py` | Code alphabet and length; token format; SHA-256 hash |
| `tests/unit/test_config.py`, `test_schemas_common.py`, `test_logging.py` | Settings defaults and env; camelCase/`Z` serialization; masking; exception messages never logged; `caplog`-compatible setup |
| `tests/services/test_db.py` | Pragmas, read/write transactions, `UtcDateTime`, `hide_parameters` |
| `tests/api/test_error_format.py`, `test_cors.py` | Shared error format, `requestId` on 404/AppError/500, CORS preflight and expose headers (FR-015, FR-016) |
| `tests/api/test_create_event.py` | 201 `EventSession` shape, trimming, code/link baseline, `stats` 1/0/0, `Authorization` ignored, non-idempotent (US1, US2 AS1–2) |
| `tests/services/test_event_service.py` | Token hash stored and resolvable, `event_created` audit log, no raw secrets in logs (US1 AS2, FR-013, SC-005) |
| `tests/services/test_event_atomicity.py`, `tests/api/test_create_event_atomicity.py` | Failure at linking or at response build → 500, 0 rows; organizer belongs to the same event (US4) |
| `tests/api/test_create_event_sharing.py`, `tests/services/test_entry_code_retry.py` | Trailing-slash origin normalization; collision retry; 10-attempt exhaustion → 500 (US2) |
| `tests/api/test_create_event_validation.py` | All 422 reasons including `unknown_field` (with `null`) and snake_case input; 400 bodies; boundaries; 0 rows on rejection (US3) |
| `tests/api/test_openapi_contract.py` | 201/400/422/500 documented with `ErrorResponse` and `X-Request-ID`; request constraints (FR-015) |
| `tests/test_migrations.py` | `alembic upgrade head` on an empty DB creates the tables and constraints |

## 2. Manual run (Docker Compose)

The backend runs with Docker Compose. SQLite lives on the named volume `backend-data`; there is no separate DB container ([research.md](research.md) R15). Prerequisite: Docker with Compose v2.

```bash
# from the repository root
APP_BASE_URL=http://localhost:3000 docker compose up --build -d
docker compose ps        # backend should become "healthy" (GET /api/v1/health)
docker compose logs backend | grep -i alembic   # migration ran on start
```

Local alternative without Docker (development only):

```bash
cd backend && mkdir -p data
DATABASE_URL=sqlite:///./data/app.db APP_BASE_URL=http://localhost:3000 uv run alembic upgrade head
DATABASE_URL=sqlite:///./data/app.db APP_BASE_URL=http://localhost:3000 uv run fastapi dev app/main.py
```

### Happy path

```bash
curl -si -X POST http://localhost:8000/api/v1/events \
  -H 'Content-Type: application/json; charset=utf-8' -H 'X-Request-ID: qs-1' \
  -d '{"name":"  Mangwon Flea Market Swap Corner  ","organizerDisplayName":"Mina"}'
```

Expected: `201`, header `X-Request-ID: qs-1`, body matching `EventSession` — `status: "active"`, trimmed `name`, `me.isOrganizer: true`, `organizerParticipantId == me.participantId`, `entryCode` matching `^[A-HJ-NP-Z2-9]{6}$`, `entryUrl == "http://localhost:3000/join?code=" + entryCode`, `stats` = 1/0/0, `createdAt` ending in `Z`, `closedAt: null`, non-empty `participantToken`.

### Error paths

| Body | Expected |
|---|---|
| `{"name":"   ","organizerDisplayName":"Mina"}` | 422, `details.fields = [{field: "name", reason: "required"}]` |
| `{"name":null,"organizerDisplayName":123}` | 422, `name`→`required`, `organizerDisplayName`→`invalid_type` |
| `{"name":"Swap","organizerDisplayName":"Mina\nKim"}` | 422, `organizerDisplayName`→`invalid_characters` |
| `{"name":"Swap","organizerDisplayName":"Mina","theme":"denim"}` | 422, `theme`→`unknown_field` |
| 61-char `name` | 422, `name`→`too_long` |
| `{"name":` (malformed) | 400 `BAD_REQUEST` |

Every error body has `error.requestId` equal to the `X-Request-ID` response header.

### CORS preflight

```bash
curl -si -X OPTIONS http://localhost:8000/api/v1/events \
  -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization, content-type, x-request-id'
```

Expected: `200`, with `access-control-allow-origin: http://localhost:3000` and the three headers allowed. With `-H 'Origin: https://evil.test'`, there is no allow-origin header.

### Stored data check

```bash
docker compose exec backend python -c "import sqlite3; print(sqlite3.connect('/data/app.db').execute('select e.status, e.entry_code, p.event_id = e.id, length(p.session_token_hash) from events e join participants p on p.id = e.organizer_participant_id').fetchall())"
docker compose logs backend | grep event_created
```

Expected: rows like `('active', '<code>', 1, 64)`; the raw `participantToken` from the response does not appear in the DB or in `docker compose logs` (the `event_created` line shows only `event_id`).

### Persistence check

```bash
docker compose down && docker compose up -d   # keep the volume (no -v)
```

Expected: the rows from the previous step still exist. `docker compose down -v` deletes the volume and therefore all data.

## 3. Optional: Postman collection run

With the Compose stack running, the existing requests `postman/collections/Vintage Relay API/01 Events/Create event` and `08 Auth errors/Create event with empty name` assert the 201 shape and the 422 `name` error (environment `postman/environments/Local.environment.yaml`, `baseUrl=http://localhost:8000`). This is live local evidence only; the pytest suite is the gate.

## 4. Performance check (SC-006)

With the Compose stack running, send 100 creation requests from 5 concurrent clients and report the latency percentiles. Use a throwaway script outside the repository:

```bash
cd backend && uv run python - <<'PY'
import time, statistics, httpx
from concurrent.futures import ThreadPoolExecutor
def one(_):
    t = time.perf_counter()
    r = httpx.post("http://localhost:8000/api/v1/events", json={"name": "Perf", "organizerDisplayName": "Mina"})
    return time.perf_counter() - t, r.status_code
with ThreadPoolExecutor(5) as ex:
    res = list(ex.map(one, range(100)))
lat = sorted(d for d, _ in res); errors = sum(1 for _, c in res if c != 201)
print(f"p50={statistics.median(lat):.3f}s p95={lat[94]:.3f}s errors={errors}")
PY
```

Pass condition: `p95 < 1.000s` and `errors=0`. This is local, live evidence; record it in the PR.
