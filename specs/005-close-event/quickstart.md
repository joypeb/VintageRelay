# Quickstart: Validate Close Event

This guide describes validation **after implementation**. Planning adds no endpoint or tests; the close route will remain unavailable until the implementation stage. See [plan.md](plan.md), [data-model.md](data-model.md), and [the operation contract](contracts/close-event.openapi.yaml).

## Prerequisites

- Use the feature checkout with Python 3.14 and the existing uv-managed backend environment.
- Manual HTTP examples require curl and jq. Use synthetic local data only.
- Use a fresh local SQLite file and one server worker. Automated tests use a separate file per test under `tmp_path`.
- The organizer credential comes from event creation. A regular participant is created through existing test factories until the join endpoint exists.

## Prepare and run locally

From the repository root:

```bash
cd backend
uv sync --locked
mkdir -p data
export DATABASE_URL=sqlite:///./data/close-event-validation.db
uv run alembic upgrade head
uv run fastapi dev app/main.py
```

Keep this terminal running. Do not point the validation database at real event data. Existing Docker Compose is an alternative server setup; the commands above keep the validation database isolated.

## Create, close, and replay

In another shell, create an event and keep the local credential in shell variables. Do not paste it into shared logs or commit it.

```bash
BASE_URL=http://localhost:8000
CREATE_RESULT=$(curl --fail-with-body --silent --show-error \
  -X POST "$BASE_URL/api/v1/events" \
  -H 'Content-Type: application/json' \
  --data '{"name":"Closure validation","organizerDisplayName":"Mina"}')
EVENT_ID=$(printf '%s' "$CREATE_RESULT" | jq -r '.event.id')
PARTICIPANT_TOKEN=$(printf '%s' "$CREATE_RESULT" | jq -r '.participantToken')

FIRST_CLOSE=$(curl --fail-with-body --silent --show-error \
  -X POST "$BASE_URL/api/v1/events/$EVENT_ID/close" \
  -H "Authorization: Bearer $PARTICIPANT_TOKEN" \
  -H 'X-Request-ID: close-validation-first')
printf '%s' "$FIRST_CLOSE" | jq '{id,status,closedAt,me,stats}'

SECOND_CLOSE=$(curl --fail-with-body --silent --show-error \
  -X POST "$BASE_URL/api/v1/events/$EVENT_ID/close" \
  -H "Authorization: Bearer $PARTICIPANT_TOKEN" \
  -H 'X-Request-ID: close-validation-replay')
test "$(printf '%s' "$FIRST_CLOSE" | jq -r '.closedAt')" = \
     "$(printf '%s' "$SECOND_CLOSE" | jq -r '.closedAt')"

curl --fail-with-body --silent --show-error \
  "$BASE_URL/api/v1/events/$EVENT_ID" \
  -H "Authorization: Bearer $PARTICIPANT_TOKEN" | jq '{status,closedAt}'
```

Expected: first close and replay both return 200. Each has `status=closed`, the same non-null UTC `closedAt`, organizer caller information, and stats of 1/0/0 for a fresh event. No `participantToken` is returned. The subsequent read agrees. Server logs contain one `event_closed` record, with invalidated count zero, and normal per-request logs for each request.

Check unauthenticated error correlation:

```bash
curl --silent --show-error -i -X POST \
  "$BASE_URL/api/v1/events/$EVENT_ID/close" \
  -H 'X-Request-ID: close-validation-unauthenticated'
```

Expected: 401 `UNAUTHENTICATED`; the error's `requestId` and response `X-Request-ID` both equal `close-validation-unauthenticated`. The event remains closed with its original closure time.

## Automated acceptance matrix

The following filenames are planned outputs of implementation, not tests created during planning.

| Planned test target | Required assertions |
|---|---|
| `tests/services/test_close_event.py` | Authorized transition, scope/role protection including direct service calls, injected clock called only once, current summary, unchanged event identity/participants, sequential replay, no secrets in logs |
| `tests/services/test_close_event_concurrency.py` | Two independent transactions and overlapping callers; both succeed, same original timestamp, one state update and one closure log; finite synchronization timeouts |
| `tests/services/test_close_event.py` failure cases | Inject failure after update, during result preparation, and at commit; active/null closure time preserved, no closure log, then retry succeeds |
| `tests/api/test_close_event.py` | No body required; normal result and replay; missing/malformed/unknown credential 401; other/missing/malformed event 404; same-event regular participant 403 on active and closed events; safe 500 envelope; request ID and token confidentiality |
| `tests/api/test_openapi_contract.py` | POST path, bearer scheme, Event result, 200/401/403/404/500 headers/errors, no automatic 422 on close; create retains its intentional 400/422 and read retains its contract |
| Existing read-event tests | Closed event remains readable; regular participants still have `stats=null` |

After these tests exist:

```bash
cd backend
uv run pytest tests/services/test_close_event.py tests/services/test_close_event_concurrency.py tests/api/test_close_event.py tests/api/test_openapi_contract.py
uv run ruff format --check . && uv run ruff check . && uv run mypy app && uv run pytest
```

Do not synchronize both writers after taking the SQLite write lock: the second writer cannot enter then. Start them with a barrier before transactions or use bounded events so the first transaction can release its lock deterministically. Avoid sleeps and shared SQLAlchemy sessions.

## Existing Postman validation inputs

Reuse the saved requests in `postman/collections/Vintage Relay API/09 Close event/` for close and replay, and the non-organizer request under `08 Auth errors/`. The local-only creation/closure/read subset can run without the missing join/garment/proposal features. The entire collection cannot yet prove all post-closure behavior. No collection publishing is needed for this feature.

## Future integration verification

