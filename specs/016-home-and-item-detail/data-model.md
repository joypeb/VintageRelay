# Data Model: 016 Home Grid and Item Detail

**Feature**: specs/016-home-and-item-detail/spec.md · **Plan**: specs/016-home-and-item-detail/plan.md

Frontend-only feature: no backend or schema changes. This model documents the server shapes the UI consumes (from the agreed clothing API, `docs/plans/api/06-register-read-clothing.md`) and the client-side view models derived from them.

## Entities

### Clothing (consumed, read-only)

Full `Clothing` as returned by `GET /api/v1/events/{event_id}/clothing` list items and `GET /api/v1/clothing/{clothing_id}` detail. Fields the UI uses:

| Field | Type | UI use |
|---|---|---|
| `id` | string | Card key, detail route param, query key part |
| `eventId` | string | Session/token selection (always the current event) |
| `owner` | `{ participantId, displayName, isOrganizer }` | Detail owner line + organizer badge shown only when the response flag `owner.isOrganizer` is true |
| `isMine` | boolean | Guard: Home excludes own garments even if returned |
| `photos` | `{ id, url }[]` (1–10, order kept, first is main) | Card shows `photos[0]`; detail carousel shows all in order |
| `category` | `top \| outer \| bottom \| other` union | Detail category label (Top/Outer/Bottom/Other) |
| `title` | string (trimmed, 1–100) | Card title (truncated) + detail full title |
| `description` | string (trimmed, 1–1,000) | Detail description only |
| `measurements` | object with 8 nullable fields, or `null` | Detail shows only non-null entries, labelled in inches |
| `status` | `available \| confirmed \| withdrawn` union | Home shows `available` only; detail renders `withdrawn` state |
| `contentVersion` | integer | Displayed nowhere; passed through for later features |
| `analysis` | `null` in this feature | Explicitly not shown (arrives in 018) |
| `createdAt` | ISO string | Newest-first ordering (server already orders `createdAt` descending) |

Validation rules (client, `lib/validation/clothing-response.ts` extension): every field above validated with zod `safeParse`; unknown extra fields tolerated on read (server-owned shape); `photos` must be non-empty for rendering (empty → error state, never blank); measurement values are numbers in `(0, 120]`. Failure → `ApiError(200, 'UNKNOWN_ERROR', ...)` per the existing convention.

### ClothingList (consumed, read-only)

`{ items: Clothing[], nextCursor: null }` from `GET /api/v1/events/{event_id}/clothing?ownership=others&status=available`. No pagination (`nextCursor` always `null`); the UI renders the whole `items` array.

### Measurement labels (derived, client-side)

All eight measurement fields in canonical order (`totalLength, chest, shoulder, sleeve, waist, hem, inseam, thigh`) with labels from the shared `MEASUREMENT_LABELS`; the detail shows every non-null field present in the response (legacy-safe: fields outside the current category are still shown), never zeros. `measurementFieldsFor` is not used for filtering. Label text ends with " (in)".

## Relationships

- Home card → detail: card `id` builds the `items/[itemId]` path; detail loads the same `Clothing` by id. No client-side cache sharing is assumed between list and detail (each has its own query key).
- Garment → owner: the response flag `owner.isOrganizer` drives the badge (display logic only; server enforces authorization). No extra event-data dependency.

## State transitions (observed, not decided)

`available` → `confirmed` / `withdrawn` happen outside this feature. The UI branches only on the returned `status`: `available` renders normally; `withdrawn` renders the withdrawn badge while the disabled coming-soon [Request exchange] stays (FR-019 applies to any detail); `confirmed` never appears on Home (server filters) and needs no special detail handling in this feature.
