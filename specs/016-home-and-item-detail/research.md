# Research: 016 Home Grid and Item Detail

**Feature**: specs/016-home-and-item-detail/spec.md · **Plan**: specs/016-home-and-item-detail/plan.md

All unknowns resolved from the codebase, the agreed API contract, and frontend rules. A read-only explorer cross-check (report 2026-11-02) is folded in below.

## 1. PhotoCarousel reuse for server photos

- **Decision**: Reuse `frontend/src/components/clothing/PhotoCarousel.tsx` unchanged. The detail maps server `photos[]` to `items` of `{ key: photo.id, ...photo }`, passes `renderMedia` rendering a read-only `<img src={photo.url}>` with an `onError` fallback (same `displayFailed` pattern as `PhotoUploadScreen.tsx:462-473`), and `getOverlayMedia` returning `{ src: photo.url, alt: title }` (null when the image failed, so no overlay opens). No `renderBelow` (no per-photo actions on detail).
- **Rationale**: The carousel is already generic (`items`, `renderMedia`, `getOverlayMedia`; PhotoCarousel.tsx:23-28). All 014 behaviors come free: 3:4 frame (`aspect-[3/4]`, :161), arrows on precise pointers only (`pointer-fine:block`, :182-190), position indicator (:200-204), linear slide with reduced-motion fallback (:94-97), and the `Lightbox` overlay with focus restore (:205-211).
- **Alternatives considered**: Copying the carousel into the detail — rejected; duplicates ~200 lines for zero behavior gain.
- **Note**: Server photo `url`s point at the frontend origin (`next.config.ts` rewrites `/api/v1/photos/:photoId` to the backend), so `<img src={photo.url}>` renders with no URL massaging.

## 2. Extending clothing-response.ts without breaking register

- **Decision**: Keep `parseClothing` / `RegisteredClothing` untouched; add a full-`Clothing` zod schema with `parseClothingItem` and `parseClothingList` (`items: z.array(...)`) in the same module. Response types (`Clothing`, `ClothingList`) go in a new `frontend/src/types/clothing.ts`, mirroring the events pattern (types in `src/types/`, schemas + parse in `lib/validation/`).
- **Rationale**: `registerClothing` (clothing.ts:11-22) and its tests depend on the id-only parse; additive exports carry zero regression risk. The `src/types/<domain>.ts` placement follows data-fetching rules; the events precedent (`types/event.ts` + `validation/event-response.ts`) shows the split.
- **Rationale**: `registerClothing` (clothing.ts:11-22) and its tests depend on the id-only parse; additive exports carry zero regression risk. List/detail parse failures map to the existing `ApiError(200, 'UNKNOWN_ERROR', ...)` convention (clothing-response.ts:11-18).
- **Alternatives considered**: Extending the single schema — rejected; it would change what register accepts and force updates to the register flow and its tests. A `filters` param on the list key/fetcher (for future search reuse) — rejected; list params are fixed in this feature and search (019) adds its own.

## 3. List/detail queries follow the useEventQuery pattern

- **Decision**: Add `listClothing(eventId)` / `getClothing(eventId, clothingId)` fetchers plus `useClothingListQuery` / `useClothingQuery` in `lib/api/clothing.ts`, with `queryKeys.clothingList(eventId)` / `queryKeys.clothing(eventId, clothingId)` factories. `apiFetch(eventId, path, {}, { timeoutMs })` like `getEvent` (events.ts:50-58). Refresh: `staleTime: 0` so focus return always re-reads, `refetchOnWindowFocus: true`, no `refetchInterval` (spec: no polling); the grid's pull-to-refresh gesture is wired to the list query `refetch()`. Retry helper mirrors `shouldRetryEventQuery` (no retry on `UNAUTHENTICATED`/`NOT_FOUND`).
- **Rationale**: Matches data-fetching rules (one client, domain module, key factories, colocated hooks) and the proven `useEventQuery` shape.
- **Alternatives considered**: Sharing one query between list and detail via cache — rejected; separate keys are simpler and each screen refetches on focus independently.

## 4. Home grid slot in EventHomeScreen

