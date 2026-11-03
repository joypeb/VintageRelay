# Data Model: 019

No schema changes.

## clothing_analyses (from 018) — new transition

| From | Trigger | To |
|---|---|---|
| `pending` (current version) | Owner withdraws an available garment (same transaction) | `failed` (`features` null, `updated_at` = withdraw time) |
| `done` / `failed` | Withdraw | unchanged |
| any | Withdraw replay (already withdrawn) or rejected withdraw (closed/confirmed) | unchanged |

## Analysis output contract (model-facing)

All `AnalysisResult` properties are required in the JSON schema (`size_label` nullable but required). Nested `Uncertainty` already required both fields.

## Frontend `ClothingAnalysisModelInfo`

`latencyMs`, `promptTokens`, `completionTokens`: `number | null`, may also be absent.
