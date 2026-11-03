# Feature Specification: 018 Background AI Clothing Analysis

**Feature Branch**: `feature/018-ai-clothing-analysis`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "018 Background AI clothing analysis (backend + frontend). After each clothing registration or content edit, the backend upserts a pending analysis for the new contentVersion in the same transaction and, after responding, runs a FastAPI BackgroundTasks job that sends the first 3 photos and the owner's category, title, description, and measurements to the Meta model (muse-spark-1.3) and stores colors (fixed 14-color vocabulary), pattern, material estimate, style tags, visible details, size label, and uncertainties, only if the garment is still at that version. Failures set status failed; leftover pending rows become failed on startup. Clothing responses include analysis. AI client isolated behind a protocol with a fake for tests; AI_API_KEY required. Frontend: 'AI analyzing...' on My items rows and detail while pending (5 s polling); item detail screens show an 'Estimated by AI' section when done. Sources: docs/plans/features/018-ai-clothing-analysis.md, docs/plans/ai-features-v1.md (1-3, 5-8, 10), docs/rules/dev/backend/ai-integration.md, docs/plans/database-design-v1.md (3.5, 5, 7), docs/plans/api/06-register-read-clothing.md, docs/plans/api/07-edit-withdraw-clothing.md."

## Clarifications

### Session 2026-11-04 (orchestrator decisions)

- Q: Image transport — photo URLs via frontend origin vs base64? → A: base64 data URLs from stored files. Rationale: model cannot reach local dev frontend origin; docs open question explicitly lists base64 as the alternative; photos already stored as files at `photo_dir/<storage_location>` so bytes are local. No new dependency.
- Q: Which Meta API surface? → A: Chat Completions `POST /v1/chat/completions` with `response_format json_schema`, model `muse-spark-1.3` (standard, not contributor). Rationale: OpenAI-compatible, documented structured-output + image_url support, plain httpx call with no new SDK dependency.
- Q: Env var name — `META_API_KEY` (docs) vs `AI_API_KEY` (backend env)? → A: `AI_API_KEY`, per operator instruction. `Settings.ai_api_key` is optional (`None` default); startup fails only on the production path without a key. Docs mentioning `META_API_KEY` updated in the same PR (T019).
- Q: Timeouts for day one? → A: analysis 30 s total (connect 5 s), 1 retry on timeout/5xx/429, semaphore cap 4 with 2 s slot wait. Rationale: matches proposed call policy; interpretation timeouts belong to 019.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registered garment gets AI estimates in the background (Priority: P1)

A participant registers a garment and immediately sees it with "AI analyzing…" without waiting. Within seconds the detail shows an "Estimated by AI" section (colors, pattern, material, tags, details, size label) plus "Check in person" uncertainties.

**Why this priority**: Core value of this feature; registration must never block on the model.

**Independent Test**: Register with photos, assert response `analysis.status = pending`, then poll detail until `done` (fake client in tests; one documented real-model call manually).

**Acceptance Scenarios**:

1. **Given** a garment is registered, **When** the response returns, **Then** `analysis.status = pending` for `contentVersion = 1` and the request did not wait for the model.
2. **Given** the analysis job completes, **When** the detail is read, **Then** `analysis.status = done` with colors from the fixed vocabulary, pattern/material/tags/details/size, and uncertainties.
3. **Given** the model output violates the schema, **When** validation fails, **Then** one retry happens, then `status = failed` with no partial features saved.

---

### User Story 2 - Editing starts a fresh analysis, old results never resurface (Priority: P1)

A participant edits title/photos and gets a new "AI analyzing…" for the new version; an in-flight old-version result never overwrites the new row.

**Why this priority**: Stale estimates presented as current would mislead exchanges and search.

**Independent Test**: Edit a garment (bump version), complete the old-version job late, assert current row stays at the new version.

**Acceptance Scenarios**:

1. **Given** an edit increments `contentVersion` to v+1, **When** the response returns, **Then** the current row is replaced with `pending` for v+1 (single current row per garment; the old result is not retained as `stale` in this slice).
2. **Given** a job for version v finishes after the garment moved to v+1, **When** it tries to save, **Then** the result is discarded and the current row is untouched.
3. **Given** the garment was withdrawn before the job saves, **When** it tries to save, **Then** the result is discarded.