- **Decision**: Render `HomeClothingGrid` below the [Register my clothes] button (EventHomeScreen.tsx:95-103) inside the existing `VStack`, still gated by the same `hasSession`/error branches (EventHomeScreen.tsx:31-78). Header and "Clothing registered." stay untouched.
- **Rationale**: Smallest diff; the grid inherits the screen's session gating and error handling.
- **Alternatives considered**: A separate HomeGridScreen replacing EventHomeScreen — rejected; would duplicate header/session logic.

## 5. items/[itemId] route

- **Decision**: Add `frontend/src/app/events/[eventId]/(tabs)/items/[itemId]/page.tsx` as a routing-only server component awaiting `params` (Next.js 16) and passing `{ eventId, itemId }` to client `ClothingDetailScreen`, exactly like the `(tabs)/page.tsx` → `EventHomeScreen` split. Add `routes.itemDetail(eventId, clothingId)` builder. This path is already reserved in project-structure.md (`items/[itemId]/page.tsx → B3`). The `(tabs)` layout gives the tab bar and event context for free.
- **Rationale**: Follows the routing-only rule; session-dependent fetching stays client-side.
- **Alternatives considered**: None — the mapping is prescribed.

## 6. Astryx grid template

- **Decision**: The implementer scaffolds from the `product-gallery` page template (`GridGalleryExample` block), keeps the template frame/gap/padding, and composes Astryx `Grid` (`columns={2}`), `ClickableCard` (whole-card tap → detail via `href`), `EmptyState` (title + description + register action), and `Skeleton` (3:4 loading boxes). Inspect props via `pnpm exec astryx component <Name>` and verify with `astryx doctor --built`. Cards show photo on top, title below; no `div`-based layout.
- **Rationale**: Explorer-confirmed component set; avoids hand-rolled grid CSS that would violate styling rules. (StyleX-based templates are not used unchanged — structure with components + Tailwind per styling.md.)
- **Alternatives considered**: Hand-rolled Tailwind grid — rejected; Astryx cards/badges are required where available.
- **Alternatives considered**: Hand-rolled Tailwind grid — rejected; Astryx cards/badges are required where available.

## 7. Measurement labels

- **Decision**: Detail shows every non-null measurement field present in the response in canonical field order (`totalLength, chest, shoulder, sleeve, waist, hem, inseam, thigh`), each labelled in inches (e.g. `Chest (in)`) from the shared `MEASUREMENT_LABELS`. `measurementFieldsFor(category)` is NOT used to filter: legacy responses may carry fields outside the current category, and the spec requires showing all values present in the response.
- **Rationale**: Single source of category→field mapping; display-only use cannot corrupt the form.

## 8. Loading/error/not-found presentation

- **Decision**: Reuse `<EventScreenStatus kind="no-access" />` directly for unauthenticated access. For the rest, follow its pattern (Banner + [Try again] + `role="alert"`, EventScreenStatus.tsx:12-58) in a clothing-domain status block, because its not-found copy is event-specific: detail 404 gets item copy ("This clothing item could not be found.") with a way back Home; query failure gets inline error + retry (`refetch`); `withdrawn` is not an error (200 with `status: withdrawn`) and renders as a badge/banner on the detail while the disabled coming-soon [Request exchange] stays (FR-019 applies to any detail).
- **Rationale**: Satisfies error-handling rules (inline query errors, `error.message` copy, `notFound()`-equivalent empty UI) with correct copy per situation.
- **Alternatives considered**: Reusing `EventScreenStatus` wholesale — rejected for 404/withdrawn; its messages would mislead on a clothing screen.

## 9. Backend response shapes (read-only check)

- **Decision**: Trust the agreed contract (`docs/plans/api/06-register-read-clothing.md`): list ordered `createdAt` descending, `nextCursor: null`, full `Clothing` with photos in order, null for unentered measurements, `owner.isOrganizer`, withdrawn detail returns `status = withdrawn`.
- **Rationale**: No backend change in this feature; validation tolerates the documented shape. Explorer verified the routers against the implementation (`events.py:155-164 list_clothing`, `clothing.py:22-25 get_clothing`, `schemas/clothing.py:148-167`, `repositories/clothing.py:42-65 list_visible`): others-only + withdrawn excluded + `created_at desc` on list, withdrawn detail as 200 with `status = withdrawn`, missing/other-event as 404 — a 100% match with the spec and contract.
- **Alternatives considered**: None.
