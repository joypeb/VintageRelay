# Implementation Plan: Register/Read Clothing (Backend)

**Branch**: `speckit-specify-register-read-clothing` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-register-read-clothing/spec.md`

## Summary

Add `POST /api/v1/events/{event_id}/clothing` (register a garment from the caller's unattached photo plus a trimmed 1–1,000 character description), `GET /api/v1/events/{event_id}/clothing` (ownership/status filters, withdrawn visibility, newest first), and `GET /api/v1/clothing/{clothing_id}` (any garment in the caller's event). One migration creates `clothes` with a unique `photo_id`; registration is a single row insert in a `BEGIN IMMEDIATE` transaction, with the unique constraint as the race guard. Auth runs inside the create/list handlers so validation (422) precedes 401, per the README check order. The organizer's `availableClothingCount` stops being a placeholder. `analysis` is always `null` until the AI feature. No new dependencies.

## Technical Context

**Language/Version**: Existing Python 3.14 baseline (`backend/pyproject.toml`); no version changes.

**Primary Dependencies**: Existing FastAPI, SQLAlchemy 2.x, Pydantic v2, Alembic. No new dependencies.

**Storage**: Existing SQLite (WAL; read `BEGIN`, write `BEGIN IMMEDIATE`) plus one new `clothes` table and migration. Photos table and photo files unchanged.

**Testing**: pytest, FastAPI TestClient, real SQLite file per test under `tmp_path` plus tmp photo dir, injected clock and ID generator, `monkeypatch` race injection, `caplog`.

**Target Platform**: Existing single-server backend with one Uvicorn worker.

**Project Type**: Web service; backend-only increment.

**Performance Goals**: No new target. Lists are unpaginated; one indexed query per list.

**Constraints**: Check order 422 → 401 → 404 (event) → 409 closed → 404 (photo) → 409 attached. Identical 404 bodies for every hidden-existence case. Reads allowed in closed events. Preserve create/read/close/join/upload behavior.

**Scale/Scope**: Three endpoints, one migration, one table, one new error class, zero frontend changes. Participant/garment limits remain undecided.

## Constitution Check

*GATE: Checked before research and re-evaluated after Phase 1 design.*

| Principle | Pre-research assessment | Post-design assessment |
|---|---|---|
| I. Exchange Integrity First | PASS: One-photo-per-garment, event scope, and closed-event rejection are server rules. | PASS: Unique `photo_id` plus serialized write transaction make duplicate garments impossible; closure and registration share the transaction. |
| II. Test-First | PASS: No application code is written during planning. | PASS: Each behavior (ordering, 404 parity, race, visibility, stats, logging) has a failing test before implementation in the cycles below. |
| III. Test Scope by Risk | PASS: Auth scope, photo ownership, duplicate attachment, and withdrawn visibility are the main risks. | PASS: API, service, migration, logging, and OpenAPI tests target them; no coverage goal. |
| IV. Isolated, Deterministic Tests | PASS: Existing fixtures give tmp SQLite and photo dir. | PASS: Injected clock/IDs and an `id` tie-break make list order deterministic; no external services. |
| V. Simplicity | PASS: No analysis table, no `ClothingSummary`, no pagination, no limits. | PASS: One table, one service, reused `ApiModel` trimming and existing auth helper. |

**Governance outcome**: PASS. The clarify decision (trim, then validate and store trimmed) is recorded in the spec; no unresolved clarifications.

## Project Structure

### Documentation (this feature)

```text
specs/011-register-read-clothing/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/register-read-clothing.openapi.yaml
├── checklists/requirements.md
└── tasks.md                         # Created by /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── alembic/versions/<rev>_create_clothes_table.py
├── app/
│   ├── api/
│   │   ├── deps.py                  # Extract token lookup; add TokenParticipant
│   │   └── routers/
│   │       ├── events.py            # Add POST/GET /{event_id}/clothing (auth inside handler)
│   │       └── clothing.py          # New GET /clothing/{clothing_id}
│   ├── domain/
│   │   ├── enums.py                 # ClothingStatus, Ownership
│   │   ├── errors.py                # PhotoAlreadyAttachedError
│   │   └── photos.py                # photo_url(settings.app_base_url, photo_id) extracted from PhotoService
│   ├── models/clothing.py           # New Clothing model
│   ├── repositories/clothing.py     # add, get_in_event, list_visible, count_available
│   ├── schemas/clothing.py          # ClothingCreate, Clothing, ClothingList
│   ├── services/
│   │   ├── clothing.py              # register, list, get
│   │   ├── event.py                 # availableClothingCount from clothes
│   │   └── photo.py                 # Use photo_url helper
│   └── main.py                      # Include clothing router
└── tests/
    ├── api/
    │   ├── test_register_clothing.py            # Success, stats, boundaries
    │   ├── test_register_clothing_rejections.py # 422-before-401, 401/404 parity, 409s
    │   ├── test_list_clothing.py                # Ownership × status × visibility, order, 422
    │   ├── test_get_clothing.py                 # Own/other/withdrawn/foreign/missing
    │   └── test_openapi_contract.py             # Extend for three operations
    ├── services/test_register_clothing.py       # Race → 409, log extras
    └── test_migrations.py                       # clothes table + unique photo_id