---

### User Story 3 - Failures hide estimates and never block (Priority: P2)

When the model fails (after retry) or the server restarts mid-analysis, the garment stays usable with no estimates; leftover `pending` rows become `failed` on startup.

**Why this priority**: AI is optional; flows must work with manual data only.

**Independent Test**: Force model failure (fake raising), restart with pending rows, assert `failed` and no estimates shown.

**Acceptance Scenarios**:

1. **Given** the model fails twice, **When** the job ends, **Then** `status = failed`, `features = null`, and an `ai_call_failed` warning is logged without photo bytes or owner text.
2. **Given** the server starts with leftover `pending` rows, **When** lifespan runs, **Then** they are marked `failed`.
3. **Given** saving requires the version to match and no `done` row exists yet for it, **When** two jobs race for the same version, **Then** the first `done` wins and the second is discarded.

---

### User Story 4 - Owners see analyzing state and estimates (Priority: P2)

My items rows and the detail show "AI analyzing…" while `pending` (polling every 5 s until it changes); the detail shows the "Estimated by AI" section when `done` and nothing when `failed`.

**Why this priority**: User-visible half of the feature; keeps owners informed without blocking.

**Independent Test**: Seed pending/done/failed states, open C1/C4/B3, assert polling, section, and empty-failed rendering.

**Acceptance Scenarios**:

1. **Given** `analysis.status = pending`, **When** C1/C4 renders, **Then** "AI analyzing…" shows and refetches every 5 s until status changes.
2. **Given** `status = done`, **When** B3/C4 renders, **Then** an "Estimated by AI" section shows colors, pattern, material, tags, details, size label, and uncertainties as "Check in person".
3. **Given** `status = failed` or `null`, **When** the detail renders, **Then** no AI section appears and no error blocks the screen.

---

### Edge Cases

- What happens when the event closes while analysis runs? Saving still proceeds (closure does not block); `EVENT_CLOSED` only guards mutations.
- What happens when photo bytes are missing on disk? Job treats as failure (`failed`), logs without bytes.
- What happens when the model returns colors outside the vocabulary? Server drops them (validation); empty colors allowed.
- What happens when the model returns >8 tags/details or >200-char messages? Truncate to limits (drop empties).
- What happens when no `AI_API_KEY` is set? Startup fails fast with a clear error; tests use the fake client and never require the key.
- What happens when the semaphore has no free slot in 2 s? Job marks `failed` immediately (no queue).
- What happens when the same version already has a `done` row? Later results discarded (first wins, single conditional write).
- What happens when the garment is withdrawn while analysis is pending? Amended by 019: withdraw marks a still-`pending` analysis `failed` in the same transaction; a late job result is discarded (withdrawn → discard). Rows withdrawn before 019 converge via startup cleanup.
- Transport, photo sizing, and timeout values in this slice (base64, first 3 photos unresized, 30 s / 1 retry / semaphore 4 / 2 s wait) are provisional pending day-one latency measurement (T002/T018), not final answers to the §10 open decisions.

## Requirements *(mandatory)*

### Functional Requirements

**Backend**

