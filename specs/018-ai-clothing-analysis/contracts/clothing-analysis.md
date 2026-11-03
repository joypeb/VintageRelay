# Contract: Clothing.analysis (additive)

No new endpoints. `Clothing` (06 schema) gains `analysis: ClothingAnalysis | null`:

| Field | Type |
|---|---|
| `contentVersion` | integer |
| `status` | `pending` \| `done` \| `failed` (`stale` reserved, never emitted in 018) |
| `features` | `{colors[0..3 vocab], pattern, materialEstimate, styleTags[≤8], visibleDetails[≤8], sizeLabel} \| null` (null unless `done`) |
| `uncertainties` | `[{aspect: condition\|size\|fit\|material\|logo\|color\|other, message ≤200 chars}]` |
| `modelInfo` | `{modelId, latencyMs?, promptTokens?, completionTokens?} \| null` |
| `updatedAt` | string datetime |

Present in register, list, detail, and edit responses. `null` if never started. Frontend polls while `pending` (5 s). Keys camelCase per api-contract.
