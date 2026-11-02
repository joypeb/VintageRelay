# 016 — Home Grid and Item Detail

**Area:** Frontend only (API 06 exists) · **Depends on:** [015](015-app-shell.md) · **Next:** [019](019-ai-search.md), [020](020-exchange-requests.md) · Common steps: [README](README.md#3-spec-kit-run-same-for-every-feature)

## 1. Feature

Turn Home into the marketplace view: other participants' available garments, newest first, two per row with the main photo on top and the title below. Tapping a card opens the item detail (B3) with the photo carousel, category, title, measurements, and description. The exchange button is shown but disabled until 020.

## 2. Scope

**In**
- P2 Home: grid from `GET /api/v1/events/{event_id}/clothing?ownership=others&status=available`; 3:4 main photo (`photos[0]`) and title per card; empty state inviting the participant to register items; loading and error states.
- B3 item detail at `items/[itemId]`: `GET /api/v1/clothing/{clothing_id}`; photo carousel and full-photo overlay reused from 014; category label, title, entered measurements in inches only, description, owner display name with organizer badge; withdrawn garments show their state.
- [Request exchange] visible but disabled with a short "Coming soon" note (enabled in 020).
- Keep the event header and "Clothing registered." status on Home until 017 moves registration return to My items.

**Out:** AI estimates on B3 (018), search (019), exchange requests (020), own items (017).

## 3. References

| Document | Sections |
|---|---|
| [App flow redesign](../../superpowers/specs/2026-11-02-app-flow-redesign-design.md) | 4.1 Home tab and Item detail rows; 5 Home shows only available |
| [Screen flow](../../flows/screen-flow-v1.md) | 4.2 P2, B3 |
| [Mockup v2](../../flows/mockup-flow-v2.html) | Screens 2 (Home) and 3 (item detail) |
| [API 06 Register/read clothing](../api/06-register-read-clothing.md) | 2 List (`ownership`, `status`, visibility, order); 3 Detail; `Clothing` and `Measurements` schemas |
| [API 05 Upload photo](../api/05-upload-photo.md), [Spec 012](../../../specs/012-fix-photo-upload/spec.md) (US1, FR-001) | Photo `url` points at the frontend origin; `frontend/next.config.ts` rewrites `/api/v1/photos/:photoId` to the backend, which is what makes images render |
| [Spec 014](../../../specs/014-clothing-register-form/spec.md) | Carousel and overlay behavior to reuse (3:4 frame, arrows, reduced motion) |
| [Spec 013](../../../specs/013-clothing-category-measure/spec.md) | Category labels and measurement fields per category |
| [Frontend data fetching](../../rules/dev/frontend/data-fetching.md), [error handling](../../rules/dev/frontend/error-handling.md), [styling](../../rules/dev/frontend/styling.md), [project structure](../../rules/dev/frontend/project-structure.md) | Query hooks and keys, error presentation, Astryx grid/cards, route `items/[itemId]` |

## 4. Existing Code

- `frontend/src/components/clothing/PhotoCarousel.tsx` — generic (`items`, `renderMedia`, `getOverlayMedia`), so it can render server `photos[]` directly; `frontend/src/lib/photo/carousel.ts` holds its scroll math.
- `frontend/src/lib/validation/clothing-response.ts` — today parses only `id` from the register response; extend it to the full `Clothing` schema (photos, owner, category, title, measurements, status) for list and detail.
- `frontend/src/lib/api/clothing.ts`, `query-keys.ts` — add list and detail queries next to `registerClothing`.
- `frontend/src/lib/validation/clothing-form.ts` — `measurementFieldsFor(category)` for labels.
- `frontend/src/components/event/EventHomeScreen.tsx` — P2 to extend with the grid.
- Backend (read only): `backend/app/api/routers/events.py` `list_clothing`, `backend/app/api/routers/clothing.py` `get_clothing`, `backend/app/services/clothing.py` `list` → `backend/app/repositories/clothing.py` `list_visible`.

## 5. Already Decided

- Home lists other participants' `available` garments only; confirmed and withdrawn ones do not appear.
- Two columns, 3:4 photo, title below, newest first.
- AI estimates are not shown until 018; [Request exchange] stays disabled until 020.
- No backend change.

## 6. Open Questions for Clarify

- Should Home refresh periodically (for example 15 s) or only on focus and pull-to-refresh?
- Show the owner's display name on Home cards, or only on B3?

## 7. Spec Kit Run

**Specify input**

```text
016 Home grid and item detail (frontend only; backend API 06 already exists).
Home (P2) shows other participants' available garments from GET /api/v1/events/{event_id}/clothing?ownership=others&status=available, newest first, two per row, each card a 3:4 main photo with the title below, with empty, loading, and error states. Tapping a card opens item detail (B3) at items/[itemId] using GET /api/v1/clothing/{clothing_id}: the 014 photo carousel and full-photo overlay, category, title, entered measurements in inches, description, owner name with organizer badge, and withdrawn state when applicable. [Request exchange] is visible but disabled ("Coming soon") until exchange requests ship. Keep the event header and "Clothing registered." status on Home.
Sources: docs/plans/features/016-home-and-item-detail.md, docs/superpowers/specs/2026-11-02-app-flow-redesign-design.md (4.1, 5), docs/flows/screen-flow-v1.md (4.2), docs/flows/mockup-flow-v2.html (screens 2-3), docs/plans/api/06-register-read-clothing.md, specs/014-clothing-register-form/spec.md.
```

**Plan research (explorer):** reuse surface of `PhotoCarousel` (props for read-only server photos vs. local upload items); Astryx grid/card templates (`astryx build "two-column product grid"`); how to extend `clothing-response.ts` to the full `Clothing` shape without breaking the register flow.

## 8. Done When

- Home shows the 2-column grid of others' available items and an empty state when none exist.
- B3 shows all photos in order with the carousel/overlay, and only entered measurements.
- Request button is disabled with the coming-soon note.
- Frontend checks pass; screenshots at 360–430 px; `/impeccable critique` on Home and B3.
