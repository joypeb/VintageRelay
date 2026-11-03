# Data Model: 019 AI Search

No database changes. All entities are transient (per request).

## SearchConditions (API, shared by both endpoints)

| Field | Type | Rules |
|---|---|---|
| `category` | `top` \| `outer` \| `bottom` \| `other` \| null | Hard filter |
| `colors` | string[] | Each in the 14-color vocabulary; duplicates removed |
| `measurements` | map name → `{ min, max }` | Name is a camelCase `Measurements` field; `0 < min <= max <= 120` (inches). Ranked search allows one side omitted |
| `unrecognized` | string[] | Interpretation only; non-empty phrases the model or validation could not map |

`conditionCount = len(colors) + len(measurements)`.

## SearchInterpretation (model output, internal)

`category: string | null`, `colors: string[]`, `measurements: [{ name, min, max }]`, `unrecognized: string[]`. Converted to `SearchConditions` by validation ([research R2](research.md#r2-raw-model-output-vs-api-searchconditions)).

## SearchResultItem

| Field | Type | Rule |
|---|---|---|
| `clothing` | `Clothing` | Same object as the Home list |
| `matchCount` | integer | +1 per requested color in a `done` analysis of the current `contentVersion`; +1 per range containing the garment's value (inclusive; missing never matches) |
| `missingMeasurements` | boolean | `true` when measurement conditions exist and the garment has none of the requested measurements |

## SearchResults

`items: SearchResultItem[]`, `conditionCount: integer`, `nextCursor: null`.

## Ordering

1. Candidates: same event, `available`, not the caller's (Home set, newest first).
2. Drop other categories when `category` is set.
3. Stable sort by `matchCount` desc, then `missingMeasurements` false before true; ties keep newest first.

## Existing entities read

- `Clothing` (measurement columns `measure_*`, `content_version`, `created_at`).
- `ClothingAnalysis` (one row per garment: `status`, `content_version`, `features.colors`).