```

**Structure Decision**: Follow `api → services → repositories → models`. Event-scoped collection routes go in `events.py`; the top-level detail route gets its own router, like `photos.py`.

## Phase 0: Research

Consolidated in [research.md](research.md), decisions R1–R13. The key non-obvious finding (R2): on this FastAPI version, a raising auth dependency runs before body and query validation, so create/list call `get_current_participant` inside the handler to keep 422 before 401. No unresolved technical clarifications.

## Phase 1: Design

### Register flow

1. FastAPI validates `ClothingCreate` (trimmed, 1–1,000, `extra=forbid`) → 422/400.
2. Handler calls `get_current_participant(event_id, db, credentials)` → 401 / 404.
3. `ClothingService.register(event_id, me, body)` in `Db.write()`: event exists (404) → active (409 `EVENT_CLOSED`) → photo in event and uploaded by `me` (404) → not referenced by any garment (409 `PHOTO_ALREADY_ATTACHED`) → insert; `IntegrityError` on `photo_id` → same 409.
4. After commit: `clothing_registered` log; return `Clothing` (201).

### List and detail flows

- List: validated query → in-handler auth → `Db.read()` single query with ownership, visibility (`owner_id == me OR status != withdrawn`), optional status filter, `ORDER BY created_at DESC, id DESC`, joined with participants and events for owner fields.
- Detail: `TokenParticipant` (401) → garment where `id = ? AND event_id = me.event_id` else 404.

### Interface and storage

[register-read-clothing.openapi.yaml](contracts/register-read-clothing.openapi.yaml) defines the three operations. [data-model.md](data-model.md) defines `clothes`, the read model, visibility, and transitions.

### Acceptance allocation

| Requirements / outcomes | Evidence | Limitation |
|---|---|---|
| FR-001, FR-002, FR-013; SC-001 | Register API test: exact `Clothing` shape, trimmed description, photo URL equals upload URL (T009); appears in both participants' lists (T015 end-to-end) | `analysis` always null until AI feature |
| FR-003, FR-004; SC-003 | Exact repeat → 409; race injection between check and insert → 409, one row | Race proven by injection, not real threads |
| FR-005, FR-008; SC-004 | 404 parity: missing/other-event/other-uploader photo, missing/malformed/foreign event, other-event garment | None |
| FR-006 | Boundaries 1/1000 accepted, 0/1001/space-only → 422 `required`/`too_long`; 422 returned even without a token | None |
| FR-007 | Closed → 409 before photo checks; list/detail 200 after close | None |
| FR-009, FR-010, FR-011; SC-005 | List matrix: ownership × status × withdrawn, order, other-event isolation, empty list, unknown enum 422 | Withdrawn rows set directly in tests until feature 07 |
| FR-012 | Detail returns others' withdrawn garments | None |
| FR-014 | Organizer `stats.availableClothingCount` after registration | Non-organizers get `stats: null` (existing rule) |
| FR-015; SC-006 | caplog: one `clothing_registered` with exact extras, no description text | None |

## Implementation Notes for `/speckit-tasks`

Dependency-ordered TDD cycles (test first, see it fail, implement, all checks green, commit):

1. **Foundation**: enums, `PhotoAlreadyAttachedError`, `photo_url` extraction (existing photo tests stay green), token-lookup extraction in `deps.py`.
2. **Migration and model**: migration test (`clothes`, unique `photo_id`) first.
3. **US1 + US2 register**: success, stats count, logging, rejection matrix, race; then implementation.
4. **US3 list**: full matrix; then implementation.
5. **US4 detail**: then implementation.
6. **Polish**: OpenAPI test, quickstart evidence, all checks.

```bash
cd backend
uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

## Complexity Tracking

No constitution violations or additional architectural layers to justify.
