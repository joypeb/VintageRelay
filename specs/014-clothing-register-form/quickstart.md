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
- **T007 US1** (local backend :8014 + `next dev` :3014, Paseo browser at 375×667; desktop engine, touch swipe itself not exercised):
  - #1: 5 photos → carousel region 499 px tall; still 499 px after removing one; adding scrolled to "5 / 5"; scrolling to slide 3 showed "3 / 5". Swipe snap on a real touch device not run.
  - #2: 1600×600 photo in a 312×416 frame rendered 1109×416, offset −399 px (even side crop), not stretched.
  - #3: 720×1280 photo rendered 234×416, centered with 39 px each side, no vertical crop.
  - #7: removing the in-view photo 3/5 → "3 / 4" with the neighbour in view; add → newest in view.
  - #10b: closed view covered by the automated "keeps slides but hides actions when the event closes" test; not run manually.
  - Observation: the horizontal scrollbar is visible in a desktop browser; hide it in US2.
  - Review (commit-reviewer, US1): no Critical/High. Accepted: per-slide `role="status"` replaces the single live region; locked [Remove] is rendered disabled (action still blocked). Deferred to US2: memoize the query-cache subscribe callback, hide the desktop scrollbar.
- **T010 US2** (same setup; `(pointer: fine)` true, reduced motion false):
  - #4: arrows visible and vertically centered on the frame (screenshot at 430×800). One Next click sampled per frame: scrollLeft 0→312 at ~1.04 px/ms, reaching 312 at ~300 ms (linear, under 0.5 s); snap restored to `x mandatory` afterwards. 4 rapid Previous clicks from "5 / 5" landed exactly on "1 / 5" (no overshoot); Previous disabled at 1, Next disabled at 5 after 4 clicks (SC-003). Resize 375→430 at slide 3 kept "3 / 5" (scrollLeft 624→734). Scrollbar hidden (`scrollbar-width: none`, 0 px gap).
  - #5: reduced-motion jump covered by the automated "US2 arrows" test; OS setting not toggled manually. Arrow hiding on touch-only devices relies on Tailwind `pointer-fine:`; not run on a touch device.
  - Review (commit-reviewer, US2): no Critical/High. Accepted Low: in reduced-motion mode a second click before re-render can be dropped (no overshoot). The rAF path is covered by manual evidence only.
- **T016 US4** (same setup, 430×800):
  - #8: after [Next], step 2 has 0 images; fields in order Title (counter "0 / 100"), Description ("0 / 1,000"), Category ("Choose a category"), "Measurements (optional, inches)" with "Choose a category first.", then [Register], [Back].
  - #9: Category list shows Top/Outer/Bottom/Other; Outer → Total length/Chest/Shoulder/Sleeve "(in)"; entered 28 / 21.5; [Back] then [Next] kept title (incl. spaces), description, Outer, 28, 21.5; switching to Bottom → Total length 28 kept, Waist/Hem/Inseam/Thigh empty, Chest gone.
  - #10: [Register] → `/events/{id}?registered=1` with "Clothing registered."; `GET /events/{id}/clothing` returned title "Green denim jacket" (trimmed), the description, category `bottom`, measurements `{ totalLength: 28 }` (others null), 2 photos; reopening C2 showed "0 / 10 photos".
  - #10a (SC-005 timed usability with a first-time user, 3 runs): not run — no independent participant available; registration itself took a few seconds end to end.
  - `pnpm build` passed per implementer (with a dummy `NEXT_PUBLIC_API_BASE_URL`); `useSearchParams` wrapped in Suspense.
  - Review (commit-reviewer, US4): no Critical/High. Carried into US5: M1 synchronous double-submit guard; L1 `isLoading` on [Register]; L2 screen test that invalid input sends nothing (already T021 a/b); L3 clear only the edited field's error. Accepted: L4 counters not linked via `aria-describedby`; L5 `.5` rejected client-side (stricter than backend).
- **T019 US3** (same setup, 430×800):
  - #6: tapping "View full photo 1" (1600×600) opened a modal dialog showing the whole photo at 415×156 (uncropped, original ratio), X close button top-right, page behind dimmed with the Lightbox default `blur(2px)` backdrop — photo clearly stands out, so no extra `::backdrop` rule added. Escape closed it; "1 / 2" and both slides unchanged; focus returned to "View full photo 1" (real click). "Overlay unaffected while an upload settles" covered by the automated test, not reproduced manually; real touch device not used.
  - Review (commit-reviewer, US3): no Critical/High. Open: M1 — if the shown photo is auto-removed (compression failure) while the overlay is open, its preview blob URL is revoked and the overlay image breaks (manual Remove is impossible behind the modal); L1 focus has no fallback when the opener slide is gone; L2 no test for fail/remove while open. Decide in Polish.
