# Implementation Plan: Photo Carousel and Clothing Details Form (C2)

**Branch**: `014-clothing-register-form` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-clothing-register-form/spec.md`

## Summary

Frontend-only change to C2 (`/events/{id}/my-items/new`):

1. **Step 1 carousel**: replace the vertical photo stack with a native horizontal scroll-snap row of fixed 3:4 frames (image fits height, sides cropped). Arrow buttons, shown only for precise pointers, animate the scroll linearly over 300 ms. Astryx `Carousel` is not used because its scrolling is browser-eased, not linear (research R1–R4).
2. **Full photo overlay**: reuse Astryx `Lightbox` (native dialog, blurred backdrop, top-right close, Escape) (R5).
3. **Step 2 form**: Title → Description → Category (Astryx `Selector`) → category-dependent Measurements, no photos. Pure validation/payload helpers; a new `registerClothing` client for the existing 013 endpoint; success goes to event home with a `?registered=1` confirmation (R6–R10).

## Technical Context

**Language/Version**: TypeScript 5 / React 19.3 / Next 16.4

**Primary Dependencies**: Astryx 0.7.4 (`Lightbox`, `Selector`, `TextInput`, `TextArea`, `IconButton`), TanStack Query, Zod, Tailwind v4. No new dependencies.

**Storage**: N/A (browser state only)

**Testing**: Vitest + Testing Library (jsdom) for pure logic and screen behavior; layout, swipe, animation, and blur verified manually at 360–430 px and in a desktop browser

**Target Platform**: Mobile browsers (iOS Safari, Android Chrome); desktop browsers viewing the mobile layout

**Project Type**: Web application (frontend part only)

**Performance Goals**: Arrow slide completes in ~300 ms at 60 fps; no layout growth with photo count

**Constraints**: No backend/API change; reuse 012 queue rules unchanged; English UI text; 15 s register timeout; lengths counted in code points (server rule)

**Scale/Scope**: 1 screen (C2, two steps) + one-line status on event home; ≤ 10 photos

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Exchange integrity | Pass | Server still enforces all registration rules; client validation only mirrors them. |
| II. Test-first | Pass | Failing tests first for `carousel.ts` helpers, `clothing-form.ts`, `clothing.ts` client, step 2 screen behavior, and home status. |
| III. Test scope by risk | Pass | Unit tests for pure logic and form/submit behavior; carousel feel, 3:4 fit, blur verified manually (quickstart). |
| IV. Isolated tests | Pass | API mocked with `vi.mock`; no network. |
| V. Simplicity | Pass | No new dependency, no form library, reuse Lightbox/Selector; the only custom piece is a small scroller needed for linear motion. |

Post-design re-check: still passing, no violations.

## Project Structure

### Documentation (this feature)

```text
specs/014-clothing-register-form/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── c2-ui.md          # C2 step 1/2 UI + register outcomes
└── tasks.md              # /speckit-tasks
```

### Source Code (files touched)

```text
frontend/src/
├── test/match-media.ts                              # new: query-aware matchMedia stub for tests
├── lib/photo/carousel.ts (+ .test.ts)               # new: indexFromScroll, linearScrollAt, nextTarget
├── lib/validation/clothing-form.ts (+ .test.ts)     # new: draft validation (code points), prune, body builder, server error mapping
├── lib/validation/clothing-response.ts              # new: minimal Zod parse of Clothing
├── lib/api/clothing.ts (+ .test.ts)                 # new: registerClothing + mutation hook
├── lib/api/query-keys.ts                            # + registerClothing key
├── components/clothing/PhotoCarousel.tsx            # new: scroller, slides, arrows, Lightbox
├── components/clothing/ClothingDetailsForm.tsx      # new: step 2 fields + submit
├── components/clothing/PhotoUploadScreen.tsx        # use carousel; hold draft; render form (+ test update)
├── components/event/EventHomeScreen.tsx             # "Clothing registered." status (+ test, + cache test mock)
└── app/events/[eventId]/(tabs)/my-items/new/page.test.tsx  # + next/navigation mock
```

**Structure Decision**: Existing `frontend/` layout; new UI split into two components beside `PhotoUploadScreen` so the screen file does not grow past its current 483 lines.

## Complexity Tracking

None.
