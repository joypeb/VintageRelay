# Quickstart: Validate 014 (C2 carousel + details form)

## Prerequisites

- Backend with 011–013 merged running locally; frontend `pnpm dev` (photo URLs proxied per 012).
- An active event joined as a participant (create one via S0 → H1, or join with a code).
- Test photos: one 3:4 portrait, one wide landscape/panorama, one 9:16 screenshot, plus enough to reach 10.

## Automated checks

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

Expected new/updated suites pass:

- `src/lib/photo/carousel.test.ts` — `indexFromScroll` clamping, `linearScrollAt` linear midpoint and end clamp, `nextTarget` stepping from a pending target and clamping.
- `src/lib/validation/clothing-form.test.ts` — title/description boundaries (1, 100/1,000, 101/1,001, whitespace, newline), category required, measurement boundaries (0, 0.1, 120, 120.1, "32,5", "abc", two decimals), code-point counting (100 × "😀" accepted, 101 rejected; combining marks count per code point), `pruneMeasurements` on category change, body omits empty measurements and keeps photo order, `mapClothingServerFieldErrors` table incl. malformed details.
- `src/lib/api/clothing.test.ts` — POST path/body, 15 s `timeoutMs`, response parse, `ApiError` passthrough.
- `src/components/clothing/PhotoUploadScreen.test.tsx` — step 2 shows no images and fields in order Title → Description → Category → Measurements; measurement inputs follow category; invalid submit sends nothing; 422 field mapping; photo-problem / not-available / maybe-registered messages; network [Try again]; [Back] then [Next] keeps values; success navigates to `/events/{id}?registered=1`.
- `EventHomeScreen` test — "Clothing registered." status shown only when `registered=1` (not for `registered=0` or no param).

## Manual checks (360–430 px, plus a desktop browser)

| # | Steps | Expected |
|---|---|---|
| 1 | 375×667 touch emulation: add 1 photo, measure the carousel region height; add up to 10 | Carousel height unchanged (SC-001); swipe snaps one photo; "N / M" updates; no arrows |
| 2 | Wide photo | Fills height, sides cropped evenly, not stretched |
| 3 | 9:16 screenshot | Fills height, centered with side space, no top/bottom crop |
| 4 | Desktop with mouse, 5 photos, go to photo 1 | Arrows on both edges; 4 clicks reach photo 5, each slide at constant speed and under 0.5 s (SC-003); prev disabled on 1st, next on last; rapid clicks never overshoot; resizing keeps the photo in view |
| 5 | OS reduced motion on, click arrow | Jumps without animation |
| 6 | Tap a photo while another uploads | Full uncropped photo, blurred dimmed backdrop, X top-right; overlay unaffected when the upload finishes; X / Escape closes; same photo in view; focus back on the photo |
| 7 | Remove the in-view photo; add a photo | Neighbour shown; new photo appended and scrolled into view |
| 8 | [Next] | Step 2 has no photos; Title, Description, Category, Measurements in order |
| 9 | Category list → Top, enter chest; switch to Bottom | Fields change; chest cleared, total length kept |
| 10 | Register valid garment; then open C2 again | Lands on event home with "Clothing registered."; garment returned by `GET /events/{id}/clothing` with photos in order and entered fields; reopened C2 starts empty |
| 10a | Timed (SC-005): with ready photos, time from tapping [Next] to the home confirmation, 3 runs by someone who has not used the form | Every run under 60 s |
| 10b | Close the event in another tab while photos are held | Closed view shows the same carousel, read-only |
| 11 | Stop backend, press [Register] | Error with [Try again]; values kept |

## Implementation evidence

- **T001 baseline** (2026-10-31, base `b312f89`): `pnpm lint` 0 errors / 13 warnings (pre-existing); `pnpm typecheck` pass; `pnpm test` 31 files / 434 tests passed.
