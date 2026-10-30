# Implementation Plan: Clothing Category, Title, and Measurements

**Branch**: `specs/013-clothing-category-measure` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-clothing-category-measure/spec.md`

## Summary

Extend clothing registration with a required category (`top|outer|bottom|other`), a required
trimmed title (1–100 chars, no control characters), and optional per-category measurements in
inches (tops: totalLength/chest/shoulder/sleeve; bottoms: totalLength/waist/hem/inseam/thigh;
`other`: none). One migration adds `title`, `category` (+CHECK), and 8 nullable REAL measurement
columns to `clothes`; `ClothingCreate`/`Clothing` gain the new fields with a category-group
validator; photo handling from 012 is untouched. No new dependencies, no new error codes.

## Technical Context

**Language/Version**: Existing Python 3.14 baseline (`backend/pyproject.toml`); no version changes.

**Primary Dependencies**: Existing FastAPI, SQLAlchemy 2.x, Pydantic v2, Alembic. No new dependencies.

**Storage**: Existing SQLite (WAL; `BEGIN` reads, `BEGIN IMMEDIATE` writes) plus one `clothes`
`ALTER TABLE` migration. Photos table and 012's `clothing_id`/`position` design unchanged.

**Testing**: pytest, FastAPI TestClient, real SQLite file per test under `tmp_path` plus tmp photo
dir, injected clock and ID generator.

**Target Platform**: Existing single-server backend with one Uvicorn worker.

**Project Type**: Web service; backend-only increment.

**Performance Goals**: No new target. Registration stays one write transaction; lists stay one
indexed query.

**Constraints**: Check order 422 → 401 → 404 (event) → 409 closed → 404 (photo) → 409 attached,
per 011/012. Identical 404 bodies. Reads allowed in closed events. Migration `down_revision`
must be 012's backend revision — 013 implementation starts only after 012-backend merges.

**Scale/Scope**: Three endpoints (request/response shape only), one migration, one new enum, one
new schema, zero frontend changes. Category list filtering is out of scope.

## Constitution Check

*GATE: Checked before research and re-evaluated after Phase 1 design.*

| Principle | Pre-research assessment | Post-design assessment |
|---|---|---|
| I. Exchange Integrity First | PASS: Category/title/measurements are descriptive only; event scope, photo attachment, and closure rules are untouched. | PASS: Design changes no permission, cycle, or consent rule; group validation is server-side. |
| II. Test-First | PASS: No application code is written during planning. | PASS: Each behavior (boundaries, group rejection, round-trip, logging) has a failing test before implementation in the cycles for `/speckit-tasks`. |
| III. Test Scope by Risk | PASS: Main risks are wrong-category measurements slipping through and breaking existing register/list/detail tests. | PASS: Rejection matrix, migration, OpenAPI, and logging tests target them; no coverage goal. |
| IV. Isolated, Deterministic Tests | PASS: Existing tmp-DB fixtures are reused. | PASS: Same fixtures; measurement values are fixed literals, no randomness or external services. |
| V. Simplicity | PASS: Flat columns, one validator, docs-only summary change; no filtering, no new tables. | PASS: No new layers; reuses `ApiModel`, `reject_control_characters`, existing reasons and error codes. |

**Governance outcome**: PASS. No violations to justify; Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/013-clothing-category-measure/
├── spec.md
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── clothing-category-measure.md   # Delta contract (011 yaml + 012 delta stay normative)
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── alembic/versions/<rev>_add_clothing_category_title_measurements.py
├── app/
│   ├── domain/
│   │   └── enums.py                 # Add ClothingCategory
│   ├── models/
│   │   └── clothing.py              # Add title, category, 8 measure columns + CHECK
│   ├── schemas/
│   │   └── clothing.py              # Add Measurements, extend ClothingCreate/Clothing
│   ├── services/
│   │   └── clothing.py              # Pass through + title_length/category log extras
│   └── repositories/
│       └── clothing.py              # Column changes only (no query change)
└── tests/
    ├── api/
    │   ├── test_register_clothing.py            # New fields shape, boundaries, round-trip
    │   ├── test_register_clothing_rejections.py # Title/category/measurements 422 matrix
    │   ├── test_list_clothing.py                # Seeded rows carry new fields
    │   ├── test_get_clothing.py                 # Detail shows new fields
    │   └── test_openapi_contract.py             # Extended schemas
    └── test_migrations.py                       # New columns + category CHECK + downgrade
```

**Structure Decision**: Follow `api → services → repositories → models` like 011. Photo code
(`photoIds` handling from 012) is not touched; registration validation order and response building
stay where 011/012 put them.

## Phase 0: Research

Consolidated in [research.md](research.md), decisions R1–R10. The non-obvious findings:
(R3) one flat optional `Measurements` object with a create-level group validator maps most simply
to `details.fields`; (R7) the migration must be written on 012's backend revision, so 013
implementation waits for the 012-backend merge; (R6) titles additionally reject control characters
via the existing helper because they render in single-line list rows. No unresolved technical
clarifications.

## Phase 1: Design

### Register flow (changed validation only)

1. FastAPI validates `ClothingCreate` (trimmed title 1–100, category enum, measurements group and
   range rules, `extra=forbid` everywhere) → 422/400.
2. Handler calls `get_current_participant` inside the handler (011/012 R2 pattern, unchanged).
3. `ClothingService.register` runs the unchanged 012 checks (event → active → photos owned and
   unattached → attach all or none), inserting `title`, `category`, and measurement columns.
4. After commit: `clothing_registered` log with `title_length` and `category` added; response
   includes the new fields (R9).

### List and detail flows

Unchanged queries; `_build_response` maps the new columns into `Clothing`. Seeded-row tests gain
title/category/measurements fixtures.

### Interface and storage

[clothing-category-measure.md](contracts/clothing-category-measure.md) defines the delta on top of
011's OpenAPI contract as amended by 012. [data-model.md](data-model.md) defines the `clothes`
columns, the read model, and the validation transitions.

### Acceptance allocation

| Requirements / outcomes | Evidence | Limitation |
|---|---|---|
| FR-001–FR-003, FR-009; SC-001 | Register API test: exact extended `Clothing` shape, trimmed title, enum category, round-trip measurements (US1/US2/US4) | Numeric defaults (100 chars, 0–120 in) are spec assumptions |
| FR-004–FR-008, FR-011; SC-002 | Rejection matrix: missing/unknown category, title boundaries + control chars, out-of-group fields, `other` + measurements, bad values — each `422` with no row | None |
| FR-010; SC-004 | caplog: `clothing_registered` with exact extras incl. `title_length`/`category`, no title/description text in either formatter | None |
| FR-012; SC-003 | List/detail tests: new fields on every item, null-vs-zero distinction | None |

## Implementation Notes for `/speckit-tasks`

Dependency-ordered TDD cycles (test first, see it fail, implement, all checks green, commit):

1. **Migration and model**: migration test (columns, category CHECK, downgrade) first.
2. **Schemas + service validation**: register success/round-trip tests, rejection matrix, logging test; then implementation.
3. **List/detail**: extend seeded-row tests with new fields; then `_build_response` mapping.
4. **Polish**: OpenAPI test, quickstart evidence, all checks.

```bash
cd backend
uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest
```

## Complexity Tracking

No constitution violations or additional architectural layers to justify.
