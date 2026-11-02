# Contract: Clothing Read (consumed by 016)

**Feature**: specs/016-home-and-item-detail/spec.md · **Plan**: specs/016-home-and-item-detail/plan.md

No new endpoints. This feature consumes two existing clothing-API operations. The shared contract (`docs/rules/dev/common/api-contract.md`) governs format, auth, and errors; `docs/plans/api/06-register-read-clothing.md` is the feature-specific schema reference. Only the consumed subset is documented here.

## 1. List others' available garments (Home grid)

```text
GET /api/v1/events/{event_id}/clothing?ownership=others&status=available
Authorization: Bearer <participantToken>
```

- Response `200 OK`: `{ items: Clothing[], nextCursor: null }`, `items` ordered `createdAt` descending. Other participants' `withdrawn` garments are never listed.
- Errors: `401 UNAUTHENTICATED` (existing unauthenticated handling), `404 NOT_FOUND` (event missing or token belongs to another event), `422 VALIDATION_ERROR` (never sent by this UI; fixed params).
- UI mapping: `items[].photos[0]` → card photo; `items[].title` → card title; `items[].id` → detail link. Items with `isMine === true` are excluded client-side as a guard.

## 2. Read one garment (item detail)

```text
GET /api/v1/clothing/{clothing_id}
Authorization: Bearer <participantToken>
```

- Response `200 OK`: one `Clothing`. A withdrawn garment of another participant returns with `status = withdrawn`.
- Errors: `401 UNAUTHENTICATED`, `404 NOT_FOUND` (garment missing or in another event → not-found state with a way back to Home).

## Frontend additions (new, owned by this feature)

| Addition | Location |
|---|---|
| `listClothing(eventId)` + `useClothingListQuery(eventId)` | `frontend/src/lib/api/clothing.ts` |
| `getClothing(eventId, clothingId)` + `useClothingQuery(eventId, clothingId)` | `frontend/src/lib/api/clothing.ts` |
| `queryKeys.clothingList(eventId)`, `queryKeys.clothing(eventId, clothingId)` | `frontend/src/lib/api/query-keys.ts` |
| Full-`Clothing` zod schema + `parseClothingItem`/`parseClothingList` (register parse untouched) | `frontend/src/lib/validation/clothing-response.ts` |
| `Clothing` / `ClothingList` response types | `frontend/src/types/clothing.ts` (new, events pattern) |
| `routes.itemDetail(eventId, clothingId)` → `/events/[eventId]/items/[clothingId]` | `frontend/src/lib/routes.ts` |
| `B3` page at `items/[itemId]/page.tsx` (routing only) | `frontend/src/app/events/[eventId]/(tabs)/items/[itemId]/page.tsx` |

No error codes are added; `NETWORK_ERROR` / `UNKNOWN_ERROR` normalization is reused.
