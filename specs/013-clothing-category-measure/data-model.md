# Data Model: Clothing Category, Title, and Measurements

Amends 011 (`specs/011-register-read-clothing/data-model.md`) as already amended by 012-backend.
Photo handling (`photos.clothing_id`/`position`, `photoIds[1..10]`, `photos[]` responses) is unchanged.

## Storage changes

One Alembic revision (after 012's backend revision) alters `clothes`. No new table, no existing
column changes.

### `clothes` (added columns)

| Field | Type | Rule |
|---|---|---|
| `title` | String(100), non-null | Trimmed owner-written title, 1–100 characters |
| `category` | String(16), non-null | One of `top\|outer\|bottom\|other`, DB CHECK |
| `measure_total_length` | Float, nullable | Inches, shared by tops and bottoms groups |
| `measure_chest` | Float, nullable | Inches, tops group (`top`, `outer`) only |
| `measure_shoulder` | Float, nullable | Inches, tops group only |
| `measure_sleeve` | Float, nullable | Inches, tops group only |
| `measure_waist` | Float, nullable | Inches, `bottom` only |
| `measure_hem` | Float, nullable | Inches, `bottom` only |
| `measure_inseam` | Float, nullable | Inches, `bottom` only |
| `measure_thigh` | Float, nullable | Inches, `bottom` only |

`ClothingCategory` (`top`, `outer`, `bottom`, `other`) is added to `backend/app/domain/enums.py`.
The category CHECK mirrors the existing status CHECK. Measurement ranges (each `> 0`, `<= 120`)
and category-group rules are enforced by Pydantic, not the DB (R8). No new indexes.

## Read model: `Clothing` (added fields)

| Field | Source |
|---|---|
| `title` | `clothes.title` |
| `category` | `clothes.category` |
| `measurements` | Object with the 8 logical fields (`totalLength`, `chest`, `shoulder`, `sleeve`, `waist`, `hem`, `inseam`, `thigh`), each a number or null; the whole object is null when no measurements were given. Field presence follows the category group; unentered dimensions are null, never zero. |

List response stays `{ "items": Clothing[], "nextCursor": null }`. Visibility, ordering, status,
content version, and analysis rules are unchanged from 011/012.

## Registration transitions (body-validation row only; order unchanged)

| Precondition | Result |
|---|---|
| Missing/whitespace-only/over-100-char title; title with control characters | `422 VALIDATION_ERROR` |
| Missing category or value outside `top\|outer\|bottom\|other` | `422 VALIDATION_ERROR` |
| Measurement field outside the category group, or any measurements on `other` | `422 VALIDATION_ERROR` |
| Measurement value non-numeric, `<= 0`, or `> 120` | `422 VALIDATION_ERROR` |
| Unknown field anywhere including inside measurements | `422 VALIDATION_ERROR` (`unknown_field`) |
| Otherwise (photo/event rules per 012) | `201 Clothing` + `clothing_registered` log with `title_length` and `category` added |

Reads never change state and remain allowed in closed events.
