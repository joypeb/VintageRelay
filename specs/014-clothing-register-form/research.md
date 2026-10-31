# Research: Photo Carousel and Clothing Details Form (C2)

Sources: explorer report (2026-10-31), `frontend/src/components/clothing/PhotoUploadScreen.tsx`, `frontend/src/lib/photo/queue.ts`, `@astryxdesign/core` 0.7.4 sources, `backend/app/schemas/clothing.py`, `specs/013-clothing-category-measure/contracts/clothing-category-measure.md`.

## R1. Carousel: own small scroller, not Astryx `Carousel`

- **Decision**: Build a small `PhotoCarousel` component: a native horizontal scroller (`overflow-x: auto`, `scroll-snap-type: x mandatory`, each slide `width: 100%`, `aspect-ratio: 3/4`). Touch swipe is the browser's own scroll + snap. Arrow buttons animate `scrollLeft` with `requestAnimationFrame` at constant speed over 300 ms, turning snap off for the duration of the animation and back on at the end.
- **Rationale**: Astryx `Carousel` scrolls with `scroll-behavior: smooth` / `scrollTo({behavior:'smooth'})` (Carousel.tsx:173, 418, 474). Browser smooth scroll has a browser-chosen easing and duration, so it cannot satisfy the user's explicit "linear" requirement (FR-005), and its scroller element is not exposed for a custom animation. With snap left on, Chrome re-snaps every programmatic `scrollLeft` write, which breaks a frame-by-frame animation, hence the temporary snap-off.
- **Alternatives**: Astryx `Carousel` with `hasButtons` (rejected: eased, not linear). A `translateX` track with CSS `transition: transform 300ms linear` (rejected: needs a second, gesture-driven mode for touch, which is more code than native scroll).

## R2. Arrow visibility and reduced motion

- **Decision**: Arrows render always in the DOM but are shown only under CSS `@media (pointer: fine)` (Tailwind v4 `pointer-fine:` variant), hidden otherwise. Reduced motion is read with `window.matchMedia('(prefers-reduced-motion: reduce)').matches` at click time; when true, `scrollLeft` jumps to the target.
- **Rationale**: Matches the spec assumption (pointer capability, not width) with zero JS for visibility; same reduced-motion check Astryx uses internally.
- **Alternatives**: `matchMedia('(pointer: fine)')` in JS (rejected: SSR mismatch and extra state).

## R3. Current slide index

- **Decision**: Derive the in-view index from the scroller: `Math.round(scrollLeft / clientWidth)`, clamped to `[0, count-1]`, updated on `scroll` events. Arrows target `index ± 1` of the *target* index while an animation runs, so rapid clicks advance one step each and never overshoot (edge case). Adding a photo scrolls to the last slide; removing the in-view photo leaves the browser to clamp (the neighbour comes into view).
- **Rationale**: One source of truth (the scroll position) serves swipe and arrows alike.
- **Animation lifecycle**: at most one animation runs (one stored rAF id). An arrow click during an animation cancels it and starts a new one from the current `scrollLeft` toward `nextTarget(index, targetIndex, dir, count)` (steps from the pending target, clamped, so rapid clicks advance one each and never overshoot). A user `pointerdown`, `touchstart`, or `wheel` on the scroller cancels the animation. Unmount cancels it. Every exit path (finish, cancel, unmount) restores `scroll-snap-type` and clears `targetIndex`. On resize, `scrollLeft` is reset to `index * clientWidth` so the in-view photo stays in view.
- **Testing**: `indexFromScroll`, `linearScrollAt(from, to, elapsedMs, durationMs)`, and `nextTarget(index, targetIndex, dir, count)` are pure functions in `src/lib/photo/carousel.ts` with Vitest tests. jsdom has no layout and does not fire `scroll` when `scrollLeft` is set, so screen tests stub `clientWidth`/`scrollLeft` and dispatch `scroll` events themselves; animation smoothness is verified manually.

## R4. Fixed frame and image fit

- **Decision**: Slide frame `aspect-ratio: 3/4`, `overflow: hidden`; image `height: 100%; width: auto; max-width: none`, centered horizontally (flex `justify-content: center`). A wider image overflows equally on both sides and is clipped; a taller-than-3:4 image is narrower than the frame and sits centered with side space (Clarifications Q3). Not `object-fit: cover` (that would crop top/bottom of tall photos).
- **Rationale**: Literal "fit height, crop sides" with plain CSS.

## R5. Full photo overlay: Astryx `Lightbox`

- **Decision**: Use `@astryxdesign/core/Lightbox` in single-media mode (`media={{ src, alt }}`), opened from a button wrapping each slide image.
- **Rationale**: It already provides a native `<dialog>` with `showModal()` (focus trap, top layer, Escape), scroll lock, a top-right close button (Lightbox.tsx:216–220), and a dimmed `blur(2px)` backdrop (Lightbox.tsx:134–137). Its close button label is "Close" (locale `@astryx.lightbox.close`); the spec's accessible name is aligned to "Close" instead of adding a custom overlay.
- **Note**: If the 2px blur looks too weak in the manual check, raise it with one global `::backdrop` rule; no custom component.
- **Image source**: ready photo → server `url`; otherwise local `previewUrl`; photos flagged `displayFailed` do not open it. The `{ src, alt }` is snapshotted when the overlay opens, so an upload finishing, failing, or the photo being removed while it is open does not change or close the overlay.
- **Tests**: reuse `src/test/dialog-polyfill.ts` (jsdom lacks `showModal`).