- **FR-001**: `Settings` MUST carry `ai_api_key: SecretStr | None = None` (env `AI_API_KEY`); startup MUST fail fast with a clear error when the production path (`db is None`, real server) has no key; the injected-`db` test path MUST NOT require a key. Tests MUST use the fake client and never need the key.
- **FR-002**: Registration (06) and content-edit (07) transactions MUST upsert a `pending` analysis row for the new `contentVersion` in the same transaction; responses MUST include `analysis.status = pending` without waiting for the model.
- **FR-003**: After commit, a FastAPI `BackgroundTasks` job MUST run the analysis outside any DB transaction (read version → call model → save in a new write transaction).
- **FR-004**: The job MUST send at most the first 3 photos (base64 data URLs with MIME) plus owner category, title, description, measurements to `POST {base}/chat/completions` (base default `https://api.meta.ai/v1`), model `muse-spark-1.3`, `temperature 0.2`, `response_format json_schema`, timeout 30 s (connect 5 s), 1 retry on timeout/5xx/429 only.
- **FR-005**: Responses MUST be validated with Pydantic (`ClothingFeatures` + uncertainties); output that fails structural validation (missing keys, wrong types, extra keys) counts as failure with one retry, then `failed`. Field-level issues clamp instead of failing: unknown colors dropped (empty `colors` allowed with uncertainties noting it), tags/details truncated to 8, messages truncated to 200 chars, empty strings dropped.
- **FR-006**: Save MUST recheck atomically in one write transaction with a single conditional write (save only where current version still equals v and no `done` row already holds this version; check affected-row count): discard if withdrawn or version changed; discard if a `done` result already exists for the version (first wins); else save features/uncertainties/model_info/`done`.
- **FR-007**: Model failure after retry MUST set `failed` (only if still at that version) and log `WARNING ai_call_failed` with task/reason/latency (no key/photo bytes/owner text/search text/full request/response; lengths only).
- **FR-008**: Startup (lifespan) MUST mark leftover `pending` rows `failed`.
- **FR-009**: `Clothing.analysis` MUST be returned in register (06), list, detail, and edit responses (`null` if never started). Statuses emitted in this slice: `pending`, `done`, `failed`; `stale` is reserved (single current row is replaced on version bump, never kept as stale) for forward compatibility. API 07's "mark stale, upsert pending" maps to replace in this single-row design.
- **FR-010**: AI client MUST live only in `backend/app/ai/` behind a `ClothingAnalyzer` protocol; routers MUST only `add_task` a service job method and never import/call `app/ai/client.py`. The analyzer is provided to routers via a FastAPI `Depends` provider (production builds the real client from settings; tests override with the fake via `dependency_overrides`). Fake for tests/demos; no AI calls from repositories or domain; one shared module-level semaphore (fixed cap 4, matching this rule's default; `ai-analysis` slice does not resize it from settings), slot wait 2 s (settings).
- **FR-011**: Prompts MUST wrap owner text as quoted data, instruct to ignore embedded instructions, describe only visible/stated facts, use only the fixed color vocabulary, never infer size without a label, and put unverifiable items into uncertainties; no price/authenticity/fit verdict fields exist.

**Frontend**

- **FR-012**: C1 rows and C4 MUST show "AI analyzing…" while `analysis.status = pending`, polling every 5 s until it changes (no polling for `done`/`failed`/`null`).
- **FR-013**: B3 and C4 MUST show an "Estimated by AI" section when `done` (colors, pattern, material, tags, details, size label; uncertainties as "Check in person"); MUST show nothing AI-related when `failed`/`null`.
- **FR-014**: All AI copy MUST be in English with estimate labeling; closed events keep AI states readable.

### Key Entities

- **Analysis row**: one current row per garment (`clothing_id`, `content_version`, `status`, `features`, `uncertainties`, `model_info`, `updated_at`).
- **AI client**: protocol + httpx implementation + fake; request (photos+fields) → validated `ClothingFeatures`.
- **Estimated section**: UI block rendering `done` features with estimate labels and check-in-person notes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Register/edit responses return immediately with `pending` and never wait for the model.
- **SC-002**: Old-version or withdrawn-garment results are never saved as current; concurrent same-version races keep the first `done`.
- **SC-003**: Failures and restarts converge to `failed` with no estimates shown and no blocked flows; logs contain no secrets or content text.
- **SC-004**: C1/C4 show analyzing state with 5 s polling; B3/C4 show labeled estimates only when `done`.
- **SC-005**: Backend checks pass with the fake client; one documented real-model call (image + structured output + latency) recorded in the plan.

## Assumptions

- Meta Model API Chat Completions is reachable with the operator key; base URL configurable (default `https://api.meta.ai/v1`).
- Photos sent as base64 (JPEG/PNG/GIF/WebP stored files, first 3); no resizing in this slice.
- `BackgroundTasks` in-process loss on restart accepted (startup cleanup covers stragglers); upgrade to a queue if analyses go missing.
- Interface language is English; manual verification at 360–430 px with one real-model screenshot/note.
