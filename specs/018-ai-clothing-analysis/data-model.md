# Data Model: 018

`clothing_analyses` (new table, one current row per garment):

| Column | Type | Notes |
|---|---|---|
| `id` | string PK | uuid |
| `clothing_id` | string FK → clothes.id, UNIQUE | one current row |
| `content_version` | integer | analyzed version |
| `status` | enum string | `pending`, `done`, `failed`, `stale` |
| `features` | JSON null | `{colors[], pattern, materialEstimate, styleTags[], visibleDetails[], sizeLabel}` or null unless `done` |
| `uncertainties` | JSON | `[{aspect, message}]`, `[]` if none |
| `model_info` | JSON | `{model_id, latency_ms?, prompt_tokens?, completion_tokens?}` |
| `updated_at` | datetime | last status change |

Flows:
- Register/edit (new v): replace the current row with `pending/v` (single row; the previous result is not retained — `stale` is a reserved enum value, never emitted in this slice; API 07's "mark stale, upsert pending" maps to replace in this single-row design).
- Job save: one conditional write (`UPDATE ... WHERE clothing_id=? AND content_version=? AND status!='done'`, check `rowcount`): withdrawn/version-changed/already-`done` → 0 rows → discard; else write `done`.
- Withdraw: does not touch the analysis row; convergence via job-discard or startup cleanup.
- Startup: all `pending` → `failed` (runs in both lifespan paths, before the injected-`db` early return).

No changes to `clothes`/`photos` schemas. `Clothing.analysis` API shape per ai-features 2.2.