## R6. Step 2 form state lives in `PhotoUploadScreen`

- **Decision**: The draft (`title`, `description`, `category`, `measurements` as raw strings) is `useState` in `PhotoUploadScreen`, next to the queue reducer, and passed to a new `ClothingDetailsForm` step component. The queue keeps `step` as today.
- **Rationale**: Step 2 unmounts on [Back]; the draft must survive (FR-023). No form library is installed; four fields don't justify one.

## R7. Validation and payload as pure functions

- **Decision**: `src/lib/validation/clothing-form.ts` exports `validateClothingDraft(draft) → fieldErrors`, `buildRegisterClothingBody(draft, photoIds)`, and `measurementFieldsFor(category)` / `pruneMeasurements(category, measurements)`. Rules mirror 013: title trimmed 1–100, no control chars/newlines; description trimmed 1–1,000; category required; each measurement empty or matching `^\d{1,3}(\.\d)?$` with value `> 0` and `<= 120`. Empty measurements → `measurements` omitted.
- **Character counting**: all lengths use Unicode code points (`Array.from(s).length`), matching Pydantic on the server. JS `.length` (UTF-16) and Astryx `TextArea`'s grapheme counter differ for emoji/combining marks, so counters are rendered by our code from the same function, and Astryx `maxLength`/built-in counters are not used.
- **Rationale**: These are the non-trivial logic covered by tests (constitution III); the screen stays thin.

## R8. Registration API call

- **Decision**: New `src/lib/api/clothing.ts` with `registerClothing(eventId, body)` → `apiFetch` `POST /events/{eventId}/clothing` with `{ timeoutMs: REGISTER_CLOTHING_TIMEOUT_MS }` (`15_000`, like the other calls in `events.ts`/`photos.ts`; a timeout becomes `ApiError(0, 'NETWORK_ERROR')`), response parsed by a Zod schema in `src/lib/validation/clothing-response.ts`, and `useRegisterClothingMutation(eventId)` with a key in `query-keys.ts`, following `photos.ts`.
- **Contract source**: backend `ClothingCreate` (backend/app/schemas/clothing.py:42–47) and `specs/013-clothing-category-measure/contracts/clothing-category-measure.md`. `docs/plans/api/06-register-read-clothing.md` is outdated (lacks category/title/measurements); it is a backend doc and is not changed by this frontend feature.

## R9. Error mapping on [Register]

- **Decision**:
  - `VALIDATION_ERROR` → `mapClothingServerFieldErrors(details)` in `clothing-form.ts`, modelled on `mapJoinServerFieldErrors` (`src/lib/validation/join.ts:63`): Zod-parse `details` as `{ fields: [{ field, reason }] }` (api-contract.md:123); malformed/null → form message; each `(field, reason)` looked up in a fixed table (data-model "Server field errors"); unknown pair → form message. A `photoIds` entry → photo-problem state.
  - `PHOTO_ALREADY_ATTACHED` → photo-problem state ("Some photos can no longer be used. Add your photos again." + [Back to photos]) — **unless** an earlier attempt in this C2 session ended with `NETWORK_ERROR`/unknown outcome, in which case → possibly-registered state ("Your clothing may already be registered, so it was not sent again." + [Go to event home]). The POST is not idempotent, so a lost response followed by a retry lands here.
  - `NOT_FOUND` → not-available state ("This event or some photos are no longer available." + [Back to photos] + [Go to event home]); not assumed to be a photo problem, since event scope failures share the code.
  - `EVENT_CLOSED`, `UNAUTHENTICATED` → existing C2 handling from 010.
  - `NETWORK_ERROR` (incl. timeout) / other → existing `error-messages.ts` message plus [Try again] (resubmits the same body) and marks the session as having an uncertain attempt.
- **Rationale**: Reuses existing codes and the join mapper pattern; branches only on `code` and `details.fields`, never `message` (api-contract.md:127).

## R10. Success confirmation on event home

- **Decision**: On success, `router.replace(\`${routes.eventHome(eventId)}?registered=1\`)` (leaving C2 unmounts it, which discards the queue and draft). `EventHomeScreen` shows a one-line `role="status"` "Clothing registered." only when `useSearchParams().get('registered') === '1'`.
- **Rationale**: No toast system exists; a search param is the smallest stateless handoff. `replace` keeps Back from returning to an emptied C2.
- **Shortcut**: the message re-shows on a manual reload of that URL; acceptable for the prototype.

## R11. Tests that change

- `PhotoUploadScreen.test.tsx` step 2 test (lines ~763–787) asserts "Main photo", the placeholder note, and images on step 2; it is replaced by step 2 form tests (no images, field order, submit, errors, back keeps values).
- Step 1 tests that query `getAllByRole('img')` keep passing because all slides stay mounted.
- `src/app/events/[eventId]/(tabs)/my-items/new/page.test.tsx` renders the screen, which now calls `useRouter`; it needs a `next/navigation` mock. `EventHomeScreen.test.tsx` and `EventHomeScreen.cache.test.tsx` need a `useSearchParams` mock.
- jsdom has no `window.matchMedia`, and Astryx `Selector` calls it (with listener subscription). A shared query-aware stub `src/test/match-media.ts` (`matches` per query, `addEventListener`/`removeEventListener`/`addListener`/`removeListener` no-ops, restored after each test) is used by every suite that renders the screen.
