# Contract delta: DELETE /api/v1/clothing/{clothing_id} (API 07) and analysis (018)

Request/response unchanged (`204`, same errors and replay rules).

New side effect: when an available garment is withdrawn, its analysis — if `pending` for the current `contentVersion` — becomes `failed` in the same transaction. Subsequent reads return `analysis.status = "failed"`, `features = null`.

Unchanged: replay on an already-withdrawn garment (also after closure) and rejected withdrawals (`409 EVENT_CLOSED`, `409 CLOTHING_ALREADY_CONFIRMED`, `403`, `404`) do not touch the analysis.

`analysis.modelInfo` numbers (`latencyMs`, `promptTokens`, `completionTokens`) are `number | null` per the common contract's null rule; clients must accept `null`.
