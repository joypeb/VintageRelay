---

description: "Task list for 014 Photo Carousel and Clothing Details Form (C2)"
---

# Tasks: Photo Carousel and Clothing Details Form (C2)

**Input**: Design documents from `/specs/014-clothing-register-form/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/c2-ui.md, quickstart.md

**Tests**: REQUIRED (TDD, constitution II). Each test task is written first by `test-author` and confirmed failing (Red) before the `implementer-fe` task (Green → Refactor). Layout, swipe, animation feel, 3:4 fit, and blur are UI-only and verified manually (constitution III, `docs/rules/dev/frontend/testing.md`); each phase states which parts are manual.

**Organization**: Grouped by user story. Frontend only; allowed paths `frontend/src/**`. Every cycle (AGENTS.md): `test-author` (Red) → `implementer-fe` (Green → Refactor) → orchestrator re-runs checks and records manual evidence → `commit-reviewer` (review only: returns findings, never edits, records, or commits) → orchestrator resolves Critical/High findings with the implementer, gets re-review, then commits. Never commit a Red state. Checks per cycle: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`.

**Test environment notes** (apply to every screen test task): jsdom has no `window.matchMedia` (Astryx `Selector` calls it with listener subscription), no `HTMLDialogElement.showModal` (use existing `src/test/dialog-polyfill.ts`), and does not fire `scroll` when `scrollLeft` is set (stub `clientWidth`/`scrollLeft` on the scroller and dispatch `scroll` manually). Suites rendering `PhotoUploadScreen` mock `next/navigation` (`useRouter`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)

---

## Phase 1: Setup

- [X] T001 Run `cd frontend && pnpm install && pnpm lint && pnpm typecheck && pnpm test` on the branch base and record the baseline result under a new "Implementation evidence" heading in `specs/014-clothing-register-form/quickstart.md` — agent: orchestrator (no code change)

---

## Phase 2: Foundational

Shared test fixture and navigation mocks needed by every later screen test. Test-support only (no production behavior), committed as its own reviewed cycle.

- [X] T002 Create `frontend/src/test/match-media.ts` exporting `installMatchMedia(matches: Record<string, boolean> = {})` that sets `window.matchMedia` to a query-aware stub (`matches: matches[query] ?? false`, `media`, `onchange: null`, no-op `addEventListener`/`removeEventListener`/`addListener`/`removeListener`, `dispatchEvent → false`) and returns a restore function; add a `next/navigation` mock (`useRouter` returning `{ replace: vi.fn(), push: vi.fn() }`) to `frontend/src/app/events/[eventId]/(tabs)/my-items/new/page.test.tsx`, and a `useSearchParams` mock (returning empty `URLSearchParams`) to `frontend/src/components/event/EventHomeScreen.test.tsx` and `frontend/src/components/event/EventHomeScreen.cache.test.tsx` if they do not already mock `next/navigation` — agent: `test-author`. Run the full frontend checks; they must stay green.
- [X] T003 Review and commit T002 — agent: `commit-reviewer` (review only), then orchestrator commits

**Checkpoint**: shared fixtures ready.

---

## Phase 3: User Story 1 — Horizontal fixed-ratio carousel (Priority: P1) 🎯 MVP

**Goal**: Held photos show in one horizontal 3:4 swipe row instead of a vertical stack, in both the active and the closed-event view (spec US1, FR-001–FR-004, FR-008–FR-010).

**Independent Test**: quickstart manual #1–#3, #7, #10b; automated tests below.

**Manual only**: swipe snapping, 3:4 frame, fit-height/crop-sides rendering (jsdom has no layout).

- [ ] T004 [US1] Create `frontend/src/lib/photo/carousel.test.ts` against planned exports of `frontend/src/lib/photo/carousel.ts` (data-model "Carousel position") — agent: `test-author`. Cases: `indexFromScroll(0, 300, 3) → 0`; `(310, 300, 3) → 1` (rounding); `(9999, 300, 3) → 2` (clamp high); `(-50, 300, 3) → 0` (clamp low); `count 0 or slideWidth 0 → 0`; `linearScrollAt(0, 300, 150, 300) → 150` (linear midpoint); `elapsed ≥ duration → to`; `elapsed 0 → from`; works for `to < from`; `nextTarget(0, null, 1, 3) → 1`; `nextTarget(0, 1, 1, 3) → 2` (steps from pending target); `nextTarget(2, null, 1, 3) → 2` and `nextTarget(0, null, -1, 3) → 0` (clamp, no wrap); `nextTarget(1, 2, -1, 3) → 1` (reverse from pending target); `SLIDE_DURATION_MS === 300`. Run and confirm failure (module missing).
- [ ] T005 [US1] Add a "US1 carousel" `describe` to `frontend/src/components/clothing/PhotoUploadScreen.test.tsx` — agent: `test-author`, using `installMatchMedia()` and the existing upload mocks: after adding 3 photos, a region named "Photo carousel" contains 3 slides labelled "Photo 1 of 3" … "Photo 3 of 3" in add order, all images mounted; the position text reads "3 / 3" (adding scrolls to the newest photo); after stubbing the scroller's `clientWidth` = 300 and `scrollLeft` = 0 and dispatching `scroll`, it reads "1 / 3"; with 1 photo no "N / M" text; each slide still shows its own status ("Waiting") and [Remove]/[Try again] per 012 lock rules; [Add photo] and [Next] remain rendered; in the closed-event state the same region and slides render with no [Remove], [Try again], [Add photo], or [Next]. Keep existing step 1 tests green, except migrate the existing closed-state assertion that requires a disabled [Remove] (~line 402) to assert [Remove] is absent, keeping its checks for preserved photo identity, image-load fallback, and no additional upload. Run and confirm the new cases fail.
- [ ] T006 [US1] Implement — agent: `implementer-fe`: create `frontend/src/lib/photo/carousel.ts`; create `frontend/src/components/clothing/PhotoCarousel.tsx` per `contracts/c2-ui.md` Step 1 item 4 and research R1, R3, R4 — region `aria-label="Photo carousel"` (the file input keeps "Clothing photos"), native `overflow-x: auto` scroller with `scroll-snap-type: x mandatory`, each slide full width with `aspect-ratio: 3/4`, `overflow: hidden`, image `height: 100%; width: auto; max-width: none` centered (taller-than-3:4 photos centered with side space, never cropped top/bottom); index from `scroll` events via `indexFromScroll`; scroll to the last slide when a photo is added; on resize set `scrollLeft = index * clientWidth`; per-item status/actions via a render prop. In `frontend/src/components/clothing/PhotoUploadScreen.tsx`, replace both vertical stacks — the active map (~line 464) and the closed-event map (~line 398) — with `<PhotoCarousel>` (closed view passes no actions). No arrows yet. Run frontend checks.
- [ ] T007 [US1] Orchestrator re-runs checks, manually runs quickstart #1–#3, #7, #10b at 360 px and 430 px, and records results in `specs/014-clothing-register-form/quickstart.md`. Then review T004–T006 — agent: `commit-reviewer` (review only) — and orchestrator commits

---

## Phase 4: User Story 2 — Desktop arrows with linear slide (Priority: P1)

**Goal**: Precise-pointer devices get Previous/Next arrows that slide one photo linearly in ~300 ms (spec US2, FR-005–FR-007).

**Independent Test**: quickstart manual #4–#5; automated tests below.

**Depends on**: US1 (`PhotoCarousel.tsx`).

**Manual only**: `(pointer: fine)` visibility, animation smoothness/linearity and timing (SC-003), resize behavior.

- [ ] T008 [US2] Add a "US2 arrows" `describe` to `frontend/src/components/clothing/PhotoUploadScreen.test.tsx` — agent: `test-author`, with `installMatchMedia({ '(prefers-reduced-motion: reduce)': true })` so moves jump synchronously, and the scroller's `clientWidth` stubbed to 300 with a writable `scrollLeft` (dispatch `scroll` after each change if the component relies on it): after adding 3 photos the view is "3 / 3" and "Next photo" is disabled; clicking "Previous photo" twice reaches "1 / 3" and disables "Previous photo"; clicking "Next photo" once reaches "2 / 3"; arrows activate with Enter and Space; with 1 photo neither arrow is rendered. Run and confirm failure.
- [ ] T009 [US2] Implement in `frontend/src/components/clothing/PhotoCarousel.tsx` — agent: `implementer-fe`: Astryx `IconButton`s "Previous photo" (`chevronLeft`) / "Next photo" (`chevronRight`) on the left/right edges, vertically centered on the frame, rendered only when count ≥ 2 and shown only under Tailwind `pointer-fine:` (hidden otherwise); disabled at first/last (no wrap); target = `nextTarget(index, targetIndex, dir, count)`; if `matchMedia('(prefers-reduced-motion: reduce)').matches`, set `scrollLeft` directly; otherwise animate with `requestAnimationFrame` using `linearScrollAt` over `SLIDE_DURATION_MS`, with `scroll-snap-type: none` during the animation. Lifecycle per research R3: one stored rAF id; a new click cancels and restarts from the current `scrollLeft`; `pointerdown`/`touchstart`/`wheel` on the scroller cancels; unmount cancels; every exit restores snap and clears `targetIndex`. Run frontend checks.
- [ ] T010 [US2] Orchestrator re-runs checks, manually runs quickstart #4–#5 in a desktop browser (incl. 5 photos / 4 clicks timing and resize) and confirms arrows are absent in touch emulation; records results. Then review T008–T009 — agent: `commit-reviewer` (review only) — and orchestrator commits

---

## Phase 5: User Story 4 — Step 2 details form and registration (Priority: P1)

**Goal**: Step 2 shows Title → Description → Category → Measurements (no photos) and registers the garment (spec US4, FR-014–FR-021, FR-023).

**Independent Test**: quickstart manual #8–#10a; automated tests below.

**Independent of**: US1–US3 in code; starts after the Phase 4 commit because it edits the same screen files.

- [ ] T011 [P] [US4] Create `frontend/src/lib/validation/clothing-form.test.ts` against planned exports of `frontend/src/lib/validation/clothing-form.ts` (data-model "Clothing details draft", "Field errors", "Register request") — agent: `test-author`:
  - `validateClothingDraft`: title "trimmed length 1–100 code points; no control characters (incl. newline)" → `''`/`'   '` → "Enter a title.", 100 chars ok, 101 → "Use 100 characters or fewer.", 100 × `'😀'` ok and 101 × `'😀'` → too long (code points, not UTF-16), `'a\nb'` → "Use a single line without special characters."; description "trimmed length 1–1,000 code points" → empty → "Enter a description.", 1,000 ok, 1,001 → "Use 1,000 characters or fewer."; category `''` → "Choose a category."; measurements "each empty or `^\d{1,3}(\.\d)?$` with `0 < value <= 120`": `'0'`, `'120.1'`, `'32,5'`, `'abc'`, `'32.55'` → "Enter a number from 0.1 to 120."; `'0.1'`, `'120'`, `'32.5'`, `' 32 '` (trimmed), `''` → no error.
  - `codePointLength('😀a') → 2`; `codePointLength('é') → 2` (combining mark counts as its own code point).
  - `measurementFieldsFor`: top/outer → `['totalLength','chest','shoulder','sleeve']`; bottom → `['totalLength','waist','hem','inseam','thigh']`; other/`''` → `[]`.
  - `pruneMeasurements('bottom', { totalLength: '28', chest: '20' }) → { totalLength: '28' }`; `('other', …) → {}`.
  - `buildRegisterClothingBody(draft, ['p1','p2'])`: keeps photo order, trims title/description, includes only entered measurements as numbers (`'21.5' → 21.5`), omits the `measurements` key entirely when none entered.
  Run and confirm failure.
- [ ] T012 [P] [US4] Create `frontend/src/lib/api/clothing.test.ts` against planned `registerClothing(eventId, body)` in `frontend/src/lib/api/clothing.ts` (research R8), mocking `@/lib/api/client` like `photos.test.ts` — agent: `test-author`: calls `apiFetch(eventId, '/events/{encoded eventId}/clothing', { method: 'POST', body: JSON.stringify(body) }, { timeoutMs: 15000 })`; returns the parsed clothing (at least `id`); a response missing `id` throws `ApiError(200, 'UNKNOWN_ERROR')`; an `ApiError` from `apiFetch` (incl. `NETWORK_ERROR`) is rethrown unchanged. Run and confirm failure.
- [ ] T013 [P] [US4] Add cases to `frontend/src/components/event/EventHomeScreen.test.tsx` — agent: `test-author`, first refactor the T002 `useSearchParams` mock to a hoisted `vi.fn` (T003 review Low-2) and override it per case: `registered=1` → a `role="status"` "Clothing registered." is shown; `registered=0` and no param → not shown. Run and confirm failure.
- [ ] T014 [US4] Replace the step 2 placeholder test in `frontend/src/components/clothing/PhotoUploadScreen.test.tsx` (~lines 763–787: "Main photo", placeholder note, images) with a "US4 details form" `describe` — agent: `test-author`, using `installMatchMedia()` and mocking `@/lib/api/clothing` and `next/navigation`'s `useRouter` with hoisted shared `replace`/`push` fns (repo pattern, e.g. `CreateEventScreen.test.tsx`; T003 review Low-1): after [Next], no `img` role and no "Main photo"; fields appear in DOM order Title, Description, Category, Measurements; title counter shows "0 / 100" and updates as typed (code points), description counter "0 / 1,000"; Category offers exactly Top, Outer, Bottom, Other; dismissing the list without choosing keeps the previous value; no measurement inputs and "Choose a category first." before choosing; Top → Total length/Chest/Shoulder/Sleeve "(in)" inputs; Other → none and "No measurements needed for this category."; Top with chest '21' and total length '28' then switch to Bottom → chest gone, total length '28' kept; valid submit calls `registerClothing` once with `{ photoIds (queue order), category, title (trimmed), description (trimmed), measurements only if entered }`; [Register] is busy/disabled and [Back] disabled while pending; on success `router.replace('/events/{id}?registered=1')`; [Back] then [Next] keeps all entered values. Run and confirm failure.
- [ ] T015 [US4] Implement — agent: `implementer-fe`:
  - `frontend/src/lib/validation/clothing-form.ts` (T011 exports incl. `codePointLength`; messages exactly as data-model "Field errors"; lengths via code points).
  - `frontend/src/lib/validation/clothing-response.ts` minimal Zod schema; `frontend/src/lib/api/clothing.ts` `registerClothing` with `REGISTER_CLOTHING_TIMEOUT_MS = 15_000` + `useRegisterClothingMutation(eventId)`; add a `registerClothing` key to `frontend/src/lib/api/query-keys.ts`.
  - `frontend/src/components/clothing/ClothingDetailsForm.tsx` per `contracts/c2-ui.md` Step 2: Astryx `TextInput` for title (Astryx `TextInput` has no `maxLength`/`inputMode` props — do not pass them) with our own "N / 100" counter; Astryx `TextArea` for description without its `maxLength`/built-in counter, with our own "N / 1,000" counter (both via `codePointLength`); Astryx `Selector` for category (placeholder "Choose a category"); Astryx `TextInput` per measurement field labelled "<Label> (in)"; [Register] (busy "Registering…") and [Back] (disabled while pending); on category change apply `pruneMeasurements`.
  - `frontend/src/components/clothing/PhotoUploadScreen.tsx`: hold the draft in `useState` (survives [Back]); step 2 renders `ClothingDetailsForm` (remove `STEP2_NOTE` and step 2 images); on submit validate, build the body from ready photo ids in queue order, call the mutation, on success `router.replace(\`${routes.eventHome(eventId)}?registered=1\`)`.
  - `frontend/src/components/event/EventHomeScreen.tsx`: show `role="status"` "Clothing registered." only when `useSearchParams().get('registered') === '1'` (shortcut: re-shows on manual reload of that URL; acceptable for the prototype).
  Run frontend checks.
- [ ] T016 [US4] Orchestrator re-runs checks and manually runs quickstart #8–#10a against a local backend (incl. reopening C2 empty and the 3-run timed check, every run < 60 s); records results. Then review T011–T015 — agent: `commit-reviewer` (review only) — and orchestrator commits

---

## Phase 6: User Story 3 — Full photo overlay (Priority: P2)

**Goal**: Tapping a photo opens the whole photo in Astryx `Lightbox` over a blurred backdrop; X/Escape returns to step 1 unchanged (spec US3, FR-011–FR-013).

**Independent Test**: quickstart manual #6; automated tests below.

**Depends on**: US1 (`PhotoCarousel.tsx`).

**Manual only**: backdrop blur strength, uncropped fit.

- [ ] T017 [US3] Add a "US3 overlay" `describe` to `frontend/src/components/clothing/PhotoUploadScreen.test.tsx` — agent: `test-author`, importing `src/test/dialog-polyfill.ts` and using `installMatchMedia()`: clicking "View full photo 1" opens a dialog containing an image with the photo's `url` when ready (else `previewUrl`); the dialog has a "Close" button; clicking it (and, separately, pressing Escape) closes the dialog, the slides, statuses, and "N / M" are unchanged, and focus returns to the "View full photo 1" button; while the overlay shows a non-ready photo, resolving its upload does not change the dialog image `src` or close it; a photo whose image failed to display (012 `displayFailed`) has no "View full photo" button. Run and confirm failure.
- [ ] T018 [US3] Implement in `frontend/src/components/clothing/PhotoCarousel.tsx` — agent: `implementer-fe`: wrap each displayable slide image in a button `aria-label="View full photo N"`; one `@astryxdesign/core/Lightbox` in single-media mode with `media` snapshotted into state on open (`{ src, alt: 'Clothing photo N' }`), `isOpen`/`onOpenChange`; return focus to the opening button on close (research R5). If the default `blur(2px)` backdrop is visibly too weak in the manual check, add one global `::backdrop` rule in `frontend/src/styles/globals.css` scoped to the lightbox. Run frontend checks.
- [ ] T019 [US3] Orchestrator re-runs checks and manually runs quickstart #6 on phone width and desktop; records results. Then review T017–T018 — agent: `commit-reviewer` (review only) — and orchestrator commits

---

## Phase 7: User Story 5 — Step 2 errors and failures (Priority: P2)

**Goal**: Field-level messages, server error mapping, and retry, keeping all values (spec US5, FR-019, FR-022).

**Independent Test**: quickstart manual #11; automated tests below.

**Depends on**: US4.

- [ ] T020 [P] [US5] Add `mapClothingServerFieldErrors` cases to `frontend/src/lib/validation/clothing-form.test.ts` per data-model "Server field errors" — agent: `test-author`: every table row; `{ fields: [{ field: 'photoIds', reason: 'invalid' }] }` → `photoProblem: true`; `measurements.chest` + `unknown_field` and `measurements` + `invalid` → form message; unknown field/reason → form message; `null`, `{}`, `{ fields: 'x' }` → `{ fieldErrors: {}, formError: 'Check your entries and try again.', photoProblem: false }`; first message per field wins. Run and confirm failure.
- [ ] T021 [US5] Add a "US5 errors" `describe` to `frontend/src/components/clothing/PhotoUploadScreen.test.tsx` — agent: `test-author`, per `contracts/c2-ui.md` "Register outcomes", using `installMatchMedia()`: (a) submit with empty title, empty description, no category → no `registerClothing` call, the three required messages, focus on Title; (b) separately choose Top and enter chest '0' with otherwise valid fields → no call, Chest shows "Enter a number from 0.1 to 120."; (c) `ApiError(422, 'VALIDATION_ERROR', …, { fields: [{ field: 'title', reason: 'too_long' }, { field: 'measurements.chest', reason: 'invalid' }] })` → messages on Title and Chest; (d) `PHOTO_ALREADY_ATTACHED` first attempt → "Some photos can no longer be used. Add your photos again." with [Back to photos] returning to step 1; (e) `NOT_FOUND` → "This event or some photos are no longer available." with [Back to photos] and [Go to event home]; (f) first attempt `ApiError(0, 'NETWORK_ERROR')` shows the existing message + [Try again]; [Try again] calls `registerClothing` again with the same body; if that returns `PHOTO_ALREADY_ATTACHED` → "Your clothing may already be registered, so it was not sent again." with [Go to event home]; (g) `EVENT_CLOSED` / `UNAUTHENTICATED` → the same text the screen already shows for these codes; in every case entered values remain. Run and confirm failure.
- [ ] T022 [US5] Implement in `frontend/src/lib/validation/clothing-form.ts` (`mapClothingServerFieldErrors`, modelled on `mapJoinServerFieldErrors` in `frontend/src/lib/validation/join.ts:63`), `frontend/src/components/clothing/ClothingDetailsForm.tsx`, and `frontend/src/components/clothing/PhotoUploadScreen.tsx` — agent: `implementer-fe`: client-side field errors with focus on the first invalid field; `registerOutcome` / `hadUncertainAttempt` state per data-model and research R9; reuse existing closed/unauthenticated handling and `error-messages.ts`; [Try again] resubmits the same body; never clear values on failure. Run frontend checks.
- [ ] T023 [US5] Orchestrator re-runs checks and manually runs quickstart #11; records results. Then review T020–T022 — agent: `commit-reviewer` (review only) — and orchestrator commits

---

## Phase 8: Polish & Cross-Cutting

- [ ] T024 Run the full suites: `cd frontend && pnpm lint && pnpm typecheck && pnpm test` and `cd backend && uv run ruff format --check . && uv run ruff check --no-cache . && uv run mypy app && uv run pytest` (backend unchanged; regression guard). Record actual results in `specs/014-clothing-register-form/quickstart.md` — agent: orchestrator
- [ ] T025 Confirm all new UI strings are English (FR-024) and touch targets are ≥ 44×44 px at 360 px width — agent: orchestrator; then `pr-reviewer` before PR work (AGENTS.md)

---

## Dependencies & Execution Order

- Setup (T001) → Foundational (T002–T003) → all stories.
- US1 (T004–T007) → US2 (T008–T010) and US3 (T017–T019) (same `PhotoCarousel.tsx`).
- US4 (T011–T016) independent of US1–US3 in code; starts after the previous cycle's commit (shared screen files).
- US5 (T020–T023) → after US4.
- Polish (T024–T025) last.

Suggested order: T001 → Foundational → US1 → US2 → US4 → US3 → US5 → Polish.

## Parallel Opportunities

- Only within a cycle, so no other cycle's Red tests sit in the workspace during a commit gate: T011, T012, T013 [P] together (different new/separate files), then T014; T020 alongside T021's authoring.
- One `implementer-fe` per workspace at a time (AGENTS.md); the shared screen file makes separate workspaces not worth it here.

## Implementation Strategy

- **MVP**: US1 (carousel) — fixes the main scrolling complaint on its own.
- Then US2 (desktop demo usability) and US4 (finish registration end to end) — both P1.
- Then P2s: US3 overlay, US5 error polish.
- Each phase ends with recorded manual checks, a review, and an orchestrator commit.
