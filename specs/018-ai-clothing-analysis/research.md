# Research: 018 Background AI Clothing Analysis

**Feature**: specs/018-ai-clothing-analysis/spec.md · **Plan**: specs/018-ai-clothing-analysis/plan.md

Explorer report (Paseo, 2026-11-04) folded in below where marked [E].

## 1. Transaction + trigger shape

- **Decision**: Upsert `pending` row in the same `Db.write()` transaction as register/edit content change (register: `services/clothing.py:44-112`; edit: 017 `edit()`), then schedule `BackgroundTasks` from the router after the service returns (service stays sync; router owns background scheduling to keep services testable without FastAPI).
- **Rationale**: Spec requires pending visible in the response; same-transaction upsert guarantees it. Services never import FastAPI.
- **Alternatives**: Service-owned scheduling — rejected; couples service to FastAPI and complicates unit tests.
- [E]: confirm exact `_build_response` analysis hook point and edit replay path (replay = no new version = no new pending row).

## 2. Model call surface

- **Decision**: `POST {base}/chat/completions` via httpx (already a dependency; base default `https://api.meta.ai/v1`), model `muse-spark-1.3`, `temperature 0.2`, `response_format: {type: json_schema, json_schema: {name: ClothingAnalysisResult, schema}}`. Images as `image_url.url = data:<mime>;base64,...` (first 3 photos in order).
- **Rationale**: Documented image_url + structured-output support; no new SDK dependency; data URLs avoid hosting.
- **Schema**: flat object `{colors[1..3 vocab], pattern|null, materialEstimate|null, styleTags[max 8], visibleDetails[max 8], sizeLabel|null, uncertainties[{aspect, message}]}` with `additionalProperties: false`; server clamps lengths and drops empties/unknown colors.
- **Timeouts/retries**: `httpx.Timeout(30.0, connect=5.0)`; 1 retry after 1 s on timeout/5xx/429 only; semaphore 4, wait 2 s else fail-fast.
- [E]: verify httpx version supports per-phase Timeout + transport errors raised as `httpx.TimeoutException`.

## 3. Settings

- **Decision**: `Settings.ai_api_key: SecretStr | None = None` (env `AI_API_KEY`); `main.py` lifespan asserts a key is present on the production path only (`db is None`, real server) and raises a clear error otherwise; the injected-`db` test path never requires a key. This keeps `tests/conftest.py` and `tests/unit/test_config.py` green without fixture changes. Timeouts/concurrency: `ai_api_base_url`, `ai_model_id`, `ai_analysis_timeout_seconds = 30.0`, `ai_slot_wait_seconds = 2.0`; shared semaphore fixed at cap 4 (no settings resize in this slice).
- **Rationale**: pydantic-settings `SecretStr` never logs the key; explicit startup assertion (not a required field) gives the ai-features §7 "startup fails" behavior with a clear message while keeping the suite key-free.
- **Rationale**: pydantic-settings `SecretStr` never logs the key; `env_file=None` pattern stays (operator injects env).
- **Note**: docs say `META_API_KEY`; operator env uses `AI_API_KEY` — implementation follows the operator; docs updated in PR.

## 4. Persistence

- **Decision**: New `clothing_analyses` table via Alembic: `id PK, clothing_id FK UNIQUE (single current row, replaced on version bump — `stale` never retained in this slice), content_version, status, features JSON, uncertainties JSON, model_info JSON, updated_at`. Migration + `test_migrations.py` update (hand-written `op.create_table`, repo pattern).
- **Freshness**: register/edit upsert sets `status=pending` for new version, replacing the previous row. Job save uses one conditional write (`UPDATE ... WHERE clothing_id=? AND content_version=? AND status!='done'`, then check `rowcount`): withdrawn/version-changed/already-`done` → 0 rows → discard; else `done`. No `SELECT FOR UPDATE` (SQLite); rowcount is the atomicity mechanism.
- [E resolved]: Alembic hand-written pattern confirmed (`e4f1a2b3c5d6...py:21-58`); `migrated_database` fixture pattern confirmed (`test_migrations.py:57-75`).

## 5. Startup cleanup

- **Decision**: In `main.py` lifespan, run `mark_pending_failed()` (single write transaction) in **both** paths — before the injected-`db` early return as well as on the production path — then assert `AI_API_KEY` presence only on the production path (`db is None`). Cleanup function unit-tested directly; TestClient path covered by the same call.
- **Rationale**: Current `main.py:23-34` early-returns when `db` is injected, which would skip both makedirs and cleanup; placing both before the branch keeps tests honest.
- Router/service split: routers only `add_task(service_method)` with the analyzer supplied via a FastAPI `Depends` provider (`get_analyzer`: real client from settings in production, `dependency_overrides` fake in tests); routers never import `app/ai/client.py` (ai-integration.md isolation holds — scheduling is not calling). Job tests call the service method directly (no TestClient BackgroundTasks flakiness); trigger tests assert the sync `pending` in the response with a gated fake.

## 6. Frontend

- **Decision**: Extend `clothing-response.ts` zod with `analysisSchema` (`status` enum pending/done/failed/stale, nullable `features` with vocab/pattern/tag caps, `uncertainties` with `aspect` enum + 200-char cap; `features` null unless `done`), replacing the `analysis: z.null()` shortcut (`clothing-response.ts:61-62`). `Clothing` type gains `analysis`. `useMyItemsQuery`/`useClothingQuery` (existing hooks from 017, same options shape) get `refetchInterval: (q) => q.state.data?.analysis?.status === "pending" ? 5000 : false`. C1 rows + C4 show "AI analyzing…" + `role=status`; B3/C4 render Estimated section when `done`, nothing when `failed`/`null`.
- **Rationale**: Query-level polling keeps screens dumb; matches spec (no polling for terminal states).
- [E resolved]: hook options shape confirmed (017 `useMyItemsQuery`/`useClothingQuery` accept options); Photo model carries `storage_location` + `content_type` (JPEG/PNG/WebP) with position ordering for first-3 selection (explorer §2).

## 7. Photo bytes

- **Decision**: Job reads `photo_dir/<storage_location>` for first 3 photos (ordered by position), MIME from stored `content_type`; missing file → `failed`. No URL transport, no resize in this slice (provisional pending T002/T018 latency).

## 8. Logging/privacy

- `ai_call_failed` at WARNING with `task="clothing_analysis"`, `reason`, `latency_ms`, `retry`, token counts if available; never key/bytes/text. Lengths only at INFO (`photo_count`, `title_length`).
