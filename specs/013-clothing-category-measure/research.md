# Research: Clothing Category, Title, and Measurements

**Feature**: `specs/013-clothing-category-measure` | **Date**: 2026-10-30

Base schema is 011 as amended by 012-backend (`fix/012-upload-photo-frontend-fixes` branch design):
`clothes.photo_id` removed, `photos` gains nullable `clothing_id`/`position`, registration takes
`photoIds[1..10]`, responses carry `photos[]`. This feature only adds category, title, and
measurements around that shape and never touches photo handling.

## Decisions

### R1: Measurement storage — 8 nullable REAL columns on `clothes`

- **Decision**: Add `measure_total_length` (shared by both groups), `measure_chest`,
  `measure_shoulder`, `measure_sleeve`, `measure_waist`, `measure_hem`, `measure_inseam`,
  `measure_thigh`, all nullable REAL. No new table, no JSON column.
- **Rationale**: Fixed small set (8 logical fields sharing `totalLength`, 8 physical columns); flat columns keep the
  existing `api → services → repositories → models` flow unchanged and stay queryable.
- **Alternatives considered**: JSON column (loses per-value numeric checks, complicates Pydantic
  mapping); separate `clothing_measurements` table (over-normalization for ≤8 optional scalars
  in a prototype).

### R2: Category enum values — lowercase English

- **Decision**: `ClothingCategory(StrEnum)` with `top`, `outer`, `bottom`, `other` in
  `backend/app/domain/enums.py`, plus a DB `CHECK (category IN (...))` following the `status`
  precedent in `backend/app/models/clothing.py`.
- **Rationale**: Matches existing enum style (`available`, `mine`); frontend maps to display labels.
- **Alternatives considered**: Uppercase codes — rejected, inconsistent with the codebase.

### R3: Pydantic modeling — one flat optional `Measurements` object + create-level validator

- **Decision**: `Measurements(ApiModel)` with all 8 fields `float | None = None`, each
  `gt=0, le=120`; `ClothingCreate` gains `title`, `category`, `measurements: Measurements | None = None`
  and a `model_validator` enforcing the category-group rules (FR-005/FR-006), raising field-level
  errors that map to `details.fields`.
- **Rationale**: Single schema keeps `details.fields` mapping simple (`measurements.sleeve` +
  `invalid`); partial input is natural (all fields optional).
- **Alternatives considered**: Per-category sub-schemas as a discriminated union — rejected:
  three schemas plus worse error mapping for the `other`-rejects-measurements case.

### R4: Empty measurements `{}` means no measurements

- **Decision**: Normalize `{}` (all fields `None`) to `None` in the validator; store all-NULL columns.
- **Rationale**: Required by the spec edge case; avoids distinguishing "empty object" from "absent".

### R5: Error mapping for group violations

- **Decision**: Known field outside the category group (e.g. `sleeve` on `bottom`) →
  `details.fields=[{"field":"measurements.sleeve","reason":"invalid"}]`; any field on `other` →
  `[{"field":"measurements","reason":"invalid"}]`; structurally unknown field inside measurements →
  existing `extra="forbid"` → `unknown_field`. No new error codes or reasons.
- **Rationale**: Reuses the shared `ValidationReason` set (`required`, `too_long`, `invalid`,
  `unknown_field`, `invalid_characters`); `api-contract.md` needs no change.

### R6: Title validation — trim + 1–100 chars + no control characters

- **Decision**: `title: str = Field(min_length=1, max_length=100)` with the existing `ApiModel`
  trim, plus the existing `reject_control_characters` helper from `backend/app/schemas/common.py`.
- **Rationale**: Same trim/length pattern as the 011 description; control characters are additionally
  rejected because titles render in single-line list rows (descriptions allow newlines per 011).
  No new code — the helper already exists.

### R7: Migration sequencing with 012-backend

- **Decision**: New Alembic revision with `down_revision` = 012's backend revision
  (the `photos.clothing_id`/`position` migration). 013 implementation starts only after 012-backend
  merges; this plan is written against the post-012 schema. Downgrade drops the added columns
  and the category CHECK.
- **Rationale**: 013 touches the same `clothes` table 012 rewrites (`photo_id` removal); writing the
  migration on the current base would guarantee a rebase conflict.

### R8: DB constraints stay minimal

- **Decision**: DB enforces only the category CHECK (plus non-null on title/category).
  Measurement ranges and group rules are application-level (Pydantic), following the 011 precedent
  where description length is app-only.
- **Rationale**: Keeps the migration trivial; SQLite REAL CHECKs add nothing the API tests do not cover.

### R9: Logging — add `title_length` and `category`, never text

- **Decision**: `clothing_registered` extras gain `title_length` (trimmed length) and `category`
  (low-cardinality enum, safe). Title/description text stays out of both formatters, as 011 does.
- **Rationale**: Preserves the SC-004 / api-contract no-PII-in-logs rule while keeping useful metrics.

### R10: Clothing Summary — docs only, no code schema

- **Decision**: The compact garment form embedded in later intent/proposal features gains `title`
  and `category` in documentation; no `ClothingSummary` schema is added to code.
- **Rationale**: 011 precedent ("Do not add a ClothingSummary schema"); no 011/013 operation returns it.

No NEEDS CLARIFICATION remains. Open numeric defaults (title 100 chars, 0–120 inches) are spec
assumptions carried into the contract; planning does not change them.
