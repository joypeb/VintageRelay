# Quickstart: Validate Join Event

Validation guide for the join-event increment. See [plan.md](plan.md), [data-model.md](data-model.md), and [the operation contract](contracts/join-event.openapi.yaml).

## Prerequisites

- Feature checkout with Python 3.14 and the uv-managed backend environment.
- curl and jq for manual checks. Use synthetic data only.
- A fresh local SQLite file and one server worker.
- Upgrading a populated database adds a unique case-insensitive name index. Check for conflicts first and resolve any rows manually:

  ```sql
  SELECT event_id, lower(display_name), count(*) FROM participants GROUP BY 1, 2 HAVING count(*) > 1;
  ```

## Automated checks

```bash
cd backend
uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

Expected: all pass, including the new join API, service, concurrency, migration, and logging tests.

## Run locally

```bash
cd backend
uv sync --locked
mkdir -p data
export DATABASE_URL=sqlite:///./data/join-event-validation.db
uv run alembic upgrade head
uv run fastapi dev app/main.py
```

## Manual scenarios

In another shell, create an event and keep its values in shell variables:

```bash
BASE=http://127.0.0.1:8000/api/v1
CREATED=$(curl -s -X POST $BASE/events -H 'Content-Type: application/json' \
  -d '{"name":"Swap Corner","organizerDisplayName":"Mina"}')
EVENT_ID=$(echo "$CREATED" | jq -r .event.id)
CODE=$(echo "$CREATED" | jq -r .event.entryCode)
ORG_TOKEN=$(echo "$CREATED" | jq -r .participantToken)
LOWER=$(echo "$CODE" | tr 'A-Z' 'a-z')
```

| # | Command | Expected |
|---|---|---|
| 1 | `curl -s "$BASE/entry-codes/%20$LOWER%20"` | 200 `{eventId, name, status: "active"}` only |
| 2 | `curl -s -i $BASE/entry-codes/ZZZZZZ` | 404 `NOT_FOUND` with the "We couldn't find an event with this code…" message |
| 3 | `curl -s -X POST $BASE/events/$EVENT_ID/participants -H 'Content-Type: application/json' -d "{\"entryCode\":\"$LOWER\",\"displayName\":\" Joon \"}"` | 201; `event.me.isOrganizer=false`, `event.me.displayName="Joon"`, `event.stats=null`, `participantToken` present |
| 4 | `GET $BASE/events/$EVENT_ID` with the token from 3 | 200 as non-organizer; no `participantToken` in the body |
| 5 | Repeat 3 with `"displayName":"JOON"`, then with `"mina"` | 409 `DISPLAY_NAME_TAKEN`, `details.field="displayName"` |
| 6 | Join with `"entryCode":"WRONG1"`, then join a random UUID event ID with the correct code | Both 404 with identical `error.code`, `message`, and `details` |
| 7 | Join with `"displayName":"   "` or a 31-character name | 422 `VALIDATION_ERROR` |
| 8 | Close with `POST $BASE/events/$EVENT_ID/close` and `ORG_TOKEN`, then repeat 1 and 3 with a new name | Lookup 200 `status: "closed"`; join 409 `EVENT_CLOSED` |
| 9 | Inspect server output | One `participant_joined` per successful join with `event_id`, `participant_id`; lookup paths show `/entry-codes/K7****`-style masking; no raw code or token anywhere. Unhandled-error log paths are also masked (verified by automated test T004) |

## Not covered

- Lookup rate limiting (FR-013) is deferred; see [research R7](research.md#r7-rate-limiting-is-deferred).
- Session recovery and returning-participant verification remain open decisions.

## Implementation Evidence

### T001 baseline (2026-10-30)

- Branch `feature/backend-join-event` (renamed from `docs/backend-join-event-spec`); `.specify/feature.json` → `specs/007-join-event`.
- `ruff format --check`: 60 files already formatted. `ruff check --no-cache`: all checks passed. `mypy app`: no issues in 29 source files. `pytest`: 161 passed.
