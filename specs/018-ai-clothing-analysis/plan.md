# Implementation Plan: 018 Background AI Clothing Analysis

**Branch**: `feature/018-ai-clothing-analysis` | **Date**: 2026-11-04 | **Spec**: specs/018-ai-clothing-analysis/spec.md

**Input**: specs/018-ai-clothing-analysis/spec.md

## Summary

Add `clothing_analyses` table + migration; build `backend/app/ai/` (protocol, httpx Chat Completions client for `muse-spark-1.3` with base64 first-3-photos + structured output, fake); upsert `pending` in register/edit transactions and schedule `BackgroundTasks` jobs from routers; version-checked save with first-`done`-wins; startup marks leftover `pending` as `failed`; include `analysis` in Clothing responses; frontend polling + Estimated section. One real-model call recorded here (day-one check).

## Technical Context

**Language/Version**: Python 3.12, FastAPI, SQLAlchemy, SQLite; TypeScript 6, Next.js 16.4

**Primary Dependencies**: httpx 0.28 (model calls), pydantic-settings SecretStr, TanStack Query 5, zod 4

**Storage**: new `clothing_analyses` table (one current row per garment)

**Testing**: backend `uv run pytest` with fake client (no external calls); frontend `vitest`; one manual real-model call (documented below, key never logged)

**Target Platform**: Mobile web; backend server-side model calls only

**Project Type**: Web application (backend + frontend)

**Performance Goals**: Responses never wait for the model; analysis job worst case ~63 s wall (30 s timeout + 1 s wait + one retry + 2 s slot wait); ≤4 concurrent AI calls

**Constraints**: English UI; SecretStr key handling; no photo bytes/owner text in logs; BackgroundTasks in-process (startup cleanup covers loss)

**Scale/Scope**: Tens of garments per event; ≤3 photos per analysis call

## Day-One Real-Model Check (recorded 2026-11-04)

- Surface probe (no key): `POST https://api.meta.ai/v1/chat/completions` with dummy bearer → `{"code":"invalid_api_key",...,"type":"authentication_error"}`. Route live at auth stage only — this proves base-URL liveness, not image input, `json_schema` compliance, or latency. The authenticated image + structured-output call (T002/T018 gate, SC-005) is still required with the operator key.
- Authenticated image + structured-output call: BLOCKED in this environment (no `AI_API_KEY` present; env never dumped per operator instruction). T018 gate moves to the operator run: set `AI_API_KEY`, register a photo garment, confirm pending→done with vocab colors, record latency here.

## Constitution Check

- **I. Exchange Integrity**: No intents/proposals/consent touched. AI output never overwrites owner fields; only `clothing_analyses` estimated columns. Pass.
- **II. Test-First**: Failing tests before impl (tasks.md). Fake client default in tests. Pass.
- **III. Test Scope**: Unit for schemas/validation/save-rules; API for pending/failed flows; frontend unit for parse/poll/section; one manual real call. Pass.
- **IV. Isolated, Deterministic**: httpx mocked/faked in tests; no network in suite. Pass.
- **V. Simplicity**: httpx (existing dep), no SDK; single table; BackgroundTasks (accepted shortcut). Pass.

Re-check after design: no new endpoints; no contract break (additive `analysis` field); no violations.

## Project Structure

### Documentation

```text
specs/018-ai-clothing-analysis/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── clothing-analysis.md
└── tasks.md
```

### Source Code

```text
backend/app/
├── ai/
│   ├── __init__.py
│   ├── protocols.py      # ClothingAnalyzer protocol (analyze(request) -> result)
│   ├── schemas.py        # AiAnalysisRequest/Result (Pydantic, vocab validation)
│   ├── client.py         # HttpxChatCompletionsClient (timeout/retry/semaphore)
│   ├── deps.py           # get_analyzer Depends provider (real from settings; tests override with fake)
│   └── fake.py           # FakeAnalyzer (scripted done/failed/invalid + threading.Event gate)
├── models/clothing_analysis.py  # NEW ORM (single current row per garment)
├── repositories/clothing_analysis.py  # NEW replace-pending/get-current/conditional-save/mark_failed
├── services/clothing_analysis.py      # NEW version-checked job (rowcount first-wins)
├── services/clothing.py  # EXTEND register/edit replace-pending + _build_response analysis
├── api/routers/clothing.py + events.py  # EXTEND BackgroundTasks add_task(service job) — never import app/ai/client.py
├── core/config.py        # ADD ai_api_key (SecretStr|None) + AI settings (no fixture changes needed)
└── main.py               # lifespan: cleanup BEFORE injected-db early return; key assertion on production path only (db is None)

backend/alembic/versions/  # NEW migration
backend/tests/ai/ + api/   # NEW tests

frontend/src/
├── lib/validation/clothing-response.ts  # EXTEND analysis schema + parse
├── types/clothing.ts      # EXTEND analysis type
├── lib/api/clothing.ts    # EXTEND refetchInterval 5 s on pending
├── components/clothing/   # EXTEND C1/C4 analyzing, B3/C4 Estimated section
```

**Structure Decision**: AI code isolated in `app/ai/` per ai-integration.md; services own transactions; routers own BackgroundTasks scheduling.

## Complexity Tracking

No violations. BackgroundTasks loss-on-restart accepted with startup cleanup (documented shortcut).