[closure-integration.md](contracts/closure-integration.md) lists unbuilt operations and policy gates. When actual consent exists, verify both closure/consent orderings with its real service and the same SQLite file. Once the proposal policies are approved and implemented, test pending invalidation, retained confirmations, terminal history, unrelated events, rollback, and consent replay after invalidation. Do not report these as verified by close-only tests.

## Planning-stage evidence

The delegated explorer reported an unchanged-code baseline of 56 formatted files, lint passing, mypy passing for 29 files, and 110 tests passing. These results concern existing create/read functionality; they do not validate a close implementation. The orchestrator's artifact checks validate document links, YAML structure/references, and example compatibility, without a live close call.


## Implementation Evidence

### Setup and foundation (T001–T002)

- Verified branch `docs/backend-close-event-spec` at baseline `e2f787ceabcc1241246ecae7e9379e4d529752e3` and the active `specs/005-close-event` pointer.
- The orchestrator reran the full backend baseline: 56 files formatted, lint passed, mypy passed for 29 source files, and 110 tests passed.
- Default uv cache access was denied by the sandbox. The successful rerun used `UV_CACHE_DIR=/private/tmp/vintage-relay-uv-cache` and `uv run --offline` with the existing environment; no dependency changes were needed.
- Existing file-backed `tmp_path` database, participant factory, fixed-clock service injection, and `client_no_raise` are reusable. No fixture or schema changes were needed during preparation.
- Reviewed existing Git/Docker/ESLint/Prettier ignores for the actual Python backend Docker context and frontend setup. Existing environment, database, dependency, build, and cache exclusions cover this change; no ignore-file changes or package publishing are needed.
- Spec-quality checklist remains read-only: 16 checked, zero unchecked. No extension hooks are configured.

### Organizer gate (T003–T004)

- T003 test-author established Red: 14 new service/dependency cases failed because the organizer capability was absent; the original 110 tests still passed.
- T004 implemented only the read-only organizer gate and `ForbiddenError` in three production files.
- The orchestrator independently reran checks after Green: 57 files formatted, lint passed, mypy passed for 29 source files, and 124 tests passed. `git diff --check` passed.
- T005 OCR delegate review found no Critical/High/Medium findings. It accounted for 13 preview files: 4 reviewed intended commit files, 9 feature documents skipped outside this commit, and 100% commit-scope coverage. Reviewed green content was committed as `a0134f9` (`feat(backend): add organizer authorization gate`). Feature documentation remains for separate final review.

### Closure Red batch (T006–T008)

- Before any close implementation, test-author ran all new API/service/schema/concurrency tests: the full suite had 125 passes and 35 expected failures due to the missing `EventService.close` and close route. The prior 124 tests passed separately. One new missing-resource assertion passed incidentally because the route was absent and remains subject to Green verification.
- Tests include authorized replay, original timestamp, replay clock suppression, single closure log, confidentiality, direct-service authorization, pre-commit failures after update/result preparation/commit, rollback/retry, and overlapping independent SQLite write sessions.
- The failure injection boundary is `mark_closed(session, event_id, closed_at) -> int`, plus the shared response builder, engine commit event, and injected clock. No production changes were made during Red.
- The orchestrator independently checked the unchanged frontend: lint and typecheck passed; 17 test files and 141 tests passed. No frontend files were changed. Final backend checks remain due after implementation.

### Closure Green batch (T009–T010)

- The orchestrator independently reran the complete backend checks after implementation: 59 files formatted, lint passed, mypy passed for 29 source files, and 160 tests passed; `git diff --check` passed.
- The 35 prior expected failures are now green, including same-session state/summary handling, authorized replay, exactly one log, rollback/retry, HTTP/error/schema guarantees, and actual overlapping closure requests.
- Five production files changed; no new dependencies, tables, migrations, or proposal/consent behavior were added. T011 exact-content OCR delegate review found no Critical/High/Medium/Low defects: all 9 commit files were reviewed, with rules resolved for all source and test paths; 9 feature documents were explicitly skipped outside commit scope. Green code/tests were committed as `b96b374` (`feat(backend): add idempotent event closure`).

### Local live HTTP and saved Postman smoke validation

- Used an isolated migrated SQLite file under `/private/tmp` and one Uvicorn process bound to `127.0.0.1:18765`; no existing event data was used. Initial sandbox attempts could not bind/connect localhost, and sandboxed Postman terminated with a keychain error. The approved rerun outside those restrictions passed.
- Live HTTP assertions passed: creation 201; bodyless close 200; replay 200 with the same complete event result and original closure time; read 200 matching closure; unauthenticated close 401 with correlated request ID; and `/openapi.json` bearer/no-body/200-401-403-404-500 contract. Synthetic credentials remained in process only.
- Reused the saved Postman create, get, close, and close-replay requests against that live server with `--no-report-events`: 4 requests, 11 assertions, zero failures, exit code 0. No collection edits or remote publication occurred.
- Server log inspection confirmed exactly one `event_closed` record per synthetic event despite replay, with actor/event IDs and invalidated count zero. The local server was shut down after validation.
- This smoke run does not verify missing join, clothing, proposal, consent, cancellation, or AI behavior.

### Regression verification (T012–T014)

- The orchestrator reran the already-authored close service/API/concurrency regression files: 49 tests passed. Repeated the full backend checks: format (59 files), lint, mypy (29 files), and 160 tests passed.
- No new gap was found, so T014 required no additional production changes or artificial Red tests. Full replay/clock/log/rollback/concurrency tests existed before the initial closure implementation, as required by the corrected task order.
- Standard stdout logging provides one success log per normal committed initial closure, not a durable exactly-once guarantee across process crashes.
