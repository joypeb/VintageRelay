# 018 — Background AI Clothing Analysis

**Area:** Backend + Frontend · **Depends on:** [017](017-my-items-edit-delete.md) · **Next:** [019](019-ai-search.md) · Common steps: [README](README.md#3-spec-kit-run-same-for-every-feature)

## 1. Feature

Right after a garment is registered or its content edited, the backend asks the Meta model (Muse Spark 1.3) to estimate colors and visible features in the background. The response never waits for it. Owners see "AI analyzing…" until it finishes, and garment details show the result labeled as an AI estimate. The colors feed AI search in 019.

## 2. Scope

**Backend**
- `clothing_analyses` table and Alembic migration (one current row per garment: `content_version`, `status`, `features`, `uncertainties`, `model_info`, `updated_at`).
- AI client in `app/ai/` behind a protocol with a fake for tests and demos; `META_API_KEY` setting (startup fails if missing); timeouts, one retry, concurrency cap, Pydantic validation of structured output.
- Trigger: in the registration (06) and content-edit (07 PATCH step 5) transactions, upsert a `pending` row for the new version; after the response, run the job with FastAPI `BackgroundTasks`. On startup mark leftover `pending` rows `failed`.
- Job: first 3 photos plus owner category, title, description, measurements → `ClothingFeatures` (colors from the fixed vocabulary, pattern, material, style tags, visible details, size label) and uncertainties; save only if the garment is still at that version and not withdrawn; else discard. Failure → `failed`, log `ai_call_failed`.
- `Clothing.analysis` returned in register, list, detail, and edit responses.

**Frontend**
- C1 rows and C4 show "AI analyzing…" while `analysis.status = pending`, polling every 5 s until it changes.
- B3 and C4 show an "Estimated by AI" section (colors, pattern, material, tags, details, uncertainties as "Check in person") when `done`; nothing when `failed`.

**Out:** owner re-run of failed analyses, analysis review/editing (dropped C3), search (019).

## 3. References

| Document | Sections |
|---|---|
| [AI features](../ai-features-v1.md) | 1 Scope and principles; 2 Model integration, call policy, 2.1 Color vocabulary, 2.2 `ClothingAnalysis`, 2.3 `ClothingFeatures`; 3 Clothing analysis; 5–8 Guardrails, freshness, failures, logging/privacy; 10 Open decisions |
| [Backend AI integration rules](../../rules/dev/backend/ai-integration.md) | Isolation, timeouts/retries, semaphore, output responsibility, version check on save |
| [Database design](../database-design-v1.md) | 3.5 `clothing_analyses`; 5 Data flow; 7 AI persistence |
| [API 06](../api/06-register-read-clothing.md) | `Clothing.analysis`; 1 Response note on `pending` |
| [API 07](../api/07-edit-withdraw-clothing.md) | PATCH step 5 |
| [Tech stack](../../rules/dev/common/tech-stack.md) | `META_API_KEY`, secrets, startup failure on missing variables |
| [Error handling and logging](../../rules/dev/common/error-handling-logging.md), [backend logging](../../rules/dev/backend/logging.md) | Never log text or photo bytes; `ai_call_failed` |
| [Backend testing](../../rules/dev/backend/testing.md), [common testing](../../rules/dev/common/testing.md) | Fake model, no external calls in tests |
| [Frontend data fetching](../../rules/dev/frontend/data-fetching.md) | Polling row for `pending` analyses |
| [Screen flow](../../flows/screen-flow-v1.md) | 4.2 B3, 4.3 C1/C4 |

## 4. Existing Code

- `backend/app/core/config.py` — add `META_API_KEY` (and AI timeouts/concurrency settings).
- `backend/app/services/clothing.py` (`register`, edit from 017, `_build_response`), `backend/app/schemas/clothing.py` (`Clothing.analysis` is `None` today), `backend/app/models/`, `backend/alembic/versions/`.
- `backend/app/main.py` — `lifespan` context manager: add the stale-`pending` cleanup there.
- `backend/app/services/photo.py` — photos are stored as files at `photo_dir/<storage_location>`, so the job can read bytes for base64; `domain/photos.py` `photo_url` builds URLs from `APP_BASE_URL` (the frontend origin).
- Frontend: `lib/validation/clothing-response.ts` (parse `analysis`), C1/C4 from 017, B3 from 016.

## 5. Already Decided

- Background only; no client analysis endpoint; no review screen; owner fields are facts and never overwritten.
- No AI category; the owner's category is the source of truth.
- First 3 photos go to the model; fixed 14-color vocabulary.
- `BackgroundTasks` is an accepted shortcut (in-process, lost on restart).

## 6. Open Questions for Clarify / Plan

- **Image transport:** photo URLs go through the frontend origin (`/api/v1/photos/{id}` rewrite), which the model cannot reach in local development. Send base64 from storage, or require a public URL? (AI features §10; verify on day one.)
- Final timeout values after a latency check.

## 7. Spec Kit Run

**Specify input**

```text
018 Background AI clothing analysis (backend + frontend).
After each clothing registration or content edit, the backend upserts a pending analysis for the new contentVersion in the same transaction and, after responding, runs a FastAPI BackgroundTasks job that sends the first 3 photos and the owner's category, title, description, and measurements to the Meta model (muse-spark-1.3) and stores colors (fixed 14-color vocabulary), pattern, material estimate, style tags, visible details, size label, and uncertainties, only if the garment is still at that version. Failures set status failed; leftover pending rows become failed on startup. Clothing responses include analysis. AI client isolated behind a protocol with a fake for tests; META_API_KEY required.
Frontend: "AI analyzing..." on My items rows and detail while pending (5 s polling); item detail screens show an "Estimated by AI" section when done.
Sources: docs/plans/features/018-ai-clothing-analysis.md, docs/plans/ai-features-v1.md (1-3, 5-8, 10), docs/rules/dev/backend/ai-integration.md, docs/plans/database-design-v1.md (3.5, 5, 7), docs/plans/api/06-register-read-clothing.md, docs/plans/api/07-edit-withdraw-clothing.md.
```

**Plan research (explorer):** where to schedule background work after commit in the current service/router layering; existing settings validation pattern for required variables; test fixtures that would need a fake AI client.

**Day-one check:** before implementing the job, make one real call with a sample photo to confirm access, image input, structured output, and latency; record results in the plan.

## 8. Done When

- Registering or editing a garment returns immediately with `analysis.status = pending` and later shows `done` (or `failed`) without blocking any request.
- Old-version results are never saved as current; logs contain no owner text or photo data.
- Frontend shows the analyzing state and AI estimates with labels.
- Backend and frontend checks pass with the fake client; one documented real-model call.
